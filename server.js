import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

import orderRoutes from './routes/orders.js';
import paymentRoutes from './routes/payments.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import referralRoutes from './routes/referrals.js';
import uploadRoutes from './routes/upload.js';
import { errorHandler } from './middleware/errorHandler.js';
import { USE_S3, getViewUrl, UPLOAD_DIR } from './services/storageService.js';
import { fileURLToPath } from 'url';
import path from 'path';
import Admin from './models/Admin.js';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1); // trust Railway / Cloudflare proxy

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Database
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB Connected');
    await seedAdmin();
  } catch (err) {
    console.error('❌ MongoDB Error:', err.message);
    process.exit(1);
  }
};

// Auto-create default admin on first start
const seedAdmin = async () => {
  const exists = await Admin.findOne({ username: 'admin' });
  if (!exists) {
    await Admin.create({ username: 'admin', password: 'CampusPrint@2025', role: 'superadmin' });
    console.log('👤 Default admin created  →  username: admin  |  password: CampusPrint@2025');
    console.log('⚠️  Change this password after first login!');
  }
};

connectDB();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);

// Serve uploaded documents.
// S3: generate a 1-hour pre-signed URL and redirect — never exposes bucket credentials.
// Disk: serve directly from the /uploads directory.
if (USE_S3) {
  app.get('/uploads/:key', async (req, res) => {
    try {
      const signedUrl = await getViewUrl(req.params.key);
      res.redirect(302, signedUrl);
    } catch {
      res.status(404).send('File not found');
    }
  });
} else {
  app.use('/uploads', express.static(UPLOAD_DIR));
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'CampusPrint API is running',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

// Inject Paystack public key into index.html at request time
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  let content = fs.readFileSync(indexPath, 'utf8');
  const inject = `<script>window.__PAYSTACK_PK__="${process.env.PAYSTACK_PUBLIC_KEY || ''}";</script>`;
  content = content.replace('</head>', `${inject}</head>`);
  res.send(content);
});

// Serve frontend (must come after all /api routes)
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 CampusPrint running on port ${PORT}`);
  console.log(`📁 Storage: ${USE_S3 ? `S3 (${process.env.AWS_S3_BUCKET})` : 'local disk'}`);
});
