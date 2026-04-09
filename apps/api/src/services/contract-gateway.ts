import {
  applyRiskOutcomeToProfile,
  deriveRiskStatus,
  determineTier,
  generateInstallmentDueDates,
  getDownPaymentRatioForTier,
  TIER_CAPS,
  applyOnTimePaymentScoreIncrease,
  applyCompletionBonus,
  applyOverdueScoreDecrease,
  type CheckoutQuote,
  type GiftCardMetadata,
  type LiquidityState,
  type PlanRecord,
  type UserProfile
} from "@lateron/sdk";
import { InsufficientPoolLiquidityError, NotFoundError, ValidationError } from "../errors";
import { createId } from "../lib/ids";
import { logBlockchainTransaction } from "../lib/logger";
import { nowUnix } from "../lib/time";
import { PostgresRepository } from "../db/postgres-repository";
import { AlgorandAppService } from "./algorand-app-service";
import type { ContractEvent, InMemoryStore, ProtocolParams } from "./store";

export class ContractGateway {
  public constructor(
    private readonly store: InMemoryStore,
    private readonly chainService?: AlgorandAppService,
    private readonly repository?: PostgresRepository
  ) {}

  public async getOrCreateUser(walletAddress: string): Promise<UserProfile> {
    // Use PostgresRepository if available, otherwise fall back to InMemoryStore
    if (this.repository) {
      return await this.repository.getOrCreateUser(walletAddress);
    }

    const existing = this.store.users.get(walletAddress);
    if (existing) {
      return existing;
    }

    const created: UserProfile = {
      walletAddress,
      tier: "NEW",
      completedPlans: 0,
      defaults: 0,
      latePayments: 0,
      activeOutstandingInr: 0,
      laterOnScore: 500
    };
    this.store.users.set(walletAddress, created);
    return created;
  }

  public getProtocolParams(): ProtocolParams {
    return this.store.protocolParams;
  }

  public updateProtocolParams(next: Partial<ProtocolParams>): ProtocolParams {
    this.store.protocolParams = {
      ...this.store.protocolParams,
      ...next
    };
    this.emit("protocol.updated", this.store.protocolParams);
    return this.store.protocolParams;
  }

  public getLiquidityState(): LiquidityState {
    return this.store.liquidity;
  }

  public async depositLiquidity(walletAddress: string, amountAlgo: number): Promise<LiquidityState> {
    if (amountAlgo <= 0) {
      throw new ValidationError("Deposit amount must be positive");
    }

    const chainTx = await this.chainService?.poolDeposit(amountAlgo);
    
    // Log blockchain transaction
    if (chainTx) {
      logBlockchainTransaction({
        operation: "pool_deposit",
        txId: chainTx.txId,
        sender: walletAddress,
        amount: amountAlgo
      });
    }
    
    this.store.liquidity.totalDepositsAlgo += amountAlgo;
    this.store.liquidity.availableAlgo += amountAlgo;
    this.emit("liquidity.deposited", { walletAddress, amountAlgo, chainTx });
    return this.store.liquidity;
  }

  public async withdrawLiquidity(walletAddress: string, amountAlgo: number): Promise<LiquidityState> {
    if (amountAlgo <= 0) {
      throw new ValidationError("Withdraw amount must be positive");
    }

    if (amountAlgo > this.store.liquidity.availableAlgo) {
      throw new ValidationError("Insufficient available liquidity");
    }

    if (this.chainService?.isEnabled()) {
      throw new ValidationError("On-chain withdraw is not supported in current TestNet contract version");
    }

    this.store.liquidity.availableAlgo -= amountAlgo;
    this.store.liquidity.totalDepositsAlgo -= amountAlgo;
    this.emit("liquidity.withdrawn", { walletAddress, amountAlgo });
    return this.store.liquidity;
  }

  public registerQuote(quote: CheckoutQuote): CheckoutQuote {
    this.store.quotes.set(quote.quoteId, quote);
    this.emit("quote.created", {
      quoteId: quote.quoteId,
      walletAddress: quote.walletAddress
    });
    return quote;
  }

  public getQuote(quoteId: string): CheckoutQuote {
    const quote = this.store.quotes.get(quoteId);
    if (!quote) {
      throw new NotFoundError("Quote not found");
    }
    return quote;
  }

  public async getPlan(planId: string): Promise<PlanRecord> {
    // Use PostgresRepository if available, otherwise fall back to InMemoryStore
    if (this.repository) {
      const plan = await this.repository.getPlan(planId);
      if (!plan) {
        throw new NotFoundError("Plan not found");
      }
      return plan;
    }

    const plan = this.store.plans.get(planId);
    if (!plan) {
      throw new NotFoundError("Plan not found");
    }
    return plan;
  }

  public async createPlanFromQuote(quoteId: string): Promise<PlanRecord> {
    if (this.store.protocolParams.paused) {
      throw new ValidationError("Protocol is paused");
    }

    const quote = this.getQuote(quoteId);
    if (quote.expiresAtUnix < nowUnix()) {
      throw new ValidationError("Quote expired");
    }

    const user = await this.getOrCreateUser(quote.walletAddress);
    if (user.bannedUntilUnix && user.bannedUntilUnix > nowUnix()) {
      throw new ValidationError("Wallet is temporarily banned due to defaults");
    }

    const caps = TIER_CAPS[user.tier];
    if (quote.orderAmountInr > caps.maxOrderInr) {
      throw new ValidationError("Order exceeds tier max order cap");
    }
    if (user.activeOutstandingInr + quote.financedAmountInr > caps.maxOutstandingInr) {
      throw new ValidationError("Order exceeds tier max outstanding cap");
    }

    if (quote.financedAmountAlgo > this.store.liquidity.availableAlgo) {
      throw new InsufficientPoolLiquidityError({
        availableAlgo: this.store.liquidity.availableAlgo,
        requiredAlgo: quote.financedAmountAlgo,
        quoteId: quote.quoteId
      });
    }

    const planId = createId("plan");
    const createdAtUnix = nowUnix();
    const dueDates = generateInstallmentDueDates(createdAtUnix, quote.tenureMonths);
    const installmentAmountAlgo =
      quote.installmentAmountAlgo > 0
        ? quote.installmentAmountAlgo
        : quote.tenureMonths > 0
          ? quote.financedAmountAlgo / quote.tenureMonths
          : quote.financedAmountAlgo;

    const installments = dueDates.map((dueAtUnix, index) => ({
      installmentNumber: index + 1,
      dueAtUnix,
      amountAlgo: installmentAmountAlgo
    }));

    const plan: PlanRecord = {
      planId,
      walletAddress: quote.walletAddress,
      merchantId: quote.merchantId,
      status: "ACTIVE",
      tierAtApproval: user.tier,
      tenureMonths: quote.tenureMonths,
      aprPercent: quote.monthlyRate * 12 * 100,
      createdAtUnix,
      nextDueAtUnix: installments[0]?.dueAtUnix ?? createdAtUnix,
      financedAmountInr: quote.financedAmountInr,
      financedAmountAlgo: quote.financedAmountAlgo,
      remainingAmountAlgo: quote.financedAmountAlgo,
      installmentsPaid: 0,
      installments
    };

    const bnplChainTx = await this.chainService?.createPlan(quote.financedAmountAlgo);
    const poolChainTx = await this.chainService?.poolLendOut(quote.financedAmountAlgo);

    // Log blockchain transactions
    if (bnplChainTx) {
      logBlockchainTransaction({
        operation: "create_plan",
        txId: bnplChainTx.txId,
        sender: quote.walletAddress,
        amount: quote.financedAmountAlgo
      });
    }
    if (poolChainTx) {
      logBlockchainTransaction({
        operation: "pool_lend_out",
        txId: poolChainTx.txId,
        sender: quote.walletAddress,
        amount: quote.financedAmountAlgo
      });
    }

    // Save to PostgresRepository if available
    if (this.repository) {
      await this.repository.savePlan(plan);
    } else {
      this.store.plans.set(plan.planId, plan);
    }

    this.store.liquidity.availableAlgo -= quote.financedAmountAlgo;
    this.store.liquidity.totalLentAlgo += quote.financedAmountAlgo;
    user.activeOutstandingInr += quote.financedAmountInr;
    user.tier = determineTier(user);
    this.store.users.set(user.walletAddress, user);
    this.store.quotes.delete(quoteId);

    this.emit("plan.created", {
      planId: plan.planId,
      walletAddress: plan.walletAddress,
      merchantId: plan.merchantId,
      financedAmountAlgo: plan.financedAmountAlgo,
      bnplChainTx,
      poolChainTx
    });

    return plan;
  }

  public async repayInstallment(planId: string, amountAlgo: number): Promise<PlanRecord> {
    if (this.store.protocolParams.paused) {
      throw new ValidationError("Protocol is paused");
    }

    // Get plan using the getPlan method
    const plan = await this.getPlan(planId);

    if (plan.status === "DEFAULTED" || plan.status === "COMPLETED" || plan.status === "CANCELLED") {
      throw new ValidationError("Plan is not repayable in current state");
    }
    if (amountAlgo <= 0) {
      throw new ValidationError("Repayment amount must be positive");
    }

    await this.syncRisk(planId);

    const protocol = this.store.protocolParams;
    const reserveCut = amountAlgo * protocol.reserveRatio;
    const liquidityCut = amountAlgo - reserveCut;
    const bnplChainTx = await this.chainService?.repayInstallment(amountAlgo);
    const poolChainTx = await this.chainService?.poolRecordRepayment(amountAlgo, reserveCut);

    // Log blockchain transactions
    if (bnplChainTx) {
      logBlockchainTransaction({
        operation: "repay_installment",
        txId: bnplChainTx.txId,
        sender: plan.walletAddress,
        amount: amountAlgo
      });
    }
    if (poolChainTx) {
      logBlockchainTransaction({
        operation: "pool_record_repayment",
        txId: poolChainTx.txId,
        sender: plan.walletAddress,
        amount: amountAlgo
      });
    }

    this.store.liquidity.reserveAlgo += reserveCut;
    this.store.liquidity.availableAlgo += liquidityCut;

    plan.remainingAmountAlgo = Math.max(0, plan.remainingAmountAlgo - amountAlgo);
    plan.installmentsPaid += 1;
    plan.nextDueAtUnix = plan.installments[plan.installmentsPaid]?.dueAtUnix ?? nowUnix();

    const user = await this.getOrCreateUser(plan.walletAddress);
    
    // Check if payment is on-time (before or on due date)
    const isOnTime = nowUnix() <= plan.nextDueAtUnix;
    
    // Apply on-time payment score increase (Requirement 10.1)
    let updatedUser = user;
    if (isOnTime) {
      updatedUser = applyOnTimePaymentScoreIncrease(updatedUser);
    }
    
    if (plan.remainingAmountAlgo === 0) {
      plan.status = "COMPLETED";
      updatedUser.completedPlans += 1;
      updatedUser.activeOutstandingInr = Math.max(0, updatedUser.activeOutstandingInr - plan.financedAmountInr);
      updatedUser.tier = determineTier(updatedUser);
      
      // Apply completion bonus (Requirement 10.3)
      updatedUser = applyCompletionBonus(updatedUser);
    } else if (plan.status === "LATE") {
      plan.status = "ACTIVE";
    }

    // Update plan in PostgresRepository if available
    if (this.repository) {
      await this.repository.updatePlan(plan.planId, {
        remainingAmountAlgo: plan.remainingAmountAlgo,
        installmentsPaid: plan.installmentsPaid,
        status: plan.status,
        nextDueAtUnix: plan.nextDueAtUnix
      });
      await this.repository.updateUser(updatedUser);
    } else {
      this.store.plans.set(plan.planId, plan);
    }

    this.store.users.set(updatedUser.walletAddress, updatedUser);

    this.emit("installment.paid", {
      planId: plan.planId,
      amountAlgo,
      installmentsPaid: plan.installmentsPaid,
      remainingAmountAlgo: plan.remainingAmountAlgo,
      bnplChainTx,
      poolChainTx
    });

    return plan;
  }

  public async syncRisk(planId: string, atUnix = nowUnix()): Promise<PlanRecord> {
    // Get plan using the getPlan method
    const plan = await this.getPlan(planId);

    const previousStatus = plan.status;
    const transition = deriveRiskStatus(plan, atUnix);
    if (transition.nextStatus === previousStatus) {
      return plan;
    }

    const chainTx = await this.chainService?.settleRisk();
    
    // Log blockchain transaction
    if (chainTx) {
      logBlockchainTransaction({
        operation: "settle_risk",
        txId: chainTx.txId,
        sender: plan.walletAddress
      });
    }
    
    plan.status = transition.nextStatus;

    const user = await this.getOrCreateUser(plan.walletAddress);
    let updatedProfile = applyRiskOutcomeToProfile(user, previousStatus, transition.nextStatus, atUnix);
    
    // Apply score decrease for overdue installments (Requirement 10.7)
    if (transition.isLateTransition || transition.isDefaultTransition) {
      updatedProfile = applyOverdueScoreDecrease(updatedProfile);
    }
    
    this.store.users.set(user.walletAddress, updatedProfile);

    // Update plan in PostgresRepository if available
    if (this.repository) {
      await this.repository.updatePlan(planId, { status: plan.status });
      await this.repository.updateUser(updatedProfile);
    } else {
      this.store.plans.set(planId, plan);
    }

    this.emit("risk.settled", {
      planId,
      previousStatus,
      nextStatus: transition.nextStatus,
      walletAddress: plan.walletAddress,
      chainTx
    });

    return plan;
  }

  public async settleRisk(planId: string, atUnix = nowUnix()): Promise<PlanRecord> {
    return this.syncRisk(planId, atUnix);
  }

  public async listPlansByWallet(walletAddress: string): Promise<PlanRecord[]> {
    // Use PostgresRepository if available, otherwise fall back to InMemoryStore
    if (this.repository) {
      return await this.repository.getPlansByWallet(walletAddress);
    }

    const rows: PlanRecord[] = [];
    for (const plan of this.store.plans.values()) {
      if (plan.walletAddress === walletAddress) {
        rows.push(plan);
      }
    }
    return rows;
  }

  public listAllPlans(): PlanRecord[] {
    return [...this.store.plans.values()];
  }

  public listUsers(): UserProfile[] {
    return [...this.store.users.values()];
  }

  public listEvents(fromIdExclusive = 0): ContractEvent[] {
    return this.store.events.filter((event) => event.id > fromIdExclusive);
  }

  /**
   * Create a BNPL plan for a gift card purchase with gift card metadata.
   * This method extends createPlanFromQuote to include gift card details in the plan state.
   * 
   * @param quoteId - Quote ID from marketplace quote
   * @param giftCardMetadata - Gift card details (product info, code, PIN)
   * @returns Created plan record with gift card metadata
   */
  public async createGiftCardPlan(
    quoteId: string,
    giftCardMetadata: GiftCardMetadata
  ): Promise<PlanRecord> {
    // Create the base plan using existing logic
    const plan = await this.createPlanFromQuote(quoteId);

    // Attach gift card metadata to the plan
    plan.giftCardDetails = giftCardMetadata;

    // Update plan in PostgresRepository if available
    if (this.repository) {
      await this.repository.updatePlan(plan.planId, {
        giftCardDetails: giftCardMetadata
      });
    } else {
      this.store.plans.set(plan.planId, plan);
    }

    this.emit("giftcard.attached", {
      planId: plan.planId,
      productId: giftCardMetadata.productId,
      productName: giftCardMetadata.productName,
      reloadlyTransactionId: giftCardMetadata.reloadlyTransactionId
    });

    return plan;
  }

  /**
   * Attach gift card metadata to an existing plan.
   * Used when gift card fulfillment happens after plan creation.
   * 
   * @param planId - Plan ID to attach gift card to
   * @param giftCardMetadata - Gift card details (product info, code, PIN)
   */
  public async attachGiftCardToPlan(
    planId: string,
    giftCardMetadata: GiftCardMetadata
  ): Promise<void> {
    // Get plan using the getPlan method
    const plan = await this.getPlan(planId);

    // Attach gift card metadata
    plan.giftCardDetails = giftCardMetadata;

    // Update plan in PostgresRepository if available
    if (this.repository) {
      await this.repository.updatePlan(planId, {
        giftCardDetails: giftCardMetadata
      });
    } else {
      this.store.plans.set(planId, plan);
    }

    this.emit("giftcard.attached", {
      planId,
      productId: giftCardMetadata.productId,
      productName: giftCardMetadata.productName,
      reloadlyTransactionId: giftCardMetadata.reloadlyTransactionId
    });
  }

  /**
   * Build unsigned transactions for a marketplace quote without submitting them.
   * Returns base64-encoded unsigned transactions for frontend signing.
   * 
   * @param quoteId - Quote ID from marketplace quote
   * @returns Array of base64-encoded unsigned transactions
   */
  public async buildUnsignedTransactionsFromQuote(quoteId: string): Promise<string[]> {
    if (this.store.protocolParams.paused) {
      throw new ValidationError("Protocol is paused");
    }

    const quote = this.getQuote(quoteId);
    if (quote.expiresAtUnix < nowUnix()) {
      throw new ValidationError("Quote expired");
    }

    const user = await this.getOrCreateUser(quote.walletAddress);
    if (user.bannedUntilUnix && user.bannedUntilUnix > nowUnix()) {
      throw new ValidationError("Wallet is temporarily banned due to defaults");
    }

    const caps = TIER_CAPS[user.tier];
    if (quote.orderAmountInr > caps.maxOrderInr) {
      throw new ValidationError("Order exceeds tier max order cap");
    }
    if (user.activeOutstandingInr + quote.financedAmountInr > caps.maxOutstandingInr) {
      throw new ValidationError("Order exceeds tier max outstanding cap");
    }

    if (quote.financedAmountAlgo > this.store.liquidity.availableAlgo) {
      throw new InsufficientPoolLiquidityError({
        availableAlgo: this.store.liquidity.availableAlgo,
        requiredAlgo: quote.financedAmountAlgo,
        quoteId: quote.quoteId
      });
    }

    // Build unsigned transactions using the chain service
    if (!this.chainService) {
      throw new ValidationError("Blockchain service not available");
    }

    const unsignedTxns = await this.chainService.buildMarketplaceTransactions(
      quote.walletAddress,
      quote.financedAmountAlgo
    );

    return unsignedTxns;
  }

  /**
   * Submit signed transactions and create a plan from a quote.
   * Used after frontend has signed the transactions.
   * 
   * @param quoteId - Quote ID from marketplace quote
   * @param signedTransactions - Array of base64-encoded signed transactions
   * @returns Created plan record
   */
  public async createPlanFromSignedTransactions(
    quoteId: string,
    signedTransactions: string[]
  ): Promise<PlanRecord> {
    if (this.store.protocolParams.paused) {
      throw new ValidationError("Protocol is paused");
    }

    const quote = this.getQuote(quoteId);
    if (quote.expiresAtUnix < nowUnix()) {
      throw new ValidationError("Quote expired");
    }

    const user = await this.getOrCreateUser(quote.walletAddress);

    // Submit signed transactions to blockchain
    if (!this.chainService) {
      throw new ValidationError("Blockchain service not available");
    }

    const txId = await this.chainService.submitSignedTransactions(signedTransactions);

    // Log blockchain transaction
    logBlockchainTransaction({
      operation: "marketplace_checkout",
      txId,
      sender: quote.walletAddress,
      amount: quote.financedAmountAlgo
    });

    // Create plan record
    const planId = createId("plan");
    const createdAtUnix = nowUnix();
    const dueDates = generateInstallmentDueDates(createdAtUnix, quote.tenureMonths);
    const installmentAmountAlgo =
      quote.installmentAmountAlgo > 0
        ? quote.installmentAmountAlgo
        : quote.tenureMonths > 0
          ? quote.financedAmountAlgo / quote.tenureMonths
          : quote.financedAmountAlgo;

    const installments = dueDates.map((dueAtUnix, index) => ({
      installmentNumber: index + 1,
      dueAtUnix,
      amountAlgo: installmentAmountAlgo
    }));

    const plan: PlanRecord = {
      planId,
      walletAddress: quote.walletAddress,
      merchantId: quote.merchantId,
      status: "ACTIVE",
      tierAtApproval: user.tier,
      tenureMonths: quote.tenureMonths,
      aprPercent: quote.monthlyRate * 12 * 100,
      createdAtUnix,
      nextDueAtUnix: installments[0]?.dueAtUnix ?? createdAtUnix,
      financedAmountInr: quote.financedAmountInr,
      financedAmountAlgo: quote.financedAmountAlgo,
      remainingAmountAlgo: quote.financedAmountAlgo,
      installmentsPaid: 0,
      installments
    };

    // Save to PostgresRepository if available
    if (this.repository) {
      await this.repository.savePlan(plan);
    } else {
      this.store.plans.set(plan.planId, plan);
    }

    this.store.liquidity.availableAlgo -= quote.financedAmountAlgo;
    this.store.liquidity.totalLentAlgo += quote.financedAmountAlgo;
    user.activeOutstandingInr += quote.financedAmountInr;
    user.tier = determineTier(user);
    this.store.users.set(user.walletAddress, user);
    this.store.quotes.delete(quoteId);

    this.emit("plan.created", {
      planId: plan.planId,
      walletAddress: plan.walletAddress,
      merchantId: plan.merchantId,
      financedAmountAlgo: plan.financedAmountAlgo,
      txId
    });

    return plan;
  }

  private emit(type: string, payload: unknown): void {
    this.store.events.push({
      id: this.store.nextEventId(),
      type,
      payload,
      occurredAtUnix: nowUnix()
    });
  }
}
