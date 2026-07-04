import express from 'express';
import { Readable } from 'stream';
import {
  listOrders, findOrder, updateOrderStatus, getOrderStats, markOrderPaid,
  listUploadRecords, findUploadRecord, markUploadDeleted,
  listReferrals, createReferral, payoutReferral,
} from '../lib/queries.js';
import { deleteFromStorage } from '../lib/storage.js';
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
    if (status === 'ready') notifyOrderReady(order).catch(err => console.error('[notify]', err.message));
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

// Re-check an order's payment with Paystack and mark it paid if the charge
// succeeded. Recovers orders whose popup callback / webhook was missed.
router.post('/orders/:orderId/verify-payment', async (req, res, next) => {
  try {
    const order = await findOrder(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.payment.status === 'paid') {
      return res.json({ success: true, data: order, message: 'Order is already marked paid' });
    }
    const reference = order.payment.paystackReference;
    if (!reference) {
      return res.status(400).json({ success: false, message: 'No Paystack reference on this order — the student never reached the payment page.' });
    }
    const paystackRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    });
    const data = await paystackRes.json();
    if (!data.status) {
      return res.status(502).json({ success: false, message: data.message || 'Paystack verification failed' });
    }
    if (data.data.status !== 'success') {
      return res.json({ success: false, message: `Paystack reports this transaction as "${data.data.status}" — not charged.` });
    }
    const updated = await markOrderPaid(order.orderId, reference);
    res.json({ success: true, data: updated, message: 'Payment confirmed — order marked as paid.' });
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

// Stream a stored file back to the admin with its original filename.
// A plain <a download> pointing at the Uploadcare CDN can't be used: the
// download attribute is ignored cross-origin, so the browser opens the file
// in a tab or saves it under its bare UUID with no extension.
async function streamFile(res, url, name, mimeType) {
  // Files from before the Uploadcare switch (30 Jun) point at the old provider
  // or were never permanently stored — they are gone and can't be recovered.
  const LEGACY_MSG = 'This file was uploaded before the storage fix on 30 Jun and is no longer available. Please ask the student to re-upload it.';
  let host = '';
  try { host = new URL(url).hostname; } catch { /* fall through to fetch error */ }
  if (host === 'res.cloudinary.com') {
    return res.status(410).json({ success: false, message: LEGACY_MSG });
  }

  const upstream = await fetch(url);
  if (!upstream.ok || !upstream.body) {
    const message = upstream.status === 404 && host === 'ucarecdn.com'
      ? LEGACY_MSG
      : `Could not retrieve file from storage (HTTP ${upstream.status})`;
    return res.status(upstream.status === 404 ? 410 : 502).json({ success: false, message });
  }
  const safeName = (name || 'file').replace(/[^\w.\- ()]+/g, '_');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.setHeader('Content-Type', mimeType || upstream.headers.get('content-type') || 'application/octet-stream');
  const length = upstream.headers.get('content-length');
  if (length) res.setHeader('Content-Length', length);
  Readable.fromWeb(upstream.body).pipe(res);
}

router.get('/files/:id/download', async (req, res, next) => {
  try {
    const record = await findUploadRecord(req.params.id);
    if (!record || record.status === 'deleted') {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    await streamFile(res, record.secure_url, record.original_name, record.mime_type);
  } catch (err) { next(err); }
});

router.get('/orders/:orderId/files/:fileIndex/download', async (req, res, next) => {
  try {
    const order = await findOrder(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    const index = Number(req.params.fileIndex);
    const file = Number.isInteger(index) ? (order.files || [])[index] : null;
    if (!file) return res.status(404).json({ success: false, message: 'File not found on this order' });
    if (!file.url) return res.status(404).json({ success: false, message: 'No uploaded file is attached to this entry' });
    await streamFile(res, file.url, file.name);
  } catch (err) { next(err); }
});

router.delete('/files/:id', async (req, res, next) => {
  try {
    const record = await findUploadRecord(req.params.id);
    if (!record || record.status === 'deleted') {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    await deleteFromStorage(record.cloudinary_public_id, record.resource_type);
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
