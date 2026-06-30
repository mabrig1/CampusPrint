import express from 'express';
import {
  listOrders, updateOrderStatus, getOrderStats,
  listUploadRecords, findUploadRecord, markUploadDeleted,
  listReferrals, createReferral, payoutReferral,
} from '../lib/queries.js';
import { deleteFromCloudinary } from '../lib/cloudinary.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { notifyOrderReady } from '../services/notificationService.js';

const router = express.Router();
router.use(adminAuth);

// ── ORDERS ────────────────────────────────────────────────

router.get('/orders', async (req, res, next) => {
  try {
    const { status, paymentStatus, page = 1, limit = 50, search } = req.query;
    const result = await listOrders({ status, paymentStatus, search, page, limit });
    res.json({ success: true, data: result.orders, total: result.total, page: Number(page), limit: Number(limit) });
  } catch (err) { next(err); }
});

router.get('/stats', async (req, res, next) => {
  try {
    const stats = await getOrderStats();
    res.json({ success: true, data: stats });
  } catch (err) { next(err); }
});

router.patch('/orders/:orderId/status', async (req, res, next) => {
  try {
    const { status, adminNotes, estimatedReadyAt } = req.body;
    const valid = ['pending','confirmed','printing','ready','collected','cancelled'];
    if (!valid.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${valid.join(', ')}` });
    }
    const order = await updateOrderStatus(req.params.orderId, { status, adminNotes, estimatedReadyAt });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (status === 'ready') await notifyOrderReady(order);
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

router.delete('/orders/:orderId', async (req, res, next) => {
  try {
    const order = await updateOrderStatus(req.params.orderId, { status: 'cancelled' });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, message: 'Order cancelled' });
  } catch (err) { next(err); }
});

// ── FILES ─────────────────────────────────────────────────

router.get('/files', async (req, res, next) => {
  try {
    const { email, page = 1, limit = 50 } = req.query;
    const result = await listUploadRecords({ email, page, limit });
    res.json({ success: true, data: result.records, total: result.total });
  } catch (err) { next(err); }
});

router.get('/files/:id/view', async (req, res, next) => {
  try {
    const record = await findUploadRecord(req.params.id);
    if (!record || record.status === 'deleted') {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    res.json({ success: true, data: { viewUrl: record.secure_url, name: record.original_name, resourceType: record.resource_type, format: record.format } });
  } catch (err) { next(err); }
});

router.delete('/files/:id', async (req, res, next) => {
  try {
    const record = await findUploadRecord(req.params.id);
    if (!record || record.status === 'deleted') {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    await deleteFromCloudinary(record.cloudinary_public_id, record.resource_type);
    await markUploadDeleted(req.params.id);
    res.json({ success: true, message: 'File deleted' });
  } catch (err) { next(err); }
});

// ── REFERRALS ─────────────────────────────────────────────

router.get('/referrals', async (req, res, next) => {
  try {
    const agents = await listReferrals();
    res.json({ success: true, data: agents });
  } catch (err) { next(err); }
});

router.post('/referrals', async (req, res, next) => {
  try {
    const { name, email, phone, code } = req.body;
    if (!name || !email) return res.status(400).json({ success: false, message: 'Name and email required' });
    const generatedCode = code?.toUpperCase().trim() ||
      name.split(' ').map(w => w[0]).join('').toUpperCase() +
      Math.random().toString(36).slice(2, 5).toUpperCase();
    const referral = await createReferral({ name, email, phone, code: generatedCode });
    res.status(201).json({ success: true, data: referral });
  } catch (err) { next(err); }
});

router.patch('/referrals/:code/payout', async (req, res, next) => {
  try {
    const updated = await payoutReferral(req.params.code, req.body.amount);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

export default router;
