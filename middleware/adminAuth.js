import jwt from 'jsonwebtoken';
import { getSession } from '@auth/express';
import { authConfig } from '../lib/auth.js';

export const adminAuth = async (req, res, next) => {
  // 1. Try Auth.js cookie session first
  try {
    const session = await getSession(req, authConfig);
    if (session?.user?.username) {
      req.admin = { id: session.user.id, username: session.user.username, role: session.user.role };
      return next();
    }
  } catch { /* no session */ }

  // 2. Fallback: Bearer JWT
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};
