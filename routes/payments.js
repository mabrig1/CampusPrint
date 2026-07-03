import express from 'express';
import crypto from 'crypto';
import { findOrder, findOrderByPaystackRef, setOrderPaystackRef, markOrderPaid } from '../lib/queries.js';
import { notifyOrderConfirmed, notifyAdministrators } from '../services/notificationService.js';

const router = express.Router();
const PAYSTACK_BASE = 'https://api.paystack.co';

// POST /api/payments/initialize
router.post('/initialize', async (req, res, next) => {
  try {
    const { orderId, email } = req.body;
    if (!orderId) return res.status(400).json({ success: false, message: 'orderId is required' });

    const order = await findOrder(orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.payment.status === 'paid') {
      return res.status(400).json({ success: false, message: 'Order already paid' });
    }

    const reference = `CP_${orderId}_${Date.now()}`;
    const payload = {
      email: email || order.student.email,
      amount: Math.round(order.pricing.totalAmount * 100),
      reference,
      metadata: { orderId: order.orderId, studentName: order.student.name },
      callback_url: process.env.PAYSTACK_CALLBACK_URL,
    };

    const paystackRes = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await paystackRes.json();
    if (!data.status) throw new Error(data.message || 'Paystack initialization failed');

    await setOrderPaystackRef(orderId, data.data.reference);

    res.json({
      success: true,
      data: {
        authorization_url: data.data.authorization_url,
        access_code:       data.data.access_code,
        reference:         data.data.reference,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/payments/verify/:reference
router.get('/verify/:reference', async (req, res, next) => {
  try {
    const { reference } = req.params;
    const paystackRes = await fetch(`${PAYSTACK_BASE}/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    });
    const data = await paystackRes.json();
    if (!data.status) throw new Error(data.message || 'Verification failed');

    if (data.data.status === 'success') {
      const order = await findOrderByPaystackRef(reference);
      if (order && order.payment.status !== 'paid') {
        const updated = await markOrderPaid(order.orderId, reference);
        notifyOrderConfirmed(updated).catch(err => console.error('[notify]', err.message));
      }
    }

    res.json({ success: true, data: data.data });
  } catch (err) {
    next(err);
  }
});

// POST /api/payments/webhook
// req.body is a raw Buffer here (see server.js) — required for the HMAC check.
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body)) {
      console.error('[webhook] body is not a raw buffer — check body-parser order in server.js');
      return res.status(400).send('Bad request');
    }
    const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(req.body).digest('hex');
    if (hash !== req.headers['x-paystack-signature']) return res.status(401).send('Invalid signature');

    const event = JSON.parse(req.body);
    if (event.event === 'charge.success') {
      const order = await findOrderByPaystackRef(event.data.reference);
      if (order && order.payment.status !== 'paid') {
        const updated = await markOrderPaid(order.orderId, event.data.reference);
        notifyOrderConfirmed(updated).catch(err => console.error('[notify]', err.message));
        notifyAdministrators(
          `Payment received – ${order.orderId}`,
          `<p>Payment confirmed for order <strong>${order.orderId}</strong> by ${order.student.name}.</p>
           <p>Amount: ₦${order.pricing.totalAmount.toLocaleString()}</p>`
        ).catch(err => console.error('[notify]', err.message));
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('[webhook]', err.message);
    res.sendStatus(200); // ack so Paystack doesn't retry forever; error is logged
  }
});

export default router;
