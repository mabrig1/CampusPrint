import express from 'express';
import multer from 'multer';
import path from 'path';
import { createRequire } from 'module';
import { uploadBuffer, deleteStoredFile, USE_S3 } from '../services/storageService.js';
import UploadRecord from '../models/UploadRecord.js';

// pdf-parse is a CommonJS module — load via require so it doesn't trigger its
// internal test-file side-effect under ESM static analysis.
const _require = createRequire(import.meta.url);
let pdfParse;
try { pdfParse = _require('pdf-parse'); } catch { /* optional dep not present */ }

const ALLOWED = new Set(['.pdf', '.doc', '.docx']);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    ALLOWED.has(ext)
      ? cb(null, true)
      : cb(new Error(`File type "${ext}" is not allowed. Upload PDF or Word (.doc/.docx).`));
  },
});

async function countPdfPages(buffer) {
  if (!pdfParse) return null;
  try {
    const result = await pdfParse(buffer, { max: 0 }); // max:0 = parse all pages, no text
    return result.numpages || null;
  } catch { return null; }
}

const router = express.Router();

// POST /api/upload
// Accepts multipart/form-data with field "file" (and optional "email").
// Returns { uploadId, name, url, size, pageCount }.
router.post('/', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const msg = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
        ? 'File exceeds 10 MB limit'
        : err.message;
      return res.status(400).json({ success: false, message: msg });
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'No file received' });

    try {
      const { buffer, originalname, size, mimetype } = req.file;
      const ext = path.extname(originalname).toLowerCase();

      const pageCount = ext === '.pdf' ? await countPdfPages(buffer) : null;
      const { key, url } = await uploadBuffer(buffer, originalname);

      const record = await UploadRecord.create({
        originalName: originalname,
        storedKey:   key,
        storageType: USE_S3 ? 's3' : 'disk',
        mimeType:    mimetype,
        size,
        pageCount,
        studentEmail: (req.body.email || '').toLowerCase().trim() || undefined,
      });

      res.status(201).json({
        success: true,
        data: {
          uploadId:  record._id,
          name:      originalname,
          url,
          size,
          pageCount,
        },
      });
    } catch (uploadErr) {
      res.status(500).json({ success: false, message: uploadErr.message });
    }
  });
});

// DELETE /api/upload/:uploadId
// Removes the file from storage and marks the record deleted.
router.delete('/:uploadId', async (req, res) => {
  try {
    const record = await UploadRecord.findById(req.params.uploadId);
    if (!record || record.status === 'deleted') {
      return res.status(404).json({ success: false, message: 'Upload not found' });
    }
    await deleteStoredFile(record.storedKey);
    record.status = 'deleted';
    await record.save();
    res.json({ success: true, message: 'File deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/upload/history?email=student@example.com
// Returns the 10 most recent active uploads for that student email.
router.get('/history', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ success: false, message: 'email query parameter required' });
  try {
    const records = await UploadRecord.find({
      studentEmail: email.toLowerCase().trim(),
      status: 'active',
    }).sort({ createdAt: -1 }).limit(10).select('originalName size pageCount createdAt url storedKey');
    res.json({ success: true, data: records });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
