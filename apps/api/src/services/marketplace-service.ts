import type { ApiConfig } from "../config";
import { TIER_CAPS, type CheckoutQuote, type PlanRecord, type Tier } from "@lateron/sdk";
import { logger } from "../lib/logger";
import { createId } from "../lib/ids";
import { nowUnix } from "../lib/time";
import { ValidationError, NotFoundError, CheckoutRetryRequiredError } from "../errors";
import { ReloadlyService } from "./reloadly-service";
import { CoinGeckoService } from "./coingecko-service";
import { ContractGateway } from "./contract-gateway";
import type { PostgresRepository } from "../db/postgres-repository";
import type { ParsedReloadlyProduct } from "../lib/reloadly-types";
import algosdk from "algosdk";
import {
  buildUserBoxName,
  decodePlanIdFromBoxName,
  MARKETPLACE_PLAN_BOX_LOOKAHEAD
} from "./marketplace-checkout-boxes";

// Supported brands for the marketplace
// Note: Sandbox environment has gaming brands. Production would have retail brands like Amazon, Flipkart, etc.
const SUPPORTED_BRANDS = ["Free Fire", "PUBG", "Steam", "Mobile Legends", "Fortnite", "Razer Gold"];
const TIER_TO_INDEX: Record<Tier, number> = {
  NEW: 0,
  EMERGING: 1,
  TRUSTED: 2
};

const bytesEqual = (left: Uint8Array | undefined, right: Uint8Array | undefined): boolean => {
  if (!left || !right) {
    return false;
  }

  return Buffer.compare(Buffer.from(left), Buffer.from(right)) === 0;
};

const addressMatches = (actual: algosdk.Address | undefined, expected: string): boolean => {
  if (!actual) {
    return false;
  }

  return algosdk.encodeAddress(actual.publicKey) === expected;
};

const extractPlanBoxRange = (
  boxes: ReadonlyArray<{ appIndex: bigint; name: Uint8Array }>,
  expectedAppId: number,
  expectedUserBoxName: Uint8Array
): { firstPlanId: number; lastPlanId: number; planBoxCount: number } => {
  let hasUserBox = false;
  const planIds: number[] = [];

  for (const box of boxes) {
    const decodedAppIndex = Number(box.appIndex);
    const isOwnAppReference = decodedAppIndex === 0 || decodedAppIndex === expectedAppId;
    if (!isOwnAppReference) {
      throw new ValidationError("Prepared BNPL app call includes a box reference for an unexpected app");
    }

    if (bytesEqual(box.name, expectedUserBoxName)) {
      if (hasUserBox) {
        throw new ValidationError("Prepared BNPL app call contains duplicate borrower box references");
      }
      hasUserBox = true;
      continue;
    }

    const planId = decodePlanIdFromBoxName(box.name);
    if (planId === null) {
      throw new ValidationError("Prepared BNPL app call includes an unexpected box reference");
    }

    planIds.push(planId);
  }

  if (!hasUserBox) {
    throw new ValidationError("Prepared BNPL app call is missing the borrower box reference");
  }

  if (planIds.length === 0) {
    throw new ValidationError("Prepared BNPL app call is missing plan box references");
  }

  planIds.sort((left, right) => left - right);

  for (let index = 1; index < planIds.length; index += 1) {
    if (planIds[index] !== planIds[index - 1] + 1) {
      throw new ValidationError("Prepared BNPL app call plan box references are not contiguous");
    }
  }

  if (planIds.length > MARKETPLACE_PLAN_BOX_LOOKAHEAD) {
    throw new ValidationError("Prepared BNPL app call includes too many plan box references");
  }

  return {
    firstPlanId: planIds[0],
    lastPlanId: planIds[planIds.length - 1],
    planBoxCount: planIds.length
  };
};

// ============================================================================
// Type Definitions
// ============================================================================

export interface GiftCardProduct {
  productId: number;
  productName: string;
  brandName: string;
  countryCode: string;
  logoUrl: string;
  denominations: number[];
  denominationType: "FIXED" | "RANGE";
}

export interface MarketplaceQuoteRequest {
  walletAddress: string;
  productId: number;
  denomination: number;
}

export interface MarketplaceQuote extends CheckoutQuote {
  productId: number;
  productName: string;
  denomination: number;
  algoToInrRate: number;
}

export interface GiftCardDetails {
  planId: string;
  reloadlyTransactionId: number;
  productId: number;
  productName: string;
  denomination: number;
  code: string;
  pin: string;
  purchasedAtUnix: number;
  expiresAt: string | null;
}

// ============================================================================
// MarketplaceService
// ============================================================================

/**
 * MarketplaceService orchestrates gift card purchases with BNPL integration.
 * 
 * Responsibilities:
 * - Fetch and filter gift card catalog from Reloadly
 * - Create marketplace quotes with ALGO conversion
 * - Orchestrate gift card purchase flow
 * - Store gift card details with BNPL plans
 */
export class MarketplaceService {
  private catalogCache: GiftCardProduct[] | null = null;
  private catalogCacheExpiresAtUnix: number = 0;

  public constructor(
    private readonly config: ApiConfig,
    private readonly reloadlyService: ReloadlyService,
    private readonly coinGeckoService: CoinGeckoService,
    private readonly contractGateway: ContractGateway,
    private readonly repository?: PostgresRepository
  ) {}

  /**
   * Fetch gift card catalog from Reloadly, filtered to India and supported brands.
   * Results are cached for 5 minutes to reduce API calls.
   * 
   * @returns Array of gift card products available for purchase
   */
  public async getCatalog(): Promise<GiftCardProduct[]> {
    // Return cached catalog if still valid
    if (this.catalogCache && this.catalogCacheExpiresAtUnix > nowUnix()) {
      logger.debug("Using cached gift card catalog", { count: this.catalogCache.length });
      return this.catalogCache;
    }

    try {
      logger.info("Fetching gift card catalog from Reloadly");

      // Fetch products from Reloadly for India
      const products = await this.reloadlyService.getProducts("IN");

      // Filter to supported brands
      const filtered = products
        .filter((product) => SUPPORTED_BRANDS.includes(product.brandName))
        .map((product) => this.mapToGiftCardProduct(product));

      // Log available brands for debugging
      const availableBrands = [...new Set(products.map(p => p.brandName))];
      logger.info("Available brands in Reloadly catalog", { 
        availableBrands,
        supportedBrands: SUPPORTED_BRANDS
      });

      // Cache for 5 minutes
      this.catalogCache = filtered;
      this.catalogCacheExpiresAtUnix = nowUnix() + 300;

      logger.info("Gift card catalog fetched and cached", {
        totalProducts: products.length,
        filteredProducts: filtered.length
      });

      return filtered;
    } catch (error) {
      logger.error("Failed to fetch gift card catalog", { error });
      throw new Error("Unable to fetch gift card catalog. Please try again later.");
    }
  }

  /**
   * Create a marketplace quote for a gift card purchase with BNPL.
   * Calculates ALGO amounts using CoinGecko exchange rates.
   * 
   * @param request - Quote request with wallet address, product ID, and denomination
   * @returns Marketplace quote with installment breakdown
   */
  public async createMarketplaceQuote(
    request: MarketplaceQuoteRequest
  ): Promise<MarketplaceQuote> {
    // Validate request
    if (!request.walletAddress || request.walletAddress.trim() === "") {
      throw new ValidationError("Wallet address is required");
    }
    if (!request.productId || request.productId <= 0) {
      throw new ValidationError("Invalid product ID");
    }
    if (!request.denomination || request.denomination <= 0) {
      throw new ValidationError("Invalid denomination");
    }

    // Fetch catalog to validate product exists
    const catalog = await this.getCatalog();
    const product = catalog.find((p) => p.productId === request.productId);
    if (!product) {
      throw new ValidationError("Product not found in catalog");
    }

    // Validate denomination is available for this product
    if (!product.denominations.includes(request.denomination)) {
      throw new ValidationError("Denomination not available for this product");
    }

    const user = await this.contractGateway.getOrCreateUser(request.walletAddress);
    const caps = TIER_CAPS[user.tier];
    if (request.denomination > caps.maxOrderInr) {
      throw new ValidationError("Order exceeds tier max order cap");
    }
    if (user.activeOutstandingInr + request.denomination > caps.maxOutstandingInr) {
      throw new ValidationError("Order exceeds tier max outstanding cap");
    }

    // Get ALGO/INR exchange rate
    const algoToInrRate = await this.coinGeckoService.getAlgoToInrRate();

    // Calculate ALGO amounts
    const orderAmountInr = request.denomination;
    const orderAmountAlgo = await this.coinGeckoService.convertInrToAlgo(orderAmountInr);

    // Calculate installment amounts (3-month tenure, no down payment for gift cards)
    const tenureMonths = this.config.marketplaceTenureMonths;
    const upfrontAmountAlgo = 0; // No down payment for gift cards
    const financedAmountAlgo = orderAmountAlgo;
    const installmentAmountAlgo = Number((financedAmountAlgo / tenureMonths).toFixed(6));

    // Create quote
    const quoteId = createId("quote");
    const expiresAtUnix = nowUnix() + this.config.quoteTtlSeconds;

    const quote: MarketplaceQuote = {
      quoteId,
      walletAddress: request.walletAddress,
      merchantId: this.config.marketplaceMerchantId,
      orderAmountInr,
      financedAmountInr: orderAmountInr,
      orderAmountAlgo,
      upfrontAmountAlgo,
      financedAmountAlgo,
      installmentAmountAlgo,
      tenureMonths,
      monthlyRate: 0, // No interest for gift cards
      expiresAtUnix,
      signature: "", // Signature not used for marketplace quotes
      productId: request.productId,
      productName: product.productName,
      denomination: request.denomination,
      algoToInrRate
    };

    // Register quote with contract gateway
    this.contractGateway.registerQuote(quote);

    logger.info("Marketplace quote created", {
      quoteId,
      productId: request.productId,
      denomination: request.denomination,
      tierAtApproval: user.tier,
      orderAmountAlgo,
      installmentAmountAlgo
    });

    return quote;
  }

  /**
   * Purchase a gift card using BNPL.
   * Orchestrates atomic transaction submission and Reloadly fulfillment.
   * 
   * @param quoteId - Quote ID from createMarketplaceQuote
   * @returns Gift card details with code and PIN
   */
  public async purchaseGiftCard(quoteId: string): Promise<GiftCardDetails> {
    // Get quote
    const quote = this.contractGateway.getQuote(quoteId) as MarketplaceQuote;
    if (!quote.productId) {
      throw new ValidationError("Invalid quote: not a marketplace quote");
    }

    // Validate quote not expired
    if (quote.expiresAtUnix < nowUnix()) {
      throw new ValidationError("Quote expired");
    }

    // Create BNPL plan (this handles atomic transaction submission)
    const plan = await this.contractGateway.createPlanFromQuote(quoteId);

    logger.info("BNPL plan created for gift card purchase", {
      planId: plan.planId,
      quoteId,
      productId: quote.productId
    });

    // Purchase gift card from Reloadly
    try {
      const fulfillment = await this.reloadlyService.purchaseGiftCard({
        productId: quote.productId,
        countryCode: "IN",
        quantity: 1,
        unitPrice: quote.denomination,
        customIdentifier: plan.planId
      });

      // Create gift card details
      const giftCardDetails: GiftCardDetails = {
        planId: plan.planId,
        reloadlyTransactionId: fulfillment.transactionId,
        productId: quote.productId,
        productName: quote.productName,
        denomination: quote.denomination,
        code: fulfillment.code,
        pin: fulfillment.pin,
        purchasedAtUnix: nowUnix(),
        expiresAt: null // Reloadly doesn't provide expiration in sandbox
      };

      // Store gift card details in database
      if (this.repository) {
        await this.repository.insertGiftCard(giftCardDetails);
      }

      logger.info("Gift card purchased and stored successfully", {
        planId: plan.planId,
        reloadlyTransactionId: fulfillment.transactionId,
        productName: quote.productName
      });

      return giftCardDetails;
    } catch (error) {
      // Fulfillment failed after plan creation - log error and throw
      logger.error("Gift card fulfillment failed after plan creation", {
        planId: plan.planId,
        quoteId,
        error
      });

      // TODO: Implement rollback/refund logic
      throw new Error(
        `Payment received but gift card delivery failed. Contact support with transaction ID: ${plan.planId}`
      );
    }
  }

  /**
   * Retrieve gift card details for a plan.
   * 
   * @param planId - Plan ID
   * @returns Gift card details or null if not found
   */
  public async getGiftCardDetails(planId: string): Promise<GiftCardDetails | null> {
    if (!this.repository) {
      throw new Error("Database repository not available");
    }

    try {
      const giftCard = await this.repository.getGiftCardByPlanId(planId);
      return giftCard;
    } catch (error) {
      logger.error("Failed to retrieve gift card details", { planId, error });
      return null;
    }
  }

  /**
   * Prepare marketplace checkout by building unsigned transactions.
   * Returns base64-encoded unsigned transactions for frontend signing.
   * 
   * @param quoteId - Quote ID from createMarketplaceQuote
   * @returns Array of base64-encoded unsigned transactions
   */
  /**
   * Prepare marketplace checkout by building atomic transaction group.
   * Returns all 3 unsigned transactions for the atomic group.
   * User will sign Txn 0, backend will sign Txn 1 & 2 during confirm.
   * 
   * @param quoteId - Quote ID from createMarketplaceQuote
   * @returns Array with 3 unsigned transactions
   */
  public async prepareCheckout(quoteId: string): Promise<string[]> {
    // Validate quote exists and not expired
    const quote = this.contractGateway.getQuote(quoteId) as MarketplaceQuote;
    if (!quote.productId) {
      throw new ValidationError("Invalid quote: not a marketplace quote");
    }

    if (quote.expiresAtUnix < nowUnix()) {
      throw new ValidationError("Quote expired");
    }

    logger.info("Preparing marketplace checkout - building atomic transaction group", {
      quoteId,
      productId: quote.productId,
      walletAddress: quote.walletAddress,
      totalAmount: quote.orderAmountAlgo
    });

    try {
      const user = await this.contractGateway.getOrCreateUser(quote.walletAddress);
      const tierAtApproval = TIER_TO_INDEX[user.tier];

      // Build atomic transaction group (3 unsigned transactions)
      // Merchant address is pool for now (in production, use actual merchant address)
      const merchantAddress = this.config.lendingPoolAddress;

      if (!this.contractGateway.chainService) {
        throw new Error("Blockchain service not available");
      }

      const transactions = await this.contractGateway.chainService.buildMarketplaceTransactions(
        quote.walletAddress,
        quote.orderAmountAlgo,
        merchantAddress,
        tierAtApproval
      );
      
      logger.info("Atomic transaction group built successfully", {
        quoteId,
        totalTransactions: transactions.length,
        tierAtApproval: user.tier,
        flow: "All 3 unsigned, user signs Txn 0, backend signs Txn 1 & 2 during confirm"
      });

      // Return all 3 unsigned transactions
      return transactions;
    } catch (error) {
      logger.error("Failed to build atomic transaction group", {
        quoteId,
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      });
      
      throw new Error("Failed to prepare checkout transactions");
    }
  }

  /**
   * Confirm marketplace checkout by submitting signed transactions and fulfilling gift card.
   * 
   * @param quoteId - Quote ID from createMarketplaceQuote
   * @param signedTransactions - Array of base64-encoded signed transactions
   * @returns Gift card details with code and PIN
   */
  /**
   * Confirm marketplace checkout by signing backend transactions and submitting atomic group.
   * 
   * Flow:
   * 1. User signed Txn 0 (user → pool, 1st EMI)
   * 2. Backend signs Txn 1 & 2 (pool → merchant, BNPL contract)
   * 3. Submit complete atomic group (3 signed transactions)
   * 4. Purchase gift card from Reloadly
   * 5. Create BNPL plan in database
   * 6. Deliver gift card to user
   * 
   * @param quoteId - Quote ID from createMarketplaceQuote
   * @param signedTransactions - Array with 3 transactions (Txn 0 signed by user, Txn 1 & 2 unsigned)
   * @returns Gift card details with code and PIN
   */
  public async confirmCheckout(
    quoteId: string,
    signedTransactions: string[]
  ): Promise<GiftCardDetails> {
    try {
      // Get quote
      const quote = this.contractGateway.getQuote(quoteId) as MarketplaceQuote;
      if (!quote.productId) {
        throw new ValidationError("Invalid quote: not a marketplace quote");
      }

      // Validate quote not expired
      if (quote.expiresAtUnix < nowUnix()) {
        throw new ValidationError("Quote expired");
      }

      // Validate we have 3 transactions
      if (signedTransactions.length !== 3) {
        throw new ValidationError(`Expected 3 transactions, got ${signedTransactions.length}`);
      }

      const user = await this.contractGateway.getOrCreateUser(quote.walletAddress);

      logger.info("Confirming marketplace checkout - signing prepared backend transactions", {
        quoteId,
        productId: quote.productId,
        transactionCount: signedTransactions.length,
        tierAtApproval: user.tier,
        totalAmount: quote.orderAmountAlgo,
        firstEmiAmount: quote.orderAmountAlgo / this.config.marketplaceTenureMonths
      });

      const chainService = this.contractGateway.chainService as any;
      if (!chainService.signer) {
        logger.error("Relayer not configured - cannot sign backend transactions", { quoteId });
        throw new Error("Relayer not configured");
      }

      // Step 1: Decode the user-signed Txn0 to extract the group ID.
      const txn0SignedBytes = new Uint8Array(Buffer.from(signedTransactions[0], 'base64'));
      const txn0Decoded = algosdk.decodeSignedTransaction(txn0SignedBytes);
      const groupId = txn0Decoded.txn.group;

      if (!groupId) {
        throw new ValidationError("User-signed transaction missing group ID");
      }

      logger.info("Extracted group ID from user-signed transaction", {
        quoteId,
        groupIdHex: Buffer.from(groupId).toString('hex')
      });

      // Step 2: Decode the prepared backend transactions preserved by the wallet.
      const txn1Unsigned = algosdk.decodeUnsignedTransaction(
        new Uint8Array(Buffer.from(signedTransactions[1], 'base64'))
      );
      const txn2Unsigned = algosdk.decodeUnsignedTransaction(
        new Uint8Array(Buffer.from(signedTransactions[2], 'base64'))
      );

      if (!txn1Unsigned.group || !txn2Unsigned.group) {
        throw new ValidationError("Prepared backend transactions are missing a group ID");
      }

      if (
        Buffer.compare(Buffer.from(txn1Unsigned.group), Buffer.from(groupId)) !== 0 ||
        Buffer.compare(Buffer.from(txn2Unsigned.group), Buffer.from(groupId)) !== 0
      ) {
        throw new ValidationError("Prepared backend transactions do not match the user-signed group");
      }

      const expectedTotalMicroAlgo = BigInt(Math.round(quote.orderAmountAlgo * 1_000_000));
      const expectedFirstEmiMicroAlgo = BigInt(
        Math.round((quote.orderAmountAlgo / this.config.marketplaceTenureMonths) * 1_000_000)
      );
      const expectedPoolAddress = this.config.lendingPoolAddress;
      const expectedMerchantAddress = this.config.lendingPoolAddress;
      const expectedTierIndex = TIER_TO_INDEX[user.tier];
      const expectedBorrowerPublicKey = algosdk.decodeAddress(quote.walletAddress).publicKey;
      const expectedPoolPublicKey = algosdk.decodeAddress(expectedPoolAddress).publicKey;
      const expectedMerchantPublicKey = algosdk.decodeAddress(expectedMerchantAddress).publicKey;
      const txn2AppArgs = txn2Unsigned.applicationCall?.appArgs ?? [];
      const txn2Boxes = txn2Unsigned.applicationCall?.boxes ?? [];
      const nextDueUnix =
        txn2AppArgs.length >= 7 ? algosdk.decodeUint64(txn2AppArgs[6], "safe") : 0;
      const minNextDueUnix = nowUnix() + (29 * 24 * 60 * 60);
      const maxNextDueUnix = nowUnix() + (31 * 24 * 60 * 60);
      const expectedUserBoxName = buildUserBoxName(quote.walletAddress);

      if (
        txn1Unsigned.type !== algosdk.TransactionType.pay ||
        !txn1Unsigned.payment ||
        !addressMatches(txn1Unsigned.sender, chainService.signer.sender) ||
        !addressMatches(txn1Unsigned.payment.receiver, expectedMerchantAddress) ||
        txn1Unsigned.payment.amount !== expectedTotalMicroAlgo ||
        txn1Unsigned.rekeyTo !== undefined ||
        txn1Unsigned.payment.closeRemainderTo !== undefined
      ) {
        throw new ValidationError("Prepared pool payment transaction does not match the expected quote");
      }

      if (
        txn2Unsigned.type !== algosdk.TransactionType.appl ||
        !txn2Unsigned.applicationCall ||
        !addressMatches(txn2Unsigned.sender, chainService.signer.sender) ||
        txn2Unsigned.applicationCall.appIndex !== BigInt(this.config.bnplAppId) ||
        txn2Unsigned.applicationCall.onComplete !== algosdk.OnApplicationComplete.NoOpOC ||
        txn2Unsigned.rekeyTo !== undefined ||
        txn2AppArgs.length !== 8 ||
        !bytesEqual(txn2AppArgs[0], new TextEncoder().encode("create_plan")) ||
        !bytesEqual(txn2AppArgs[1], expectedBorrowerPublicKey) ||
        !bytesEqual(txn2AppArgs[2], algosdk.encodeUint64(expectedTotalMicroAlgo)) ||
        !bytesEqual(txn2AppArgs[3], algosdk.encodeUint64(expectedFirstEmiMicroAlgo)) ||
        !bytesEqual(txn2AppArgs[4], expectedPoolPublicKey) ||
        !bytesEqual(txn2AppArgs[5], expectedMerchantPublicKey) ||
        nextDueUnix < minNextDueUnix ||
        nextDueUnix > maxNextDueUnix ||
        txn2AppArgs[7][0] !== expectedTierIndex
      ) {
        throw new ValidationError("Prepared BNPL app call does not match the expected quote");
      }

      const preparedPlanBoxRange = extractPlanBoxRange(
        txn2Boxes,
        this.config.bnplAppId,
        expectedUserBoxName
      );

      try {
        const currentPlanCounter =
          await this.contractGateway.chainService?.getCurrentBnplPlanCounter?.();
        const currentExpectedPlanId = (currentPlanCounter ?? 0) + 1;
        if (
          currentExpectedPlanId < preparedPlanBoxRange.firstPlanId ||
          currentExpectedPlanId > preparedPlanBoxRange.lastPlanId
        ) {
          logger.warn("Prepared checkout became stale before relayer signing", {
            quoteId,
            currentExpectedPlanId,
            preparedFirstPlanId: preparedPlanBoxRange.firstPlanId,
            preparedLastPlanId: preparedPlanBoxRange.lastPlanId
          });
          throw new CheckoutRetryRequiredError(
            "Checkout approval became stale before confirmation. Please retry and sign the refreshed checkout.",
            {
              currentExpectedPlanId,
              preparedFirstPlanId: preparedPlanBoxRange.firstPlanId,
              preparedLastPlanId: preparedPlanBoxRange.lastPlanId
            }
          );
        }
      } catch (error) {
        if (error instanceof CheckoutRetryRequiredError) {
          throw error;
        }

        logger.warn("Could not re-check BNPL plan counter before submission", {
          quoteId,
          error: error instanceof Error ? error.message : String(error)
        });
      }

      logger.info("Decoded prepared backend transactions for relayer signing", {
        quoteId,
        txn1Type: txn1Unsigned.type,
        txn2Type: txn2Unsigned.type,
        txn2AppArgsCount: txn2AppArgs.length,
        txn2BoxesCount: txn2Boxes.length,
        txn2BoxAppIndices: txn2Boxes.map((box) => Number(box.appIndex)),
        preparedFirstPlanId: preparedPlanBoxRange.firstPlanId,
        preparedLastPlanId: preparedPlanBoxRange.lastPlanId
      });

      // Step 3: Sign Txn1 & Txn2 with relayer.
      logger.info("Signing backend transactions with relayer", {
        quoteId,
        relayerAddress: chainService.signer.sender
      });

      const txn1Signed = txn1Unsigned.signTxn(chainService.signer.privateKey);
      const txn2Signed = txn2Unsigned.signTxn(chainService.signer.privateKey);

      // Step 4: Combine all signed transactions.
      const completeAtomicGroup = [
        Buffer.from(txn0SignedBytes).toString('base64'),
        Buffer.from(txn1Signed).toString('base64'),
        Buffer.from(txn2Signed).toString('base64')
      ];

      // Step 5: Submit atomic transaction group.
      logger.info("Submitting complete atomic transaction group to blockchain", { quoteId });

      if (!this.contractGateway.chainService) {
        throw new Error("Blockchain service not available");
      }
      const txId = await this.contractGateway.chainService.submitSignedTransactions(completeAtomicGroup);

      logger.info("Atomic transaction group confirmed", {
        quoteId,
        txId,
        flow: "User->Pool (1st EMI), Pool->Merchant (full amount), BNPL create_plan (plan created)"
      });

      // Create BNPL plan in database
      const planId = createId("plan");
      const createdAtUnix = nowUnix();
      const installmentAmountAlgo = quote.orderAmountAlgo / this.config.marketplaceTenureMonths;

      // Calculate due dates for remaining 2 installments (user already paid first)
      const installments = [];
      for (let i = 1; i < this.config.marketplaceTenureMonths; i++) {
        installments.push({
          installmentNumber: i + 1,
          dueAtUnix: createdAtUnix + (i * 30 * 24 * 60 * 60),
          amountAlgo: installmentAmountAlgo
        });
      }

      const plan: PlanRecord = {
        planId,
        walletAddress: quote.walletAddress,
        merchantId: this.config.marketplaceMerchantId,
        status: "ACTIVE",
        tierAtApproval: user.tier,
        tenureMonths: this.config.marketplaceTenureMonths,
        aprPercent: 0,
        createdAtUnix,
        nextDueAtUnix: installments[0]?.dueAtUnix ?? createdAtUnix,
        financedAmountInr: quote.orderAmountInr,
        financedAmountAlgo: quote.orderAmountAlgo,
        remainingAmountAlgo: quote.orderAmountAlgo - installmentAmountAlgo,
        installmentsPaid: 1,
        installments
      };

      // Save plan to database (giftCardDetails will be attached after Reloadly purchase below)
      if (this.repository) {
        await this.repository.savePlan(plan);

        // Update user's outstanding amount
        const repositoryUser = await this.repository.getOrCreateUser(quote.walletAddress);
        repositoryUser.activeOutstandingInr += plan.remainingAmountAlgo * quote.algoToInrRate;
        await this.repository.updateUser(repositoryUser);
      }

      logger.info("BNPL plan created in database", {
        planId: plan.planId,
        quoteId,
        productId: quote.productId,
        installmentsPaid: 1,
        remainingInstallments: installments.length,
        blockchainTxId: txId
      });

      // Purchase gift card from Reloadly
      logger.info("Purchasing gift card from Reloadly", { quoteId, planId });

      try {
        const fulfillment = await this.reloadlyService.purchaseGiftCard({
          productId: quote.productId,
          countryCode: "IN",
          quantity: 1,
          unitPrice: quote.denomination,
          customIdentifier: plan.planId
        });

        const giftCardDetails: GiftCardDetails = {
          planId: plan.planId,
          reloadlyTransactionId: fulfillment.transactionId,
          productId: quote.productId,
          productName: quote.productName,
          denomination: quote.denomination,
          code: fulfillment.code,
          pin: fulfillment.pin,
          purchasedAtUnix: nowUnix(),
          expiresAt: null
        };

        if (this.repository) {
          try {
            await this.repository.insertGiftCard(giftCardDetails);
          } catch (persistenceError) {
            logger.error("Gift card delivered but persistence failed", {
              planId: plan.planId,
              quoteId,
              reloadlyTransactionId: fulfillment.transactionId,
              persistenceError:
                persistenceError instanceof Error
                  ? {
                      message: persistenceError.message,
                      stack: persistenceError.stack
                    }
                  : persistenceError
            });
          }
        }

        logger.info("Gift card purchased and delivered successfully", {
          planId: plan.planId,
          quoteId,
          reloadlyTransactionId: fulfillment.transactionId,
          productName: quote.productName,
          blockchainTxId: txId
        });

        return giftCardDetails;
      } catch (error) {
        logger.error("Gift card fulfillment failed after successful blockchain transaction", {
          planId: plan.planId,
          quoteId,
          blockchainTxId: txId,
          error:
            error instanceof Error
              ? error.message
              : error && typeof error === "object"
                ? JSON.stringify(error)
                : String(error),
          errorStack: error instanceof Error ? error.stack : undefined
        });

        throw new Error(
          `Payment successful but gift card delivery failed. ` +
          `Blockchain transaction: ${txId}. ` +
          `Contact support with plan ID: ${planId}`
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("invalid Box reference")
      ) {
        throw new CheckoutRetryRequiredError(
          "Checkout approval became stale before confirmation. Please retry and sign the refreshed checkout.",
          {
            reason: error.message
          }
        );
      }

      // Log the full error for debugging
      logger.error("confirmCheckout failed with error", {
        quoteId,
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        errorName: error instanceof Error ? error.constructor.name : typeof error
      });

      // Re-throw to be handled by route handler
      throw error;
    }
  }

  /**
   * Map Reloadly product to GiftCardProduct.
   */
  private mapToGiftCardProduct(product: ParsedReloadlyProduct): GiftCardProduct {
    return {
      productId: product.productId,
      productName: product.productName,
      brandName: product.brandName,
      countryCode: product.countryCode,
      logoUrl: product.logoUrl,
      denominations: product.denominations,
      denominationType: product.denominationType
    };
  }
}
