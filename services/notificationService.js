import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const send = async (to, subject, html) => {
  if (!process.env.EMAIL_USER) return; // skip if email not configured
  try {
    await transporter.sendMail({ from: process.env.EMAIL_FROM, to, subject, html });
  } catch (err) {
    console.error('Email send error:', err.message);
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

export const notifyAdministrators = async (subject, html) => {
  const adminEmail = process.env.EMAIL_USER;
  if (!adminEmail) return;
  await send(adminEmail, `[Admin] ${subject}`, html);
};
