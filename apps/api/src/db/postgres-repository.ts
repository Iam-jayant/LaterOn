import type { Pool } from "pg";
import type { PlanRecord, UserProfile } from "@lateron/sdk";

/**
 * PostgreSQL repository for users and payment plans.
 * Replaces InMemoryStore for persistent storage.
 */
export class PostgresRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Initialize database tables and indexes.
   * Safe to call multiple times (uses IF NOT EXISTS).
   */
  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        wallet_address TEXT PRIMARY KEY,
        tier TEXT NOT NULL DEFAULT 'NEW',
        completed_plans INT NOT NULL DEFAULT 0,
        defaults_count INT NOT NULL DEFAULT 0,
        total_outstanding_microalgo BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);
    `);

    await this.pool.query(`
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
      CREATE INDEX IF NOT EXISTS idx_plans_plan_id ON payment_plans(plan_id);
      CREATE INDEX IF NOT EXISTS idx_plans_borrower ON payment_plans(borrower_wallet_address);
      CREATE INDEX IF NOT EXISTS idx_plans_status ON payment_plans(status);
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS lender_deposits (
        id SERIAL PRIMARY KEY,
        lender_wallet_address TEXT NOT NULL,
        amount_microalgo BIGINT NOT NULL,
        tx_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_deposits_lender ON lender_deposits(lender_wallet_address);
      CREATE INDEX IF NOT EXISTS idx_deposits_tx_id ON lender_deposits(tx_id);
    `);
  }

  /**
   * Get user profile by wallet address, creating if not exists.
   * Returns existing user or creates new user with NEW tier.
   */
  async getOrCreateUser(walletAddress: string): Promise<UserProfile> {
    const result = await this.pool.query(
      `INSERT INTO users (wallet_address, tier) 
       VALUES ($1, 'NEW')
       ON CONFLICT (wallet_address) 
       DO UPDATE SET updated_at = now()
       RETURNING *`,
      [walletAddress]
    );
    return this.mapUser(result.rows[0]);
  }

  /**
   * Save a new payment plan to the database.
   */
  async savePlan(plan: PlanRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO payment_plans (
        plan_id, 
        borrower_wallet_address, 
        merchant_id, 
        financed_amount_microalgo,
        remaining_amount_microalgo, 
        installments_paid, 
        next_due_unix, 
        status, 
        tier_at_approval
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        plan.planId,
        plan.walletAddress,
        plan.merchantId,
        Math.round(plan.financedAmountAlgo * 1_000_000),
        Math.round(plan.remainingAmountAlgo * 1_000_000),
        plan.installmentsPaid,
        plan.nextDueAtUnix,
        plan.status,
        plan.tierAtApproval,
      ]
    );
  }

  /**
   * Update an existing payment plan.
   * Only updates fields that are provided in the updates object.
   */
  async updatePlan(planId: string, updates: Partial<PlanRecord>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.remainingAmountAlgo !== undefined) {
      fields.push(`remaining_amount_microalgo = $${paramIndex++}`);
      values.push(Math.round(updates.remainingAmountAlgo * 1_000_000));
    }
    if (updates.installmentsPaid !== undefined) {
      fields.push(`installments_paid = $${paramIndex++}`);
      values.push(updates.installmentsPaid);
    }
    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.nextDueAtUnix !== undefined) {
      fields.push(`next_due_unix = $${paramIndex++}`);
      values.push(updates.nextDueAtUnix);
    }

    if (fields.length === 0) {
      return; // No updates to apply
    }

    fields.push(`updated_at = now()`);
    values.push(planId);

    await this.pool.query(
      `UPDATE payment_plans 
       SET ${fields.join(", ")} 
       WHERE plan_id = $${paramIndex}`,
      values
    );
  }

  /**
   * Get all payment plans for a specific wallet address.
   * Returns plans ordered by creation date (newest first).
   */
  async getPlansByWallet(walletAddress: string): Promise<PlanRecord[]> {
    const result = await this.pool.query(
      `SELECT * FROM payment_plans 
       WHERE borrower_wallet_address = $1 
       ORDER BY created_at DESC`,
      [walletAddress]
    );
    return result.rows.map((row) => this.mapPlan(row));
  }

  /**
   * Get all active and late plans for risk keeper processing.
   */
  async getActivePlans(): Promise<PlanRecord[]> {
    const result = await this.pool.query(
      `SELECT * FROM payment_plans 
       WHERE status IN ('ACTIVE', 'LATE')
       ORDER BY next_due_unix ASC`
    );
    return result.rows.map((row) => this.mapPlan(row));
  }

  /**
   * Map database row to UserProfile domain object.
   */
  private mapUser(row: any): UserProfile {
    return {
      walletAddress: row.wallet_address,
      tier: row.tier,
      completedPlans: row.completed_plans,
      defaults: row.defaults_count,
      latePayments: 0, // Not tracked in MVP schema
      activeOutstandingInr: row.total_outstanding_microalgo / 1_000_000,
    };
  }

  /**
   * Map database row to PlanRecord domain object.
   */
  private mapPlan(row: any): PlanRecord {
    return {
      planId: row.plan_id,
      walletAddress: row.borrower_wallet_address,
      merchantId: row.merchant_id,
      status: row.status,
      tierAtApproval: row.tier_at_approval,
      tenureMonths: 3, // Fixed for MVP
      aprPercent: 0, // Fixed for MVP (no interest)
      createdAtUnix: Math.floor(new Date(row.created_at).getTime() / 1000),
      nextDueAtUnix: row.next_due_unix,
      financedAmountInr: row.financed_amount_microalgo / 1_000_000,
      financedAmountAlgo: row.financed_amount_microalgo / 1_000_000,
      remainingAmountAlgo: row.remaining_amount_microalgo / 1_000_000,
      installmentsPaid: row.installments_paid,
      installments: [], // Not stored in MVP schema
    };
  }

  /**
   * Get a single payment plan by plan ID.
   */
  async getPlan(planId: string): Promise<PlanRecord | null> {
    const result = await this.pool.query(
      `SELECT * FROM payment_plans WHERE plan_id = $1`,
      [planId]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return this.mapPlan(result.rows[0]);
  }

  /**
   * Save a lender deposit to the database.
   * Records the deposit transaction for future withdrawal support.
   */
  async saveDeposit(lenderAddress: string, amountAlgo: number, txId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO lender_deposits (lender_wallet_address, amount_microalgo, tx_id)
       VALUES ($1, $2, $3)`,
      [lenderAddress, Math.round(amountAlgo * 1_000_000), txId]
    );
  }

  /**
   * Health check method to test database connectivity.
   * Returns true if database is accessible, throws error otherwise.
   */
  async healthCheck(): Promise<boolean> {
    await this.pool.query("SELECT 1");
    return true;
  }
}
