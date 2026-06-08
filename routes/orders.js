import express from 'express';
import Order from '../models/Order.js';
import Referral from '../models/Referral.js';
import { calculateOrderTotal } from '../config/pricing.js';
import { notifyAdministrators } from '../services/notificationService.js';

const router = express.Router();
const COMMISSION_PER_PAGE = 5; // ₦5 per printed page

// POST /api/orders/price-estimate — MUST be before /:orderId
router.post('/price-estimate', (req, res) => {
  try {
    const { files } = req.body;
    if (!files?.length) return res.status(400).json({ success: false, message: 'Files required' });
    const pricing = calculateOrderTotal(files);
    res.json({ success: true, data: pricing });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/orders — create a new order
router.post('/', async (req, res, next) => {
  try {
    const { student, files, pickupLocation, specialInstructions, referralCode, channel } = req.body;

    if (!student?.name || !student?.email) {
      return res.status(400).json({ success: false, message: 'Student name and email are required' });
    }
    if (!files?.length) {
      return res.status(400).json({ success: false, message: 'At least one file is required' });
    }

    // Validate referral code if provided
    let referral = null;
    if (referralCode) {
      referral = await Referral.findOne({ code: referralCode.toUpperCase().trim(), active: true });
    }

    const pricing = calculateOrderTotal(files);

    const order = await Order.create({
      student,
      files,
      pricing,
      pickupLocation,
      specialInstructions,
      referralCode: referral ? referral.code : undefined,
      channel: channel || 'web',
    });

    // Credit commission to referrer
    if (referral) {
      const totalPages = files.reduce((sum, f) => sum + (f.pages || 1) * (f.copies || 1), 0);
      const commission = totalPages * COMMISSION_PER_PAGE;
      referral.totalPagesReferred += totalPages;
      referral.totalEarnings      += commission;
      referral.ordersReferred.push(order._id);
      await referral.save();
    }

    await notifyAdministrators(
      `New Order ${order.orderId}`,
      `<p>New order from <strong>${student.name}</strong> (${student.email}).</p>
       <p>Total: ₦${pricing.totalAmount.toLocaleString()}</p>
       ${referral ? `<p>Referral: <strong>${referral.code}</strong> (${referral.name})</p>` : ''}`
    );

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:orderId — fetch a single order
router.get('/:orderId', async (req, res, next) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders — list orders
router.get('/', async (req, res, next) => {
  try {
    const { email, status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (email) filter['student.email'] = email.toLowerCase();
    if (status) filter.status = status;

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

export default router;
