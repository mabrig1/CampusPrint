// Vercel serverless function — returns public config to the frontend
export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`window.__PAYSTACK_PK__ = "${process.env.PAYSTACK_PUBLIC_KEY || ''}";`);
}
