-- CampusPrint — Supabase PostgreSQL schema
-- Run this in your Supabase SQL editor (Database → SQL Editor → New query)

-- ── ADMINS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username    TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,   -- bcrypt hash
  role        TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','superadmin')),
  last_login  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── ORDERS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             TEXT UNIQUE NOT NULL,
  student_name         TEXT NOT NULL,
  student_email        TEXT NOT NULL,
  student_phone        TEXT,
  matric_number        TEXT,
  files                JSONB NOT NULL DEFAULT '[]',
  pricing              JSONB NOT NULL DEFAULT '{}',
  pickup_location      TEXT NOT NULL DEFAULT 'Main Library',
  special_instructions TEXT,
  referral_code        TEXT,
  channel              TEXT NOT NULL DEFAULT 'web' CHECK (channel IN ('web','whatsapp','walk-in')),
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','confirmed','printing','ready','collected','cancelled')),
  payment_status       TEXT NOT NULL DEFAULT 'unpaid'
                         CHECK (payment_status IN ('unpaid','paid','refunded')),
  payment_method       TEXT NOT NULL DEFAULT 'paystack'
                         CHECK (payment_method IN ('paystack','cash','transfer')),
  paystack_reference   TEXT,
  paid_at              TIMESTAMPTZ,
  admin_notes          TEXT,
  estimated_ready_at   TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS orders_email_idx          ON orders (student_email);
CREATE INDEX IF NOT EXISTS orders_status_idx         ON orders (status);
CREATE INDEX IF NOT EXISTS orders_payment_status_idx ON orders (payment_status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx     ON orders (created_at DESC);

-- ── UPLOAD RECORDS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS upload_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_name         TEXT NOT NULL,
  cloudinary_public_id  TEXT NOT NULL,
  secure_url            TEXT NOT NULL,
  resource_type         TEXT NOT NULL DEFAULT 'raw' CHECK (resource_type IN ('image','raw','video')),
  format                TEXT,
  mime_type             TEXT,
  size                  INTEGER,
  page_count            INTEGER,
  width                 INTEGER,
  height                INTEGER,
  student_email         TEXT,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
  order_id              TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS upload_records_email_idx  ON upload_records (student_email, created_at DESC);
CREATE INDEX IF NOT EXISTS upload_records_status_idx ON upload_records (status, created_at DESC);

-- ── REFERRALS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  TEXT UNIQUE NOT NULL,
  name                  TEXT NOT NULL,
  email                 TEXT UNIQUE NOT NULL,
  phone                 TEXT,
  faculty               TEXT,
  level                 TEXT,
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  total_pages_referred  INTEGER NOT NULL DEFAULT 0,
  total_earnings        NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_out              NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
