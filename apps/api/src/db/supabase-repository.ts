import type { PlanRecord, UserProfile } from "@lateron/sdk";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase repository for users and payment plans.
 * Drop-in replacement for PostgresRepository using Supabase JS client.
 */
export class SupabaseRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Initialize database tables and indexes.
   * Tables are already created via Supabase MCP, so this is a no-op.
   */
  async init(): Promise<void> {
    // Tables already created via Supabase MCP
    // Skip connection test - will fail on first actual query if there's an issue
    console.log("[SupabaseRepository] Initialized (tables already exist via MCP)");
  }

  /**
   * Get user profile by wallet address, creating if not exists.
   */
  async getOrCreateUser(walletAddress: string): Promise<UserProfile> {
    const { data, error } = await this.supabase
      .from("users")
      .upsert(
        {
          wallet_address: walletAddress,
          tier: "NEW",
          later_on_score: 500,
          completed_plans: 0,
          defaults_count: 0,
          total_outstanding_microalgo: 0,
          email: null,
          name: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "wallet_address" }
      )
      .select()
      .single();

    if (error) throw error;
    return this.mapUser(data);
  }

  /**
   * Update user profile in the database.
   */
  async updateUser(profile: UserProfile): Promise<void> {
    const { error } = await this.supabase
      .from("users")
      .update({
        tier: profile.tier,
        completed_plans: profile.completedPlans,
        defaults_count: profile.defaults,
        total_outstanding_microalgo: Math.round(profile.activeOutstandingInr * 1_000_000),
        later_on_score: profile.laterOnScore,
        updated_at: new Date().toISOString(),
      })
      .eq("wallet_address", profile.walletAddress);

    if (error) throw error;
  }

  /**
   * Save a new payment plan to the database.
   */
  async savePlan(plan: PlanRecord): Promise<void> {
    const { error } = await this.supabase.from("payment_plans").insert({
      plan_id: plan.planId,
      borrower_wallet_address: plan.walletAddress,
      merchant_id: plan.merchantId,
      financed_amount_microalgo: Math.round(plan.financedAmountAlgo * 1_000_000),
      remaining_amount_microalgo: Math.round(plan.remainingAmountAlgo * 1_000_000),
      installments_paid: plan.installmentsPaid,
      next_due_unix: plan.nextDueAtUnix,
      status: plan.status,
      tier_at_approval: plan.tierAtApproval,
    });

    if (error) throw error;
  }

  /**
   * Update an existing payment plan.
   */
  async updatePlan(planId: string, updates: Partial<PlanRecord>): Promise<void> {
    const updateData: any = { updated_at: new Date().toISOString() };

    if (updates.remainingAmountAlgo !== undefined) {
      updateData.remaining_amount_microalgo = Math.round(updates.remainingAmountAlgo * 1_000_000);
    }
    if (updates.installmentsPaid !== undefined) {
      updateData.installments_paid = updates.installmentsPaid;
    }
    if (updates.status !== undefined) {
      updateData.status = updates.status;
    }
    if (updates.nextDueAtUnix !== undefined) {
      updateData.next_due_unix = updates.nextDueAtUnix;
    }

    const { error } = await this.supabase
      .from("payment_plans")
      .update(updateData)
      .eq("plan_id", planId);

    if (error) throw error;
  }

  /**
   * Get all payment plans for a specific wallet address.
   */
  async getPlansByWallet(walletAddress: string): Promise<PlanRecord[]> {
    const { data, error } = await this.supabase
      .from("payment_plans")
      .select(`
        *,
        gift_cards (
          product_id,
          product_name,
          denomination
        )
      `)
      .eq("borrower_wallet_address", walletAddress)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []).map((row) => this.mapPlan(row));
  }

  /**
   * Get all active and late plans for risk keeper processing.
   */
  async getActivePlans(): Promise<PlanRecord[]> {
    const { data, error} = await this.supabase
      .from("payment_plans")
      .select("*")
      .in("status", ["ACTIVE", "LATE"])
      .order("next_due_unix", { ascending: true });

    if (error) throw error;
    return (data || []).map((row) => this.mapPlan(row));
  }

  /**
   * Get a single payment plan by plan ID.
   */
  async getPlan(planId: string): Promise<PlanRecord | null> {
    const { data, error } = await this.supabase
      .from("payment_plans")
      .select("*")
      .eq("plan_id", planId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null; // Not found
      throw error;
    }
    return this.mapPlan(data);
  }

  /**
   * Save a lender deposit to the database.
   */
  async saveDeposit(lenderAddress: string, amountAlgo: number, txId: string): Promise<void> {
    const { error } = await this.supabase.from("lender_deposits").insert({
      lender_wallet_address: lenderAddress,
      amount_microalgo: Math.round(amountAlgo * 1_000_000),
      tx_id: txId,
    });

    if (error) throw error;
  }

  /**
   * Health check method to test database connectivity.
   */
  async healthCheck(): Promise<boolean> {
    const { error } = await this.supabase.from("users").select("count").limit(1);
    if (error) throw error;
    return true;
  }

  /**
   * Insert a gift card record associated with a BNPL plan.
   */
  async insertGiftCard(giftCard: {
    planId: string;
    reloadlyTransactionId: number;
    productId: number;
    productName: string;
    denomination: number;
    code: string;
    pin: string;
    purchasedAtUnix: number;
    expiresAt: string | null;
  }): Promise<void> {
    const { error } = await this.supabase.from("gift_cards").insert({
      plan_id: giftCard.planId,
      reloadly_transaction_id: giftCard.reloadlyTransactionId,
      product_id: giftCard.productId,
      product_name: giftCard.productName,
      denomination: giftCard.denomination,
      code: giftCard.code,
      pin: giftCard.pin,
      purchased_at_unix: giftCard.purchasedAtUnix,
      expires_at: giftCard.expiresAt,
    });

    if (error) throw error;
  }

  /**
   * Get gift card details by plan ID.
   */
  async getGiftCardByPlanId(planId: string): Promise<{
    planId: string;
    reloadlyTransactionId: number;
    productId: number;
    productName: string;
    denomination: number;
    code: string;
    pin: string;
    purchasedAtUnix: number;
    expiresAt: string | null;
  } | null> {
    const { data, error } = await this.supabase
      .from("gift_cards")
      .select("*")
      .eq("plan_id", planId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null; // Not found
      throw error;
    }

    return {
      planId: data.plan_id,
      reloadlyTransactionId: data.reloadly_transaction_id,
      productId: data.product_id,
      productName: data.product_name,
      denomination: data.denomination,
      code: data.code,
      pin: data.pin,
      purchasedAtUnix: data.purchased_at_unix,
      expiresAt: data.expires_at,
    };
  }

  /**
   * Get all gift cards for a wallet address.
   * Joins gift_cards with payment_plans to filter by wallet_address.
   */
  async getGiftCardsByWallet(walletAddress: string): Promise<Array<{
    planId: string;
    reloadlyTransactionId: number;
    productId: number;
    productName: string;
    denomination: number;
    code: string;
    pin: string;
    purchasedAtUnix: number;
    expiresAt: string | null;
  }>> {
    const { data, error } = await this.supabase
      .from("gift_cards")
      .select(`
        plan_id,
        reloadly_transaction_id,
        product_id,
        product_name,
        denomination,
        code,
        pin,
        purchased_at_unix,
        expires_at,
        payment_plans!inner(wallet_address)
      `)
      .eq("payment_plans.wallet_address", walletAddress)
      .order("purchased_at_unix", { ascending: false });

    if (error) throw error;

    return (data || []).map(row => ({
      planId: row.plan_id,
      reloadlyTransactionId: row.reloadly_transaction_id,
      productId: row.product_id,
      productName: row.product_name,
      denomination: row.denomination,
      code: row.code,
      pin: row.pin,
      purchasedAtUnix: row.purchased_at_unix,
      expiresAt: row.expires_at,
    }));
  }

  // ============================================================================
  // DPDP Consent and Score ASA Methods
  // ============================================================================

  /**
   * Save a consent record to the database.
   */
  async saveConsentRecord(params: {
    walletAddress: string;
    purpose: string;
    consentTimestamp: number;
    txnId: string;
    ipHash: string;
  }): Promise<{ id: number }> {
    const { data, error } = await this.supabase
      .from("consent_records")
      .insert({
        wallet_address: params.walletAddress,
        purpose: params.purpose,
        consent_timestamp: params.consentTimestamp,
        txn_id: params.txnId,
        ip_hash: params.ipHash,
      })
      .select("id")
      .single();

    if (error) throw error;
    return { id: data.id };
  }

  /**
   * Check if a consent record exists for a wallet and purpose.
   */
  async getConsentRecord(walletAddress: string, purpose: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("consent_records")
      .select("id")
      .eq("wallet_address", walletAddress)
      .eq("purpose", purpose)
      .limit(1);

    if (error) throw error;
    return (data || []).length > 0;
  }

  /**
   * Insert a data access log entry for audit trail.
   */
  async insertDataAccessLog(params: {
    walletAddress: string;
    operation: string;
    accessedBy: string;
  }): Promise<void> {
    const { error } = await this.supabase.from("data_access_log").insert({
      wallet_address: params.walletAddress,
      operation: params.operation,
      accessed_by: params.accessedBy,
    });

    if (error) throw error;
  }

  /**
   * Get all data access logs for a wallet address.
   */
  async getDataAccessLogs(walletAddress: string): Promise<Array<{
    id: number;
    walletAddress: string;
    operation: string;
    accessedBy: string;
    accessedAt: Date;
  }>> {
    const { data, error } = await this.supabase
      .from("data_access_log")
      .select("*")
      .eq("wallet_address", walletAddress)
      .order("accessed_at", { ascending: false });

    if (error) throw error;
    return (data || []).map((row) => ({
      id: row.id,
      walletAddress: row.wallet_address,
      operation: row.operation,
      accessedBy: row.accessed_by,
      accessedAt: new Date(row.accessed_at),
    }));
  }

  /**
   * Update the score_asa_id for a user.
   */
  async updateUserScoreASAId(walletAddress: string, asaId: number | null): Promise<void> {
    const { error } = await this.supabase
      .from("users")
      .update({
        score_asa_id: asaId,
        updated_at: new Date().toISOString(),
      })
      .eq("wallet_address", walletAddress);

    if (error) throw error;
  }

  /**
   * Update the later_on_score for a user.
   */
  async updateUserScore(walletAddress: string, score: number): Promise<void> {
    const { error } = await this.supabase
      .from("users")
      .update({
        later_on_score: score,
        updated_at: new Date().toISOString(),
      })
      .eq("wallet_address", walletAddress);

    if (error) throw error;
  }

  /**
   * Update user profile (name and email).
   */
  async updateUserProfile(walletAddress: string, profile: { name?: string; email?: string }): Promise<void> {
    console.log('Updating profile for wallet:', walletAddress);
    console.log('Profile data:', { name: profile.name, email: profile.email });

    const updates: any = {
      wallet_address: walletAddress,
      updated_at: new Date().toISOString(),
    };

    if (profile.name !== undefined) {
      updates.name = profile.name;
    }

    if (profile.email !== undefined) {
      updates.email = profile.email;
    }

    const { error } = await this.supabase
      .from("users")
      .upsert(updates, { onConflict: 'wallet_address' });

    if (error) {
      console.error('Supabase upsert error:', error);
      throw error;
    }

    console.log('Profile updated successfully');
  }

  /**
   * Update the banned_until_unix for a user.
   */
  async updateUserBan(walletAddress: string, bannedUntilUnix: number | null): Promise<void> {
    const { error } = await this.supabase
      .from("users")
      .update({
        banned_until_unix: bannedUntilUnix,
        updated_at: new Date().toISOString(),
      })
      .eq("wallet_address", walletAddress);

    if (error) throw error;
  }

  /**
   * Delete all user data for DPDP right to erasure.
   */
  async deleteUserData(walletAddress: string): Promise<void> {
    // Mark payment plans as DELETED (preserve for audit)
    await this.supabase
      .from("payment_plans")
      .update({
        status: "DELETED",
        updated_at: new Date().toISOString(),
      })
      .eq("borrower_wallet_address", walletAddress);

    // Delete consent records
    await this.supabase
      .from("consent_records")
      .delete()
      .eq("wallet_address", walletAddress);

    // Delete data access logs
    await this.supabase
      .from("data_access_log")
      .delete()
      .eq("wallet_address", walletAddress);

    // Delete user record
    const { error } = await this.supabase
      .from("users")
      .delete()
      .eq("wallet_address", walletAddress);

    if (error) throw error;
  }

  /**
   * Get user by wallet address (without creating if not exists).
   */
  async getUser(walletAddress: string): Promise<UserProfile | null> {
    const { data, error } = await this.supabase
      .from("users")
      .select("*")
      .eq("wallet_address", walletAddress)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null; // Not found
      throw error;
    }
    return this.mapUser(data);
  }

  /**
   * Map database row to UserProfile domain object.
   */
  private mapUser(row: any): UserProfile {
    return {
      walletAddress: row.wallet_address,
      tier: row.tier,
      completedPlans: row.completed_plans || 0,
      defaults: row.defaults_count || 0,
      latePayments: 0,
      activeOutstandingInr: (row.total_outstanding_microalgo || 0) / 1_000_000,
      laterOnScore: row.later_on_score ?? 500,
      bannedUntilUnix: row.banned_until_unix ?? undefined,
      scoreAsaId: row.score_asa_id ?? undefined,
    } as any;
  }

  /**
   * Map database row to PlanRecord domain object.
   */
  private mapPlan(row: any): PlanRecord {
    const plan: PlanRecord = {
      planId: row.plan_id,
      walletAddress: row.borrower_wallet_address,
      merchantId: row.merchant_id,
      status: row.status,
      tierAtApproval: row.tier_at_approval,
      tenureMonths: 3,
      aprPercent: 0,
      createdAtUnix: Math.floor(new Date(row.created_at).getTime() / 1000),
      nextDueAtUnix: row.next_due_unix,
      financedAmountInr: row.financed_amount_microalgo / 1_000_000,
      financedAmountAlgo: row.financed_amount_microalgo / 1_000_000,
      remainingAmountAlgo: row.remaining_amount_microalgo / 1_000_000,
      installmentsPaid: row.installments_paid,
      installments: [],
    };
    
    // Add gift card details if available (from joined gift_cards table)
    if (row.gift_cards && Array.isArray(row.gift_cards) && row.gift_cards.length > 0) {
      const giftCard = row.gift_cards[0];
      plan.giftCardDetails = {
        productId: giftCard.product_id,
        productName: giftCard.product_name,
        denomination: giftCard.denomination
      };
    }
    
    return plan;
  }
}
