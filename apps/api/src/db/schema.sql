-- LaterOn Streamlined MVP Database Schema
-- PostgreSQL schema for users, payment plans, and lender deposits

-- Users table: stores borrower profiles and credit history
CREATE TABLE IF NOT EXISTS users (
  wallet_address TEXT PRIMARY KEY,
  tier TEXT NOT NULL DEFAULT 'NEW',
  completed_plans INT NOT NULL DEFAULT 0,
  defaults_count INT NOT NULL DEFAULT 0,
  total_outstanding_microalgo BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast wallet address lookups
CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);

-- Payment plans table: stores BNPL payment plan records
CREATE TABLE IF NOT EXISTS payment_plans (
  plan_id TEXT PRIMARY KEY,
  borrower_wallet_address TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  financed_amount_microalgo BIGINT NOT NULL,
  remaining_amount_microalgo BIGINT NOT NULL,
  installments_paid INT NOT NULL DEFAULT 0,
  next_due_unix BIGINT NOT NULL,
  status TEXT NOT NULL,
  tier_at_approval TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast plan ID lookups
CREATE INDEX IF NOT EXISTS idx_plans_plan_id ON payment_plans(plan_id);

-- Index for fast borrower wallet lookups
CREATE INDEX IF NOT EXISTS idx_plans_borrower ON payment_plans(borrower_wallet_address);

-- Index for fast status-based queries (used by risk keeper)
CREATE INDEX IF NOT EXISTS idx_plans_status ON payment_plans(status);

-- Lender deposits table: tracks liquidity provider deposits
CREATE TABLE IF NOT EXISTS lender_deposits (
  id SERIAL PRIMARY KEY,
  lender_wallet_address TEXT NOT NULL,
  amount_microalgo BIGINT NOT NULL,
  tx_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lender wallet lookups
CREATE INDEX IF NOT EXISTS idx_deposits_lender ON lender_deposits(lender_wallet_address);

-- Index for transaction ID lookups (deduplication)
CREATE INDEX IF NOT EXISTS idx_deposits_tx_id ON lender_deposits(tx_id);
