import express from 'express';
import Order from '../models/Order.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { notifyOrderReady } from '../services/notificationService.js';

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

export default router;
