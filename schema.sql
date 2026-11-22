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
CREATE TABLE IF NOT EXISTS rider_profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rider_code TEXT NOT NULL UNIQUE,
  ghana_card_last4 TEXT,
  photo_url TEXT,
  approved_at TIMESTAMPTZ
);
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
  status TEXT NOT NULL DEFAULT 'requested',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS assignments (
  id BIGSERIAL PRIMARY KEY,
  pickup_id BIGINT NOT NULL UNIQUE REFERENCES pickups(id),
  rider_id BIGINT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','accepted','cancelled','completed')),
  accepted_at TIMESTAMPTZ
);
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_commission_per_assignment
  ON wallet_transactions(package_assignment_id)
  WHERE type = 'commission' AND status = 'successful';
CREATE TABLE IF NOT EXISTS rider_messages (
  id BIGSERIAL PRIMARY KEY,
  sender_id BIGINT NOT NULL REFERENCES users(id),
  recipient_id BIGINT NOT NULL REFERENCES users(id),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS exchange_requests (
  id BIGSERIAL PRIMARY KEY,
  assignment_id BIGINT NOT NULL REFERENCES assignments(id),
  requested_by BIGINT NOT NULL REFERENCES users(id),
  proposed_rider_id BIGINT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
