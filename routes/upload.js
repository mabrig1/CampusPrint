import express from 'express';
import multer from 'multer';
import path from 'path';
import { createRequire } from 'module';
import { uploadToCloudinary, cloudinaryResourceType, deleteFromCloudinary } from '../lib/cloudinary.js';
import { createUploadRecord, findUploadRecord, markUploadDeleted, getUploadHistory } from '../lib/queries.js';

const _require = createRequire(import.meta.url);
let pdfParse;
try { pdfParse = _require('pdf-parse'); } catch { /* optional */ }

const ALLOWED = new Set(['.pdf', '.doc', '.docx', '.pptx', '.jpg', '.jpeg', '.png']);
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    ALLOWED.has(ext)
      ? cb(null, true)
      : cb(new Error(`File type "${ext}" not allowed. Accepted: PDF, Word, PPTX, JPG, PNG.`));
  },
});

async function countPdfPages(buffer) {
  if (!pdfParse) return null;
  try {
    const result = await pdfParse(buffer, { max: 0 });
    return result.numpages || null;
  } catch { return null; }
}

const router = express.Router();

// POST /api/upload
router.post('/', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const msg = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
        ? 'File exceeds the 50 MB limit'
        : err.message;
      return res.status(400).json({ success: false, message: msg });
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'No file received' });

    try {
      const { buffer, originalname, size, mimetype } = req.file;
      const ext = path.extname(originalname).toLowerCase();

      const [cloudResult, pageCount] = await Promise.all([
        uploadToCloudinary(buffer, originalname),
        ext === '.pdf' ? countPdfPages(buffer) : Promise.resolve(null),
      ]);

      const record = await createUploadRecord({
        originalName:        originalname,
        cloudinaryPublicId:  cloudResult.public_id,
        secureUrl:           cloudResult.secure_url,
        resourceType:        cloudResult.resource_type,
        format:              cloudResult.format,
        mimeType:            mimetype,
        size:                size,
        pageCount:           pageCount,
        width:               cloudResult.width,
        height:              cloudResult.height,
        studentEmail:        (req.body.email || '').toLowerCase().trim() || null,
      });

      res.status(201).json({
        success: true,
        data: {
          uploadId:  record.id,
          name:      originalname,
          url:       cloudResult.secure_url,
          size,
          pageCount,
          resourceType: cloudResult.resource_type,
          format:    cloudResult.format,
        },
      });
    } catch (uploadErr) {
      res.status(500).json({ success: false, message: uploadErr.message });
    }
  });
});

// DELETE /api/upload/:uploadId
router.delete('/:uploadId', async (req, res) => {
  try {
    const record = await findUploadRecord(req.params.uploadId);
    if (!record || record.status === 'deleted') {
      return res.status(404).json({ success: false, message: 'Upload not found' });
    }
    await deleteFromCloudinary(record.cloudinary_public_id, record.resource_type);
    await markUploadDeleted(req.params.uploadId);
    res.json({ success: true, message: 'File deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/upload/history?email=student@example.com
router.get('/history', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ success: false, message: 'email query parameter required' });
  try {
    const records = await getUploadHistory(email);
    res.json({ success: true, data: records });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
