import express from 'express';
import multer from 'multer';
import path from 'path';
import { createOrder, findOrder, listOrders, updateOrderFiles } from '../lib/queries.js';
import { findReferral, creditReferral } from '../lib/queries.js';
import { calculateOrderTotal } from '../config/pricing.js';
import { uploadToStorage } from '../lib/storage.js';
import { createUploadRecord } from '../lib/queries.js';
import { notifyAdministrators } from '../services/notificationService.js';

const router = express.Router();
const COMMISSION_PER_PAGE = 5;

const REUPLOAD_ALLOWED = new Set(['.pdf', '.doc', '.docx', '.pptx', '.jpg', '.jpeg', '.png']);
const reupload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    REUPLOAD_ALLOWED.has(ext)
      ? cb(null, true)
      : cb(new Error(`File type "${ext}" not allowed. Accepted: PDF, Word, PPTX, JPG, PNG.`));
  },
});

// A file slot may be replaced when the admin asked for a re-send, or when
// the stored copy is missing or points at dead pre-Uploadcare storage.
function isReplaceable(file) {
  return Boolean(
    file.needsReupload ||
    !file.url ||
    String(file.url).includes('res.cloudinary.com')
  );
}

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

    // Fire-and-forget — a slow or failing mail provider must not block the order.
    notifyAdministrators(
      `New Order ${order.orderId}`,
      `<p>New order from <strong>${student.name}</strong> (${student.email}).</p>
       <p>Total: ₦${pricing.totalAmount.toLocaleString()}</p>
       ${referral ? `<p>Referral: <strong>${referral.code}</strong></p>` : ''}`
    ).catch(err => console.error('[notify]', err.message));

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
});

// POST /api/orders/:orderId/files/:fileIndex/reupload
// Lets a student replace a lost/dead file on an existing (already paid)
// order without paying again. Verified by matching the order's email.
router.post('/:orderId/files/:fileIndex/reupload', (req, res) => {
  reupload.single('file')(req, res, async (err) => {
    if (err) {
      const msg = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
        ? 'File exceeds the 50 MB limit'
        : err.message;
      return res.status(400).json({ success: false, message: msg });
    }
    try {
      if (!req.file) return res.status(400).json({ success: false, message: 'No file received' });
      const email = (req.body.email || '').toLowerCase().trim();
      if (!email) return res.status(400).json({ success: false, message: 'Your email is required to verify the order' });

      const order = await findOrder(req.params.orderId);
      if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
      if (order.student.email.toLowerCase() !== email) {
        return res.status(403).json({ success: false, message: 'This email does not match the order. Use the email you placed the order with.' });
      }
      if (['collected', 'cancelled'].includes(order.status)) {
        return res.status(409).json({ success: false, message: `This order is already ${order.status} — re-uploads are closed.` });
      }
      const index = Number(req.params.fileIndex);
      const files = [...(order.files || [])];
      const slot = Number.isInteger(index) ? files[index] : null;
      if (!slot) return res.status(404).json({ success: false, message: 'File not found on this order' });
      if (!isReplaceable(slot)) {
        return res.status(409).json({ success: false, message: 'This file is already available — no re-upload is needed.' });
      }

      const { buffer, originalname, size, mimetype } = req.file;
      const stored = await uploadToStorage(buffer, originalname, mimetype);
      createUploadRecord({
        originalName: originalname,
        cloudinaryPublicId: stored.public_id,
        secureUrl: stored.secure_url,
        resourceType: stored.resource_type,
        format: stored.format,
        mimeType: mimetype,
        size,
        studentEmail: email,
      }).catch(e => console.error('[reupload record]', e.message));

      files[index] = {
        ...slot,
        name: originalname,
        url: stored.secure_url,
        needsReupload: false,
        reuploadedAt: new Date().toISOString(),
      };
      const updated = await updateOrderFiles(order.orderId, files);

      notifyAdministrators(
        `File re-uploaded – ${order.orderId}`,
        `<p><strong>${order.student.name}</strong> re-uploaded <strong>${originalname}</strong> for order <strong>${order.orderId}</strong>. It is ready to print.</p>`
      ).catch(e => console.error('[notify]', e.message));

      res.json({ success: true, data: updated, message: 'File re-uploaded successfully — no extra payment needed.' });
    } catch (e) {
      console.error('Re-upload failed:', e);
      res.status(500).json({ success: false, message: e.message || 'Re-upload failed' });
    }
  });
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
