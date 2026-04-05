import algosdk from "algosdk";
import type { ApiConfig } from "../config.js";

export interface CheckoutGroupParams {
  borrowerAddress: string;
  merchantAddress: string;
  upfrontAmountMicroAlgo: number;
  financedAmountMicroAlgo: number;
  nextDueUnix: number;
  tierAtApproval: number; // 0=NEW, 1=EMERGING, 2=TRUSTED
  planId: number;
}

export interface RepaymentTxParams {
  borrowerAddress: string;
  planId: number;
  repaymentAmountMicroAlgo: number;
}

export interface MarketplaceGroupParams {
  borrowerAddress: string;
  lendingPoolAddress: string;
  merchantAddress: string;
  firstInstallmentMicroAlgo: number;
  totalAmountMicroAlgo: number;
  nextDueUnix: number;
  tierAtApproval: number;
  planId: number;
}

/**
 * AtomicTxBuilder constructs unsigned Algorand transactions for checkout and repayment flows.
 * 
 * For checkout, it builds an atomic transaction group containing:
 * 1. Payment from borrower to merchant (upfront payment)
 * 2. App call to LiquidityPool.lend_out (pool lends financed amount)
 * 3. App call to BNPLCore.create_plan (creates payment plan on-chain)
 * 
 * For repayment, it builds a single transaction:
 * - App call to BNPLCore.repay_installment (records repayment on-chain)
 */
export class AtomicTxBuilder {
  private readonly algod: algosdk.Algodv2;
  private readonly bnplAppId: number;
  private readonly poolAppId: number;

  constructor(config: ApiConfig) {
    this.algod = new algosdk.Algodv2(config.algodToken, config.algodAddress, "");
    this.bnplAppId = config.bnplAppId;
    this.poolAppId = config.poolAppId;
  }

  /**
   * Builds an atomic transaction group for checkout flow.
   * 
   * The group contains 3 transactions that must execute together:
   * - Tx 0: Payment from borrower to merchant (upfront payment)
   * - Tx 1: Pool lend_out call (pool lends financed amount)
   * - Tx 2: BNPL create_plan call (creates payment plan with box storage)
   * 
   * All transactions are assigned the same group ID to ensure atomicity.
   * 
   * @param params Checkout parameters including addresses, amounts, and plan details
   * @returns Array of 3 unsigned transactions ready for signing
   */
  async buildCheckoutGroup(params: CheckoutGroupParams): Promise<algosdk.Transaction[]> {
    const suggestedParams = await this.algod.getTransactionParams().do();

    // Tx 0: Payment from borrower to merchant (upfront payment)
    const paymentTx = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: params.borrowerAddress,
      receiver: params.merchantAddress,
      amount: params.upfrontAmountMicroAlgo,
      suggestedParams,
    });

    // Tx 1: Pool lend_out call
    const lendOutTx = algosdk.makeApplicationNoOpTxnFromObject({
      sender: params.borrowerAddress,
      appIndex: this.poolAppId,
      appArgs: [
        new Uint8Array(Buffer.from("lend_out")),
        algosdk.encodeUint64(params.financedAmountMicroAlgo),
      ],
      suggestedParams,
    });

    // Tx 2: BNPL create_plan call with box storage references
    const createPlanTx = algosdk.makeApplicationNoOpTxnFromObject({
      sender: params.borrowerAddress,
      appIndex: this.bnplAppId,
      appArgs: [
        new Uint8Array(Buffer.from("create_plan")),
        algosdk.decodeAddress(params.borrowerAddress).publicKey,
        algosdk.encodeUint64(params.financedAmountMicroAlgo),
        algosdk.encodeUint64(params.upfrontAmountMicroAlgo),
        algosdk.decodeAddress(params.merchantAddress).publicKey,
        algosdk.encodeUint64(params.nextDueUnix),
        new Uint8Array([params.tierAtApproval]),
      ],
      suggestedParams,
      boxes: [
        { appIndex: this.bnplAppId, name: this.getPlanBoxName(params.planId) },
        { appIndex: this.bnplAppId, name: this.getUserBoxName(params.borrowerAddress) },
      ],
    });

    // Assign group ID to ensure atomic execution
    const txGroup = [paymentTx, lendOutTx, createPlanTx];
    algosdk.assignGroupID(txGroup);

    return txGroup;
  }

  /**
   * Builds an atomic transaction group for marketplace gift card purchases.
   * 
   * The group contains 3 transactions that must execute together:
   * - Tx 0: Payment from borrower to lending pool (first installment)
   * - Tx 1: Payment from lending pool to merchant (gift card purchase amount)
   * - Tx 2: BNPL create_plan call (creates payment plan with box storage)
   * 
   * Before building, validates that the lending pool has sufficient balance.
   * 
   * @param params Marketplace checkout parameters including addresses, amounts, and plan details
   * @returns Array of 3 unsigned transactions ready for signing
   * @throws Error if lending pool balance is insufficient
   */
  async buildMarketplaceGroup(params: MarketplaceGroupParams): Promise<algosdk.Transaction[]> {
    // Validate lending pool balance before building transaction
    const poolAccountInfo = await this.algod.accountInformation(params.lendingPoolAddress).do();
    const poolBalance = Number(poolAccountInfo.amount);
    
    if (poolBalance < params.totalAmountMicroAlgo) {
      throw new Error("Insufficient pool liquidity");
    }

    const suggestedParams = await this.algod.getTransactionParams().do();

    // Tx 0: Payment from borrower to lending pool (first installment)
    const userPaymentTx = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: params.borrowerAddress,
      receiver: params.lendingPoolAddress,
      amount: params.firstInstallmentMicroAlgo,
      suggestedParams,
    });

    // Tx 1: Payment from lending pool to merchant (gift card purchase amount)
    const poolDisbursementTx = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: params.lendingPoolAddress,
      receiver: params.merchantAddress,
      amount: params.totalAmountMicroAlgo,
      suggestedParams,
    });

    // Tx 2: BNPL create_plan call with box storage references
    const createPlanTx = algosdk.makeApplicationNoOpTxnFromObject({
      sender: params.borrowerAddress,
      appIndex: this.bnplAppId,
      appArgs: [
        new Uint8Array(Buffer.from("create_plan")),
        algosdk.decodeAddress(params.borrowerAddress).publicKey,
        algosdk.encodeUint64(params.totalAmountMicroAlgo - params.firstInstallmentMicroAlgo),
        algosdk.encodeUint64(params.firstInstallmentMicroAlgo),
        algosdk.decodeAddress(params.merchantAddress).publicKey,
        algosdk.encodeUint64(params.nextDueUnix),
        new Uint8Array([params.tierAtApproval]),
      ],
      suggestedParams,
      boxes: [
        { appIndex: this.bnplAppId, name: this.getPlanBoxName(params.planId) },
        { appIndex: this.bnplAppId, name: this.getUserBoxName(params.borrowerAddress) },
      ],
    });

    // Assign group ID to ensure atomic execution
    const txGroup = [userPaymentTx, poolDisbursementTx, createPlanTx];
    algosdk.assignGroupID(txGroup);

    return txGroup;
  }

  /**
   * Builds an unsigned repayment transaction.
   * 
   * The transaction calls BNPLCore.repay_installment to record the repayment on-chain
   * and update the plan's remaining amount and installments paid.
   * 
   * @param params Repayment parameters including borrower address, plan ID, and amount
   * @returns Unsigned transaction ready for signing
   */
  async buildRepaymentTx(params: RepaymentTxParams): Promise<algosdk.Transaction> {
    const suggestedParams = await this.algod.getTransactionParams().do();

    return algosdk.makeApplicationNoOpTxnFromObject({
      sender: params.borrowerAddress,
      appIndex: this.bnplAppId,
      appArgs: [
        new Uint8Array(Buffer.from("repay_installment")),
        algosdk.encodeUint64(params.planId),
        algosdk.encodeUint64(params.repaymentAmountMicroAlgo),
      ],
      suggestedParams,
      boxes: [
        { appIndex: this.bnplAppId, name: this.getPlanBoxName(params.planId) },
        { appIndex: this.bnplAppId, name: this.getUserBoxName(params.borrowerAddress) },
      ],
    });
  }

  /**
   * Generates the box storage name for a payment plan.
   * 
   * Box name format: "plan_" + plan_id (8 bytes uint64)
   * 
   * @param planId Numeric plan identifier
   * @returns Box name as Uint8Array
   */
  private getPlanBoxName(planId: number): Uint8Array {
    return new Uint8Array(Buffer.concat([
      Buffer.from("plan_"),
      Buffer.from(algosdk.encodeUint64(planId)),
    ]));
  }

  /**
   * Generates the box storage name for a user profile.
   * 
   * Box name format: "user_" + wallet_address (32 bytes public key)
   * 
   * @param address Algorand wallet address
   * @returns Box name as Uint8Array
   */
  private getUserBoxName(address: string): Uint8Array {
    return new Uint8Array(Buffer.concat([
      Buffer.from("user_"),
      Buffer.from(algosdk.decodeAddress(address).publicKey),
    ]));
  }
}
