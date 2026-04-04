import type { LiquidityState, PlanRecord, UserProfile } from "@lateron/sdk";
import { Pool } from "pg";

interface SyncSnapshot {
  users: UserProfile[];
  plans: PlanRecord[];
  liquidity: LiquidityState;
  lastEventId: number;
}

export class PostgresMirror {
  private readonly pool: Pool | null;

  public constructor(databaseUrl?: string) {
    this.pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
  }

  public get enabled(): boolean {
    return this.pool !== null;
  }

  public async init(): Promise<void> {
    if (!this.pool) {
      return;
    }

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users_read_model (
        wallet_address TEXT PRIMARY KEY,
        tier TEXT NOT NULL,
        completed_plans INT NOT NULL,
        defaults_count INT NOT NULL,
        late_payments INT NOT NULL,
        active_outstanding_inr DOUBLE PRECISION NOT NULL,
        banned_until_unix BIGINT NULL,
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS plans_read_model (
        plan_id TEXT PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        merchant_id TEXT NOT NULL,
        status TEXT NOT NULL,
        tier_at_approval TEXT NOT NULL,
        tenure_months INT NOT NULL,
        apr_percent DOUBLE PRECISION NOT NULL,
        created_at_unix BIGINT NOT NULL,
        next_due_at_unix BIGINT NOT NULL,
        financed_amount_inr DOUBLE PRECISION NOT NULL,
        financed_amount_algo DOUBLE PRECISION NOT NULL,
        remaining_amount_algo DOUBLE PRECISION NOT NULL,
        installments_paid INT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS liquidity_read_model (
        id SMALLINT PRIMARY KEY,
        total_deposits_algo DOUBLE PRECISION NOT NULL,
        total_lent_algo DOUBLE PRECISION NOT NULL,
        reserve_algo DOUBLE PRECISION NOT NULL,
        available_algo DOUBLE PRECISION NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS mirror_sync_state (
        key TEXT PRIMARY KEY,
        value BIGINT NOT NULL
      );
    `);
  }

  public async sync(snapshot: SyncSnapshot): Promise<void> {
    if (!this.pool) {
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      for (const user of snapshot.users) {
        await client.query(
          `
            INSERT INTO users_read_model (
              wallet_address, tier, completed_plans, defaults_count, late_payments, active_outstanding_inr, banned_until_unix, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,now())
            ON CONFLICT (wallet_address) DO UPDATE SET
              tier = EXCLUDED.tier,
              completed_plans = EXCLUDED.completed_plans,
              defaults_count = EXCLUDED.defaults_count,
              late_payments = EXCLUDED.late_payments,
              active_outstanding_inr = EXCLUDED.active_outstanding_inr,
              banned_until_unix = EXCLUDED.banned_until_unix,
              updated_at = now()
          `,
          [
            user.walletAddress,
            user.tier,
            user.completedPlans,
            user.defaults,
            user.latePayments,
            user.activeOutstandingInr,
            user.bannedUntilUnix ?? null
          ]
        );
      }

      for (const plan of snapshot.plans) {
        await client.query(
          `
            INSERT INTO plans_read_model (
              plan_id, wallet_address, merchant_id, status, tier_at_approval, tenure_months, apr_percent, created_at_unix,
              next_due_at_unix, financed_amount_inr, financed_amount_algo, remaining_amount_algo, installments_paid, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
            ON CONFLICT (plan_id) DO UPDATE SET
              status = EXCLUDED.status,
              next_due_at_unix = EXCLUDED.next_due_at_unix,
              remaining_amount_algo = EXCLUDED.remaining_amount_algo,
              installments_paid = EXCLUDED.installments_paid,
              updated_at = now()
          `,
          [
            plan.planId,
            plan.walletAddress,
            plan.merchantId,
            plan.status,
            plan.tierAtApproval,
            plan.tenureMonths,
            plan.aprPercent,
            plan.createdAtUnix,
            plan.nextDueAtUnix,
            plan.financedAmountInr,
            plan.financedAmountAlgo,
            plan.remainingAmountAlgo,
            plan.installmentsPaid
          ]
        );
      }

      await client.query(
        `
          INSERT INTO liquidity_read_model (
            id, total_deposits_algo, total_lent_algo, reserve_algo, available_algo, updated_at
          ) VALUES (1,$1,$2,$3,$4,now())
          ON CONFLICT (id) DO UPDATE SET
            total_deposits_algo = EXCLUDED.total_deposits_algo,
            total_lent_algo = EXCLUDED.total_lent_algo,
            reserve_algo = EXCLUDED.reserve_algo,
            available_algo = EXCLUDED.available_algo,
            updated_at = now()
        `,
        [
          snapshot.liquidity.totalDepositsAlgo,
          snapshot.liquidity.totalLentAlgo,
          snapshot.liquidity.reserveAlgo,
          snapshot.liquidity.availableAlgo
        ]
      );

      await client.query(
        `
          INSERT INTO mirror_sync_state (key, value)
          VALUES ('last_event_id', $1)
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        `,
        [snapshot.lastEventId]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
