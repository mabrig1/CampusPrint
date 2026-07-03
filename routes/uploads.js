import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { Readable } from 'stream';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const UPLOADCARE_UPLOAD_URL = 'https://upload.uploadcare.com/base/';
const UCARE_CDN_HOST = 'ucarecdn.com';
const UCARE_PATH_RE = /^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\/|$)/i;

async function uploadToUploadcare(file) {
  const form = new FormData();
  form.append('UPLOADCARE_PUB_KEY', process.env.UPLOADCARE_PUBLIC_KEY);
  // Store permanently — unstored Uploadcare files are deleted after 24h.
  form.append('UPLOADCARE_STORE', '1');
  form.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname);

  const res = await fetch(UPLOADCARE_UPLOAD_URL, { method: 'POST', body: form });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Uploadcare upload failed (HTTP ${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  if (!data.file) throw new Error('Uploadcare upload returned no file id');
  return {
    name: file.originalname,
    url: `https://${UCARE_CDN_HOST}/${data.file}/${encodeURIComponent(file.originalname)}`,
  };
}

// POST /api/uploads — upload one or more files, returns Uploadcare CDN URLs
router.post('/', upload.array('files', 10), async (req, res, next) => {
  try {
    if (!req.files?.length) return res.status(400).json({ success: false, message: 'No files provided' });
    if (!process.env.UPLOADCARE_PUBLIC_KEY) {
      return res.status(500).json({ success: false, message: 'File storage is not configured (UPLOADCARE_PUBLIC_KEY missing)' });
    }
    const uploaded = await Promise.all(req.files.map(uploadToUploadcare));
    res.json({ success: true, data: uploaded });
  } catch (err) {
    next(err);
  }
});

// Legacy support: orders created before the Uploadcare switch stored
// res.cloudinary.com URLs. Cloudinary blocks unsigned PDF delivery, so if a
// direct fetch fails and CLOUDINARY_* credentials are still set, retry via
// Cloudinary's authenticated download endpoint (signed with node:crypto —
// no SDK needed).
const CLOUDINARY_PATH_RE = /^\/([^/]+)\/(image|video|raw)\/upload\/(?:v\d+\/)?(.+)$/;

async function fetchLegacyCloudinary(parsedUrl) {
  const direct = await fetch(parsedUrl);
  if (direct.ok) return direct;

  const { CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = process.env;
  const m = parsedUrl.pathname.match(CLOUDINARY_PATH_RE);
  if (!apiKey || !apiSecret || !m) return direct;

  const [, cloudName, resourceType, rest] = m;
  let publicId = decodeURIComponent(rest);
  let format = '';
  if (resourceType !== 'raw') {
    const dot = publicId.lastIndexOf('.');
    if (dot > publicId.lastIndexOf('/')) {
      format = publicId.slice(dot + 1);
      publicId = publicId.slice(0, dot);
    }
  }

  const params = {
    expires_at: Math.floor(Date.now() / 1000) + 300,
    format,
    public_id: publicId,
    timestamp: Math.floor(Date.now() / 1000),
    type: 'upload',
  };
  const toSign = Object.keys(params)
    .filter((k) => params[k] !== '' && params[k] !== undefined)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  const signature = crypto.createHash('sha1').update(toSign + apiSecret).digest('hex');

  const query = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined)),
    signature,
    api_key: apiKey,
  });
  return fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/download?${query}`);
}

// GET /api/uploads/download?url=<stored file url>&name=<original filename>
// Streams the file back with a Content-Disposition attachment header so the
// browser downloads it with the student's original filename. Accepts
// Uploadcare CDN URLs (current) and Cloudinary URLs (older orders).
router.get('/download', async (req, res, next) => {
  try {
    const { url, name } = req.query;
    let parsed = null;
    try { parsed = new URL(url || ''); } catch { /* handled below */ }

    const isUploadcare = parsed?.protocol === 'https:' && parsed.hostname === UCARE_CDN_HOST && UCARE_PATH_RE.test(parsed.pathname);
    const isLegacyCloudinary = parsed?.protocol === 'https:' && parsed.hostname === 'res.cloudinary.com' && CLOUDINARY_PATH_RE.test(parsed.pathname);
    if (!isUploadcare && !isLegacyCloudinary) {
      return res.status(400).json({ success: false, message: 'Invalid or missing file URL' });
    }

    const upstream = isUploadcare ? await fetch(parsed) : await fetchLegacyCloudinary(parsed);
    if (!upstream.ok) {
      return res.status(502).json({
        success: false,
        message: `Could not retrieve file from storage (HTTP ${upstream.status})`,
      });
    }

    const lastSegment = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
    const filename = String(name || lastSegment).replace(/[/\\"\r\n]/g, '_') || 'download';
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
