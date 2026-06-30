import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { findAdmin, updateAdminLogin } from '../lib/queries.js';
import { adminAuth } from '../middleware/adminAuth.js';

const router = express.Router();

// POST /api/auth/login — returns JWT for API use
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    const admin = await findAdmin(username);
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    await updateAdminLogin(admin.id);

    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: admin.role },
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

// GET /api/auth/me — verify current token
router.get('/me', adminAuth, (req, res) => {
  res.json({ success: true, admin: req.admin });
});

export default router;
