-- LaterOn Streamlined MVP Database Schema
-- PostgreSQL schema for users, payment plans, and lender deposits

-- Users table: stores borrower profiles and credit history
CREATE TABLE IF NOT EXISTS users (
  wallet_address TEXT PRIMARY KEY,
  tier TEXT NOT NULL DEFAULT 'NEW',
  completed_plans INT NOT NULL DEFAULT 0,
  defaults_count INT NOT NULL DEFAULT 0,
  total_outstanding_microalgo BIGINT NOT NULL DEFAULT 0,
  later_on_score INT NOT NULL DEFAULT 500,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add later_on_score column to existing users table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'later_on_score'
  ) THEN
    ALTER TABLE users ADD COLUMN later_on_score INT NOT NULL DEFAULT 500;
  END IF;
END $$;

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

-- Gift cards table: stores gift card details for marketplace BNPL purchases
CREATE TABLE IF NOT EXISTS gift_cards (
  id SERIAL PRIMARY KEY,
  plan_id TEXT NOT NULL UNIQUE,
  reloadly_transaction_id BIGINT NOT NULL,
  product_id INTEGER NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  denomination INTEGER NOT NULL,
  code VARCHAR(255) NOT NULL,
  pin VARCHAR(255) NOT NULL,
  purchased_at_unix BIGINT NOT NULL,
  expires_at TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT fk_gift_card_plan FOREIGN KEY (plan_id) REFERENCES payment_plans(plan_id) ON DELETE CASCADE
);

-- Index for fast plan ID lookups
CREATE INDEX IF NOT EXISTS idx_gift_cards_plan_id ON gift_cards(plan_id);

-- ============================================================================
-- DPDP Consent and Score ASA Migration
-- ============================================================================

-- Consent records table: stores DPDP Act 2023 compliant consent records
CREATE TABLE IF NOT EXISTS consent_records (
  id SERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'credit_scoring',
  consent_timestamp BIGINT NOT NULL,
  txn_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_wallet_purpose UNIQUE (wallet_address, purpose)
);

-- Index for fast wallet address lookups
CREATE INDEX IF NOT EXISTS idx_consent_wallet ON consent_records(wallet_address);

-- Index for transaction ID lookups
CREATE INDEX IF NOT EXISTS idx_consent_txn ON consent_records(txn_id);

-- Data access log table: audit trail for DPDP compliance
CREATE TABLE IF NOT EXISTS data_access_log (
  id SERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  operation TEXT NOT NULL,
  accessed_by TEXT NOT NULL,
  accessed_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast wallet address lookups
CREATE INDEX IF NOT EXISTS idx_access_log_wallet ON data_access_log(wallet_address);

-- Index for timestamp-based queries (most recent first)
CREATE INDEX IF NOT EXISTS idx_access_log_timestamp ON data_access_log(accessed_at DESC);

-- Add score_asa_id column to users table for Score ASA tracking
DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'score_asa_id'
  ) THEN
    ALTER TABLE users ADD COLUMN score_asa_id BIGINT;
  END IF;
END $;

-- Index for Score ASA lookups
CREATE INDEX IF NOT EXISTS idx_users_score_asa ON users(score_asa_id);
