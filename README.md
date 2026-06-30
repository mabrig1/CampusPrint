# CampusPrint Backend

REST API for a campus printing service. Students upload documents, pay via Paystack, and collect printed work from the campus centre.

## Stack

- **Node.js** (ESM, ≥ 18) + **Express**
- **MongoDB** + **Mongoose**
- **Paystack** for payments
- **AWS S3** for file storage (optional; falls back to local disk)
- **Resend** for transactional email (optional; falls back to Nodemailer/SMTP)
- **pdf-parse** for automatic PDF page counting

## Quick Start

```bash
cp .env.example .env   # fill in your values (see below)
npm install
npm run dev
```

## File Upload System

### How it works

1. Student enters name/email → selects PDF or Word file (≤ 10 MB)
2. File uploads immediately via XHR — a real-time progress bar shows upload %
3. PDFs: page count is auto-detected and pre-filled
4. Student reviews pricing → pays → order is created
5. Admin receives email notification with a link to the uploaded document
6. Admin opens "Manage Uploaded Files" in the dashboard to view/delete files

### Storage backends

| ENV vars set | Storage |
|---|---|
| `AWS_S3_BUCKET` + `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | Private S3 bucket with pre-signed URLs (expires 1 hour) |
| *(none)* | Local `/uploads` directory (suitable for development) |

The startup log prints: `📁 Storage: S3 (bucket-name)` or `📁 Storage: local disk`.

### AWS S3 setup (production)

1. Create a **private** S3 bucket in your preferred region
2. Create an IAM user with this inline policy:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject","s3:GetObject","s3:DeleteObject"],
    "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
  }]
}
```
3. Add the IAM credentials to `.env` (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_REGION`)

## Email Notifications

| ENV var | Provider |
|---|---|
| `RESEND_API_KEY` set | Resend (recommended; must have a verified sender domain) |
| SMTP vars set (`EMAIL_USER` etc.) | Nodemailer |
| Neither | Email silently disabled |

## API Endpoints

### File Upload

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/upload` | — | Upload a PDF or Word file; returns `{ uploadId, url, size, pageCount }` |
| DELETE | `/api/upload/:uploadId` | — | Remove uploaded file from storage |
| GET | `/api/upload/history?email=` | — | Student's 10 most recent uploads |

### Orders

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/orders` | Create a print order (requires `files[].url`) |
| POST | `/api/orders/price-estimate` | Estimate cost without saving |
| GET | `/api/orders/:orderId` | Get order by ID |
| GET | `/api/orders?email=&status=` | List orders |

### Payments

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/payments/initialize` | Start Paystack payment |
| GET | `/api/payments/verify/:reference` | Verify payment |
| POST | `/api/payments/webhook` | Paystack webhook |

### Admin (Bearer token required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/orders` | List all orders |
| GET | `/api/admin/stats` | Dashboard stats |
| PATCH | `/api/admin/orders/:orderId/status` | Update order status |
| DELETE | `/api/admin/orders/:orderId` | Cancel order |
| GET | `/api/admin/files` | List all uploaded files |
| GET | `/api/admin/files/:id/view` | Get a time-limited view URL |
| DELETE | `/api/admin/files/:id` | Delete a file from storage |

### Auth / Referrals

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Admin login → JWT |
| POST | `/api/referrals/signup` | Register as referral agent |
| GET | `/api/referrals/:code` | Check earnings |

## Environment Variables

See `.env.example` for full documentation of every variable.

```
MONGO_URI            MongoDB connection string
PAYSTACK_SECRET_KEY  Paystack secret key
PAYSTACK_PUBLIC_KEY  Paystack public key (injected into the frontend)
JWT_SECRET           Long random string for signing admin JWTs

# File storage (optional — disk used if not set)
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
AWS_S3_BUCKET

# Email — pick one provider
RESEND_API_KEY       Resend API key (preferred)
EMAIL_HOST / EMAIL_PORT / EMAIL_USER / EMAIL_PASS   SMTP fallback
EMAIL_FROM           Sender address shown in emails
ADMIN_EMAIL          Where admin notifications are sent
```

## Pricing (configurable in `config/pricing.js`)

| Service | Rate |
|---------|------|
| B&W print | ₦50/pg (1–4 pg), ₦40/pg (5–9), ₦30/pg (10+) |
| Colour print | ₦200/pg |
| Editing | ₦50/pg |
| Scanning | ₦30/pg |
| Lamination | ₦150/pg |
| CV Design | ₦2,000 flat |
| Thesis Formatting | ₦5,000 flat |
| Passport Photos | ₦1,500 flat |
| Registration | ₦500 flat |

Binding add-ons: Staple +₦50, Spiral +₦200, Hardcover +₦1,500.
