import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { ExpressAuth } from '@auth/express';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

import orderRoutes from './routes/orders.js';
import paymentRoutes from './routes/payments.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import referralRoutes from './routes/referrals.js';
import uploadRoutes from './routes/upload.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authConfig } from './lib/auth.js';
import supabase from './lib/db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);

app.use(cors({ origin: true, credentials: true }));
// Paystack webhook needs the raw body for signature verification — this must
// be mounted before the global json parser consumes the request stream.
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Auth.js session handler (provides /auth/session, /auth/csrf, etc.)
app.use('/auth/*', ExpressAuth(authConfig));

// API Routes
app.use('/api/auth',      authRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/orders',    orderRoutes);
app.use('/api/payments',  paymentRoutes);
app.use('/api/admin',     adminRoutes);
app.use('/api/upload',    uploadRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'CampusPrint API is running', timestamp: new Date().toISOString() });
});

// Inject Paystack public key into index.html at request time
app.get('/', (_req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  let content = fs.readFileSync(indexPath, 'utf8');
  const inject = `<script>window.__PAYSTACK_PK__="${process.env.PAYSTACK_PUBLIC_KEY || ''}";</script>`;
  content = content.replace('</head>', `${inject}</head>`);
  res.send(content);
});

// Serve frontend (must come after all /api routes)
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(errorHandler);

// Seed default admin on first start
const seedAdmin = async () => {
  const { data } = await supabase.from('admins').select('id').eq('username', 'admin').single();
  if (!data) {
    const hash = await bcrypt.hash('CampusPrint@2025', 12);
    await supabase.from('admins').insert({ username: 'admin', password: hash, role: 'superadmin' });
    console.log('👤 Default admin created  →  username: admin  |  password: CampusPrint@2025');
    console.log('⚠️  Change this password after first login!');
  }
};

const startServer = async () => {
  const { error } = await supabase.from('admins').select('id').limit(1);
  if (error) {
    console.error('❌ Supabase connection failed:', error.message);
    console.error('   Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set and the schema has been applied.');
    process.exit(1);
  }
  console.log('✅ Supabase connected');
  await seedAdmin();

  const ucPk = process.env.UPLOADCARE_PUBLIC_KEY;
  console.log(`☁️  Uploadcare: ${ucPk || '⚠️  not configured (set UPLOADCARE_PUBLIC_KEY / UPLOADCARE_SECRET_KEY)'}`);

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`🚀 CampusPrint running on port ${PORT}`));
};

startServer().catch(err => { console.error(err); process.exit(1); });
