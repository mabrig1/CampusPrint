import express from 'express';
import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import { adminAuth } from '../middleware/adminAuth.js';

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    const admin = await Admin.findOne({ username: username.toLowerCase().trim() });
    if (!admin || !(await admin.verifyPassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    admin.lastLogin = new Date();
    await admin.save();

    const token = jwt.sign(
      { id: admin._id, username: admin.username, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      success: true,
      token,
      admin: { username: admin.username, role: admin.role },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — verify token and return current admin
router.get('/me', adminAuth, (req, res) => {
  res.json({ success: true, admin: req.admin });
});

export default router;
