import express from 'express';
import { createOrder, findOrder, listOrders } from '../lib/queries.js';
import { findReferral, creditReferral } from '../lib/queries.js';
import { calculateOrderTotal } from '../config/pricing.js';
import { notifyAdministrators } from '../services/notificationService.js';

const router = express.Router();
const COMMISSION_PER_PAGE = 5;

// POST /api/orders/price-estimate
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

// POST /api/orders
router.post('/', async (req, res, next) => {
  try {
    const { student, files, pickupLocation, specialInstructions, referralCode, channel } = req.body;

    if (!student?.name || !student?.email) {
      return res.status(400).json({ success: false, message: 'Student name and email are required' });
    }
    if (!files?.length) {
      return res.status(400).json({ success: false, message: 'At least one file is required' });
    }
    if (files.some(f => !f.url)) {
      return res.status(400).json({ success: false, message: 'One or more files failed to upload. Please re-upload and try again.' });
    }

    let referral = null;
    if (referralCode) {
      referral = await findReferral(referralCode.toUpperCase().trim());
      if (!referral?.active) referral = null;
    }

    const pricing = calculateOrderTotal(files);
    const order = await createOrder({
      student,
      files,
      pricing,
      pickupLocation,
      specialInstructions,
      referralCode: referral ? referral.code : undefined,
      channel: channel || 'web',
    });

    if (referral) {
      const totalPages = files.reduce((sum, f) => sum + (f.pages || 1) * (f.copies || 1), 0);
      await creditReferral(referral.code, totalPages, totalPages * COMMISSION_PER_PAGE);
    }

    await notifyAdministrators(
      `New Order ${order.orderId}`,
      `<p>New order from <strong>${student.name}</strong> (${student.email}).</p>
       <p>Total: ₦${pricing.totalAmount.toLocaleString()}</p>
       ${referral ? `<p>Referral: <strong>${referral.code}</strong></p>` : ''}`
    );

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:orderId
router.get('/:orderId', async (req, res, next) => {
  try {
    const order = await findOrder(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders
router.get('/', async (req, res, next) => {
  try {
    const { email, status, page = 1, limit = 20 } = req.query;
    const result = await listOrders({ email, status, page, limit });
    res.json({ success: true, data: result.orders, total: result.total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    next(err);
  }
});

export default router;
