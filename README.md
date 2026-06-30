# CampusPrint Backend

REST API for a campus printing service. Students upload documents, pay via Paystack, and collect printed work from the campus centre.

## Stack

- **Node.js** (ESM, ≥ 18) + **Express**
- **Supabase PostgreSQL** for the database
- **Cloudinary** for file storage and secure file delivery
- **Auth.js** (`@auth/express`) for cookie-based admin sessions
- **Paystack** for payments
- **Resend** for transactional email (optional; falls back to Nodemailer/SMTP)
- **pdf-parse** for automatic PDF page counting

## Quick Start

```bash
cp .env.example .env   # fill in your values (see below)
npm install
# Apply the Supabase schema once:
# paste contents of supabase/schema.sql into the Supabase SQL editor
npm run dev
```

A default admin account (`admin` / `CampusPrint@2025`) is created on first boot — change the password immediately.

## File Upload System

### Supported file types

PDF, DOCX, PPTX, JPG, PNG — up to **50 MB** per file.

### How it works

1. Student enters name/email → drags or selects files
2. Files upload immediately via XHR — a real-time progress bar shows upload %
3. PDFs: page count is auto-detected and pre-filled
4. Student reviews pricing → pays → order is created
5. Admin receives email notification
6. Admin manages files from the "Uploaded Files" tab in the dashboard

### Cloudinary storage

All files are stored in Cloudinary under the `campusprint/` folder. PDFs and images use `resource_type: image` so Cloudinary can generate page previews. DOCX/PPTX use `resource_type: raw`.

Uploaded files receive random public IDs — obscurity provides effective access control on the free tier. Upgrade to signed URLs (`authToken`) if strict access control is required.

## Email Notifications

| ENV var | Provider |
|---|---|
| `RESEND_API_KEY` set | Resend (recommended; requires verified sender domain) |
| SMTP vars set (`EMAIL_USER` etc.) | Nodemailer |
| Neither | Email silently disabled |

## API Endpoints

### File Upload

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/upload` | — | Upload a file; returns `{ uploadId, url, size, pageCount, resourceType }` |
| DELETE | `/api/upload/:uploadId` | — | Remove uploaded file from Cloudinary |
| GET | `/api/upload/history?email=` | — | Student's 12 most recent uploads |

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

### Admin (session cookie or Bearer JWT required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/orders` | List all orders |
| GET | `/api/admin/stats` | Dashboard stats |
| PATCH | `/api/admin/orders/:orderId/status` | Update order status |
| DELETE | `/api/admin/orders/:orderId` | Cancel order |
| GET | `/api/admin/files` | List all uploaded files |
| GET | `/api/admin/files/:id/view` | Get file view URL |
| DELETE | `/api/admin/files/:id` | Delete a file from Cloudinary |

### Auth / Referrals

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Admin login → JWT |
| GET | `/auth/session` | Auth.js session (cookie-based) |
| POST | `/api/referrals/signup` | Register as referral agent |
| GET | `/api/referrals/:code` | Check earnings |

## Environment Variables

See `.env.example` for full documentation of every variable.

```
# Database
SUPABASE_URL              Your Supabase project URL
SUPABASE_SERVICE_ROLE_KEY Supabase service role key (keep secret)

# File storage
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET

# Auth
AUTH_SECRET               Long random string for Auth.js session signing
JWT_SECRET                Long random string for Bearer JWT signing

# Payments
PAYSTACK_SECRET_KEY
PAYSTACK_PUBLIC_KEY       Injected into frontend at runtime
PAYSTACK_CALLBACK_URL     Payment redirect URL

# Email — pick one provider
RESEND_API_KEY            Resend API key (preferred)
EMAIL_HOST / EMAIL_PORT / EMAIL_USER / EMAIL_PASS   SMTP fallback
EMAIL_FROM                Sender address
ADMIN_EMAIL               Admin notification target
```

## Database

Schema is in `supabase/schema.sql`. Apply it once via the Supabase SQL editor or CLI:

```bash
supabase db push   # if using Supabase CLI
# or paste supabase/schema.sql into the SQL editor
```

Tables: `admins`, `orders`, `upload_records`, `referrals`.

## Create an Admin

```bash
node scripts/createAdmin.js <username> <password> [role]
# role defaults to 'admin'; use 'superadmin' for full access
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
