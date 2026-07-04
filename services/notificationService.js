import nodemailer from 'nodemailer';
import { createRequire } from 'module';

// Resend is an optional dependency — load via require so missing installs degrade gracefully.
const _require = createRequire(import.meta.url);
let ResendClass = null;
try { ResendClass = _require('resend').Resend; } catch { /* resend not installed */ }

const resendClient = ResendClass && process.env.RESEND_API_KEY
  ? new ResendClass(process.env.RESEND_API_KEY)
  : null;

const FROM = process.env.EMAIL_FROM || 'CampusPrint <no-reply@campusprint.com>';

// Nodemailer transporter (used only when Resend is not configured)
const nodemailerTransport = (!resendClient && process.env.EMAIL_USER)
  ? nodemailer.createTransport({
      host:   process.env.EMAIL_HOST || 'smtp.gmail.com',
      port:   Number(process.env.EMAIL_PORT) || 587,
      secure: false,
      auth:   { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    })
  : null;

const send = async (to, subject, html) => {
  if (resendClient) {
    try {
      await resendClient.emails.send({ from: FROM, to, subject, html });
      return;
    } catch (err) {
      console.error('[Resend]', err.message);
    }
  }
  if (nodemailerTransport) {
    try {
      await nodemailerTransport.sendMail({ from: FROM, to, subject, html });
    } catch (err) {
      console.error('[Nodemailer]', err.message);
    }
  }
};

export const notifyOrderConfirmed = async (order) => {
  const { name, email } = order.student;
  await send(
    email,
    `Order Confirmed – ${order.orderId}`,
    `<h2>Hi ${name},</h2>
     <p>Your print order <strong>${order.orderId}</strong> has been confirmed and is being processed.</p>
     <p><strong>Total paid:</strong> ₦${order.pricing.totalAmount.toLocaleString()}</p>
     <p><strong>Pickup:</strong> ${order.pickupLocation}</p>
     <p>We'll notify you when it's ready for collection.</p>
     <p>– CampusPrint Team</p>`
  );
};

export const notifyOrderReady = async (order) => {
  const { name, email } = order.student;
  await send(
    email,
    `Your Print is Ready – ${order.orderId}`,
    `<h2>Hi ${name},</h2>
     <p>Great news! Your order <strong>${order.orderId}</strong> is ready for collection.</p>
     <p><strong>Pickup location:</strong> ${order.pickupLocation}</p>
     <p>Please bring this email or your order ID when collecting.</p>
     <p>– CampusPrint Team</p>`
  );
};

export const notifyResendRequest = async (order, fileName, link) => {
  const { name, email } = order.student;
  await send(
    email,
    `Please re-send a file – ${order.orderId}`,
    `<h2>Hi ${name},</h2>
     <p>We need you to re-upload <strong>${fileName}</strong> for your order <strong>${order.orderId}</strong> — the copy we received is no longer available.</p>
     <p><strong>You do not need to pay again.</strong> Your payment stays attached to this order.</p>
     <p><a href="${link}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Re-upload your file</a></p>
     <p>Or open ${link} and use the re-upload button next to the file.</p>
     <p>– CampusPrint Team</p>`
  );
};

export const notifyAdministrators = async (subject, html) => {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
  if (!adminEmail) return;
  await send(adminEmail, `[Admin] ${subject}`, html);
};
