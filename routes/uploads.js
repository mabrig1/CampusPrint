import express from 'express';
import multer from 'multer';
import { Readable } from 'stream';
import cloudinary from '../config/cloudinary.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

function uploadToCloudinary(file) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'campusprint/orders', resource_type: 'auto', use_filename: true },
      (err, result) => (err ? reject(err) : resolve({ name: file.originalname, url: result.secure_url }))
    );
    stream.end(file.buffer);
  });
}

// POST /api/uploads — upload one or more files, returns Cloudinary URLs
router.post('/', upload.array('files', 10), async (req, res, next) => {
  try {
    if (!req.files?.length) return res.status(400).json({ success: false, message: 'No files provided' });
    const uploaded = await Promise.all(req.files.map(uploadToCloudinary));
    res.json({ success: true, data: uploaded });
  } catch (err) {
    next(err);
  }
});

// Extract resource_type / public_id / format from one of our own Cloudinary URLs.
// Returns null for anything that isn't an asset in this account's cloud.
export function parseCloudinaryUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.hostname !== 'res.cloudinary.com') return null;
  const m = u.pathname.match(/^\/([^/]+)\/(image|video|raw)\/upload\/(?:v\d+\/)?(.+)$/);
  if (!m) return null;
  const [, cloudName, resourceType, rest] = m;
  if (cloudName !== cloudinary.config().cloud_name) return null;
  let publicId = rest;
  let format = '';
  // For image/video the extension is not part of the public_id; for raw it is.
  if (resourceType !== 'raw') {
    const dot = rest.lastIndexOf('.');
    if (dot > rest.lastIndexOf('/')) {
      publicId = rest.slice(0, dot);
      format = rest.slice(dot + 1);
    }
  }
  return { resourceType, publicId: decodeURIComponent(publicId), format };
}

// GET /api/uploads/download?url=<cloudinary secure_url>&name=<original filename>
// Cloudinary blocks unsigned delivery of PDFs/ZIPs by default on new accounts
// (the stored secure_url returns 401 in the browser), so we fetch the asset
// with a signed URL server-side and stream it back as an attachment.
router.get('/download', async (req, res, next) => {
  try {
    const { url, name } = req.query;
    const parsed = parseCloudinaryUrl(url || '');
    if (!parsed) return res.status(400).json({ success: false, message: 'Invalid or missing file URL' });

    const { resourceType, publicId, format } = parsed;

    // Signed delivery URL — signing bypasses the PDF/ZIP delivery restriction.
    const signedDeliveryUrl = cloudinary.url(publicId, {
      resource_type: resourceType,
      type: 'upload',
      format: format || undefined,
      sign_url: true,
      secure: true,
    });
    let upstream = await fetch(signedDeliveryUrl);

    if (!upstream.ok) {
      // Fallback: authenticated download endpoint (works regardless of delivery settings).
      const privateUrl = cloudinary.utils.private_download_url(publicId, format, {
        resource_type: resourceType,
        type: 'upload',
        expires_at: Math.floor(Date.now() / 1000) + 300,
      });
      upstream = await fetch(privateUrl);
    }

    if (!upstream.ok) {
      return res.status(502).json({
        success: false,
        message: `Could not retrieve file from storage (HTTP ${upstream.status})`,
      });
    }

    const fallbackName = publicId.split('/').pop() + (format ? `.${format}` : '');
    const filename = String(name || fallbackName).replace(/[/\\"\r\n]/g, '_') || 'download';
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    const length = upstream.headers.get('content-length');
    if (length) res.setHeader('Content-Length', length);

    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    next(err);
  }
});

export default router;
