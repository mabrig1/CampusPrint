import express from 'express';
import multer from 'multer';
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

export default router;
