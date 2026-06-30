import express from 'express';
import {
  findReferralByEmail, referralExists, createReferral, findReferral, normalizeReferralPublic,
} from '../lib/queries.js';
import { notifyAdministrators } from '../services/notificationService.js';

const router = express.Router();

// POST /api/referrals/signup
router.post('/signup', async (req, res, next) => {
  try {
    const { name, email, phone, faculty, level } = req.body;
    if (!name || !email || !phone) {
      return res.status(400).json({ success: false, message: 'Name, email and phone are required' });
    }

    const existing = await findReferralByEmail(email);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'This email is already registered as a referral agent',
        code: existing.code,
      });
    }

    let code;
    let attempts = 0;
    do {
      const initials = name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
      const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
      code = `${initials}${rand}`;
      attempts++;
    } while ((await referralExists(code)) && attempts < 10);

    const referral = await createReferral({ name, email, phone, faculty, level, code });

    await notifyAdministrators(
      `New Referral Agent: ${name}`,
      `<p><strong>${name}</strong> (${email}, ${phone}) signed up as a referral agent.</p>
       <p>Code: <strong>${code}</strong></p>
       ${faculty ? `<p>Faculty: ${faculty} | Level: ${level}</p>` : ''}`
    );

    res.status(201).json({ success: true, data: { code: referral.code, name: referral.name } });
  } catch (err) {
    next(err);
  }
});

// GET /api/referrals/:code
router.get('/:code', async (req, res, next) => {
  try {
    const raw = await findReferral(req.params.code.toUpperCase());
    if (!raw) return res.status(404).json({ success: false, message: 'Referral code not found' });
    res.json({ success: true, data: normalizeReferralPublic(raw) });
  } catch (err) {
    next(err);
  }
});

export default router;
