import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

import orderRoutes from './routes/orders.js';
import paymentRoutes from './routes/payments.js';
import adminRoutes from './routes/admin.js';
import { errorHandler } from './middleware/errorHandler.js';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.ALLOWED_ORIGINS?.split(',') ?? []
    : ['http://localhost:3000', 'http://127.0.0.1:5500'],
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Database
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB Connected');
  } catch (err) {
    console.error('❌ MongoDB Error:', err.message);
    process.exit(1);
  }
};

connectDB();

// Routes
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'CampusPrint API is running',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'CampusPrint API v1.0',
    endpoints: {
      health: '/api/health',
      orders: '/api/orders',
      payments: '/api/payments',
      admin: '/api/admin',
    },
  });
});

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 CampusPrint running on port ${PORT}`);
});
