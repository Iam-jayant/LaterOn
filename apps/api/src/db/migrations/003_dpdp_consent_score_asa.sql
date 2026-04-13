-- ============================================================================
-- Migration 003: DPDP Consent and Score ASA
-- ============================================================================
-- This migration adds tables and columns for DPDP Act 2023 compliance and
-- Score ASA (Algorand Standard Asset) credit score representation.
--
-- Tables added:
-- - consent_records: Stores user consent for data processing
-- - data_access_log: Audit trail for data access operations
--
-- Columns added:
-- - users.score_asa_id: Tracks Score ASA ID for each user
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

-- Add banned_until_unix column to users table for ban management
DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'banned_until_unix'
  ) THEN
    ALTER TABLE users ADD COLUMN banned_until_unix BIGINT;
  END IF;
END $;

-- Index for checking active bans
CREATE INDEX IF NOT EXISTS idx_users_banned_until ON users(banned_until_unix);
