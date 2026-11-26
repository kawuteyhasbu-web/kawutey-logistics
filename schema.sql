CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  location TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('vendor','rider','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe migration for databases created before location was added.
ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS business_name TEXT;
CREATE TABLE IF NOT EXISTS rider_profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rider_code TEXT NOT NULL UNIQUE,
  ghana_card_last4 TEXT,
  photo_url TEXT,
  photo_data BYTEA,
  photo_mime TEXT CHECK (photo_mime IN ('image/jpeg','image/png','image/webp')),
  approved_at TIMESTAMPTZ
);

-- Upgrade existing testing databases without replacing existing rider records.
ALTER TABLE rider_profiles ADD COLUMN IF NOT EXISTS photo_data BYTEA;
ALTER TABLE rider_profiles ADD COLUMN IF NOT EXISTS photo_mime TEXT;
ALTER TABLE rider_profiles ADD COLUMN IF NOT EXISTS pending_photo_data BYTEA;
ALTER TABLE rider_profiles ADD COLUMN IF NOT EXISTS pending_photo_mime TEXT;
ALTER TABLE rider_profiles ADD COLUMN IF NOT EXISTS pending_photo_submitted_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS wallets (
  rider_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance_pesewas BIGINT NOT NULL DEFAULT 0 CHECK (balance_pesewas >= 0)
);
CREATE TABLE IF NOT EXISTS pickups (
  id BIGSERIAL PRIMARY KEY,
  vendor_id BIGINT NOT NULL REFERENCES users(id),
  description TEXT NOT NULL DEFAULT 'Package pickup',
  preferred_at TIMESTAMPTZ NOT NULL,
  total_packages INTEGER NOT NULL CHECK (total_packages > 0),
  large_packages INTEGER NOT NULL DEFAULT 0 CHECK (large_packages >= 0),
  medium_packages INTEGER NOT NULL DEFAULT 0 CHECK (medium_packages >= 0),
  small_packages INTEGER NOT NULL DEFAULT 0 CHECK (small_packages >= 0),
  pickup_latitude DOUBLE PRECISION,
  pickup_longitude DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'requested',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE pickups ADD COLUMN IF NOT EXISTS pickup_latitude DOUBLE PRECISION;
ALTER TABLE pickups ADD COLUMN IF NOT EXISTS pickup_longitude DOUBLE PRECISION;
CREATE TABLE IF NOT EXISTS assignments (
  id BIGSERIAL PRIMARY KEY,
  pickup_id BIGINT NOT NULL UNIQUE REFERENCES pickups(id),
  rider_id BIGINT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','accepted','cancelled','completed')),
  accepted_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ
);
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id BIGSERIAL PRIMARY KEY,
  rider_id BIGINT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('deposit','commission','refund','adjustment')),
  amount_pesewas BIGINT NOT NULL CHECK (amount_pesewas <> 0),
  status TEXT NOT NULL CHECK (status IN ('pending','successful','failed','reversed')),
  reference TEXT NOT NULL UNIQUE,
  package_assignment_id BIGINT REFERENCES assignments(id),
  provider_reference TEXT,
  description TEXT,
  related_transaction_id BIGINT REFERENCES wallet_transactions(id),
  refund_reason TEXT,
  reviewed_by BIGINT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS related_transaction_id BIGINT REFERENCES wallet_transactions(id);
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS refund_reason TEXT;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS reviewed_by BIGINT;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS one_successful_refund_per_transaction
  ON wallet_transactions(related_transaction_id)
  WHERE type = 'refund' AND status = 'successful';
CREATE UNIQUE INDEX IF NOT EXISTS one_commission_per_assignment
  ON wallet_transactions(package_assignment_id)
  WHERE type = 'commission' AND status = 'successful';
CREATE TABLE IF NOT EXISTS pickup_cancellation_requests (
  id BIGSERIAL PRIMARY KEY,
  assignment_id BIGINT NOT NULL REFERENCES assignments(id),
  vendor_id BIGINT NOT NULL REFERENCES users(id),
  reason_type TEXT NOT NULL CHECK(reason_type IN ('customer_cancelled','incorrect_pickup_details','package_unavailable')),
  explanation TEXT NOT NULL CHECK(length(explanation) BETWEEN 10 AND 500),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  admin_note TEXT,
  contacted_vendor BOOLEAN NOT NULL DEFAULT FALSE,
  contact_outcome TEXT CHECK(contact_outcome IN ('spoke_confirmed','spoke_not_confirmed','no_answer','not_called')),
  contacted_by BIGINT REFERENCES users(id),
  contacted_at TIMESTAMPTZ,
  reviewed_by BIGINT REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_cancellation_per_assignment
  ON pickup_cancellation_requests(assignment_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS cancellation_requests_status_created_idx
  ON pickup_cancellation_requests(status,created_at DESC);

CREATE TABLE IF NOT EXISTS rider_messages (
  id BIGSERIAL PRIMARY KEY,
  sender_id BIGINT NOT NULL REFERENCES users(id),
  recipient_id BIGINT NOT NULL REFERENCES users(id),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);
ALTER TABLE rider_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS rider_messages_unread_idx ON rider_messages(recipient_id, sender_id, created_at DESC) WHERE read_at IS NULL;
CREATE TABLE IF NOT EXISTS exchange_requests (
  id BIGSERIAL PRIMARY KEY,
  assignment_id BIGINT NOT NULL REFERENCES assignments(id),
  requested_by BIGINT NOT NULL REFERENCES users(id),
  proposed_rider_id BIGINT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_notifications (
  id BIGSERIAL PRIMARY KEY,
  account_type TEXT NOT NULL CHECK (account_type IN ('vendor','rider')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  email_status TEXT NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending','sent','failed','not_configured')),
  email_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS admin_notifications_created_at_idx ON admin_notifications(created_at DESC);

-- Enforce the company-wide limit of four administrator accounts at database level.
-- The advisory lock prevents simultaneous admin inserts from passing the count check.
CREATE OR REPLACE FUNCTION enforce_max_four_admin_accounts()
RETURNS TRIGGER AS $$
DECLARE
  current_admin_count INTEGER;
BEGIN
  IF NEW.role = 'admin' AND (TG_OP = 'INSERT' OR OLD.role IS DISTINCT FROM NEW.role) THEN
    PERFORM pg_advisory_xact_lock(2026112304);
    SELECT COUNT(*)::int INTO current_admin_count FROM users WHERE role = 'admin';
    IF current_admin_count >= 4 THEN
      RAISE EXCEPTION 'Maximum of four administrator accounts is allowed'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_max_four_admin_accounts ON users;
CREATE TRIGGER users_max_four_admin_accounts
BEFORE INSERT OR UPDATE OF role ON users
FOR EACH ROW
EXECUTE FUNCTION enforce_max_four_admin_accounts();
