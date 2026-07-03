import express from 'express';
import multer from 'multer';
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

// GET /api/uploads/download?url=<ucarecdn url>&name=<original filename>
// Streams the file back with a Content-Disposition attachment header so the
// browser downloads it with the student's original filename.
router.get('/download', async (req, res, next) => {
  try {
    const { url, name } = req.query;
    let parsed = null;
    try { parsed = new URL(url || ''); } catch { /* handled below */ }
    if (!parsed || parsed.protocol !== 'https:' || parsed.hostname !== UCARE_CDN_HOST || !UCARE_PATH_RE.test(parsed.pathname)) {
      return res.status(400).json({ success: false, message: 'Invalid or missing file URL' });
    }

    const upstream = await fetch(parsed);
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
