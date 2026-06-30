import express from 'express';
import Order from '../models/Order.js';
import Referral from '../models/Referral.js';
import UploadRecord from '../models/UploadRecord.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { notifyOrderReady } from '../services/notificationService.js';
import { getViewUrl, deleteStoredFile } from '../services/storageService.js';

const router = express.Router();

router.use(adminAuth);

// GET /api/admin/orders — all orders with filters
router.get('/orders', async (req, res, next) => {
  try {
    const { status, paymentStatus, page = 1, limit = 50, search } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (paymentStatus) filter['payment.status'] = paymentStatus;
    if (search) {
      filter.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { 'student.name': { $regex: search, $options: 'i' } },
        { 'student.email': { $regex: search, $options: 'i' } },
        { 'student.matricNumber': { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Order.countDocuments(filter),
    ]);

    res.json({ success: true, data: orders, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/stats — dashboard summary
router.get('/stats', async (req, res, next) => {
  try {
    const [total, pending, confirmed, printing, ready, collected, revenue] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ status: 'pending' }),
      Order.countDocuments({ status: 'confirmed' }),
      Order.countDocuments({ status: 'printing' }),
      Order.countDocuments({ status: 'ready' }),
      Order.countDocuments({ status: 'collected' }),
      Order.aggregate([
        { $match: { 'payment.status': 'paid' } },
        { $group: { _id: null, total: { $sum: '$pricing.totalAmount' } } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        orders: { total, pending, confirmed, printing, ready, collected },
        revenue: revenue[0]?.total ?? 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/orders/:orderId/status — update order status
router.patch('/orders/:orderId/status', async (req, res, next) => {
  try {
    const { status, adminNotes, estimatedReadyAt } = req.body;
    const validStatuses = ['pending', 'confirmed', 'printing', 'ready', 'collected', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    order.status = status;
    if (adminNotes) order.adminNotes = adminNotes;
    if (estimatedReadyAt) order.estimatedReadyAt = new Date(estimatedReadyAt);
    await order.save();

    if (status === 'ready') {
      await notifyOrderReady(order);
    }

    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/orders/:orderId — cancel / soft-delete
router.delete('/orders/:orderId', async (req, res, next) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    order.status = 'cancelled';
    await order.save();

    res.json({ success: true, message: 'Order cancelled' });
  } catch (err) {
    next(err);
  }
});

// ── FILE MANAGEMENT ROUTES ───────────────────────────────

// GET /api/admin/files — paginated list of all upload records
router.get('/files', async (req, res, next) => {
  try {
    const { email, page = 1, limit = 50 } = req.query;
    const filter = { status: 'active' };
    if (email) filter.studentEmail = { $regex: email.trim(), $options: 'i' };
    const skip = (Number(page) - 1) * Number(limit);
    const [records, total] = await Promise.all([
      UploadRecord.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      UploadRecord.countDocuments(filter),
    ]);
    res.json({ success: true, data: records, total });
  } catch (err) { next(err); }
});

// GET /api/admin/files/:id/view — generate a time-limited view URL
router.get('/files/:id/view', async (req, res, next) => {
  try {
    const record = await UploadRecord.findById(req.params.id);
    if (!record || record.status === 'deleted') {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    const viewUrl = await getViewUrl(record.storedKey);
    res.json({ success: true, data: { viewUrl, name: record.originalName } });
  } catch (err) { next(err); }
});

// DELETE /api/admin/files/:id — remove a file from storage + mark deleted
router.delete('/files/:id', async (req, res, next) => {
  try {
    const record = await UploadRecord.findById(req.params.id);
    if (!record || record.status === 'deleted') {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    await deleteStoredFile(record.storedKey);
    record.status = 'deleted';
    await record.save();
    res.json({ success: true, message: 'File deleted' });
  } catch (err) { next(err); }
});

// ── REFERRAL ROUTES ──────────────────────────────────────

// GET /api/admin/referrals
router.get('/referrals', async (req, res, next) => {
  try {
    const referrals = await Referral.find().sort({ totalEarnings: -1 });
    res.json({ success: true, data: referrals });
  } catch (err) { next(err); }
});

// POST /api/admin/referrals — create referral agent
router.post('/referrals', async (req, res, next) => {
  try {
    const { name, email, phone, code } = req.body;
    if (!name || !email) return res.status(400).json({ success: false, message: 'Name and email required' });
    const generatedCode = code?.toUpperCase().trim() ||
      name.split(' ').map(w => w[0]).join('').toUpperCase() +
      Math.random().toString(36).slice(2, 5).toUpperCase();
    const referral = await Referral.create({ name, email, phone, code: generatedCode });
    res.status(201).json({ success: true, data: referral });
  } catch (err) { next(err); }
});

// PATCH /api/admin/referrals/:code/payout — mark commission paid
router.patch('/referrals/:code/payout', async (req, res, next) => {
  try {
    const referral = await Referral.findOne({ code: req.params.code.toUpperCase() });
    if (!referral) return res.status(404).json({ success: false, message: 'Referral not found' });
    const amount = req.body.amount ?? (referral.totalEarnings - referral.paidOut);
    referral.paidOut += amount;
    await referral.save();
    res.json({ success: true, data: referral });
  } catch (err) { next(err); }
});

export default router;
