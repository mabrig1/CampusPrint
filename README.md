# CampusPrint Backend

REST API for a campus printing service. Students submit print jobs, pay via Paystack, and admins manage order fulfillment.

## Stack

- **Node.js** (ESM) + **Express**
- **MongoDB** + **Mongoose**
- **Paystack** for payments
- **Nodemailer** for email notifications

## Quick Start

```bash
cp .env.example .env   # fill in your values
npm install
npm run dev
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/orders` | Create a new print order |
| POST | `/api/orders/price-estimate` | Estimate cost without saving |
| GET | `/api/orders/:orderId` | Get order by ID |
| GET | `/api/orders?email=&status=` | List orders |
| POST | `/api/payments/initialize` | Start Paystack payment |
| GET | `/api/payments/verify/:reference` | Verify payment |
| POST | `/api/payments/webhook` | Paystack webhook |
| GET | `/api/admin/orders` | List all orders (admin) |
| GET | `/api/admin/stats` | Dashboard stats (admin) |
| PATCH | `/api/admin/orders/:orderId/status` | Update order status |
| DELETE | `/api/admin/orders/:orderId` | Cancel order |
| GET | `/api/health` | Health check |

## Admin Auth

Pass `x-admin-secret: <ADMIN_SECRET>` header on all `/api/admin/*` requests.

## Pricing (configurable in `config/pricing.js`)

| Mode | A4 Single | A4 Double |
|------|-----------|-----------|
| B&W | ₦20 | ₦30 |
| Color | ₦50 | ₦80 |

Binding: Staple +₦50, Spiral +₦200.

## Environment Variables

See `.env.example`.
