import type { ApiConfig } from "../config";
import type { CheckoutQuote, PlanRecord } from "@lateron/sdk";
import { logger } from "../lib/logger";
import { createId } from "../lib/ids";
import { nowUnix } from "../lib/time";
import { ValidationError, NotFoundError } from "../errors";
import { ReloadlyService } from "./reloadly-service";
import { CoinGeckoService } from "./coingecko-service";
import { ContractGateway } from "./contract-gateway";
import type { PostgresRepository } from "../db/postgres-repository";
import type { ParsedReloadlyProduct } from "../lib/reloadly-types";

// Supported brands for the marketplace
// Note: Sandbox environment has gaming brands. Production would have retail brands like Amazon, Flipkart, etc.
const SUPPORTED_BRANDS = ["Free Fire", "PUBG", "Steam", "Mobile Legends", "Fortnite", "Razer Gold"];

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
   * Returns array with 3 transactions:
   * - [0]: Unsigned (user must sign)
   * - [1]: Signed by relayer (pool → merchant)
   * - [2]: Signed by relayer (BNPL contract call)
   * 
   * @param quoteId - Quote ID from createMarketplaceQuote
   * @returns Array of base64-encoded transactions (mix of unsigned and signed)
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

    logger.info("Preparing marketplace checkout with atomic transaction group", {
      quoteId,
      productId: quote.productId,
      walletAddress: quote.walletAddress,
      totalAmount: quote.orderAmountAlgo
    });

    try {
      // Build atomic transaction group (3 transactions)
      // Merchant address is pool for now (in production, use actual merchant address)
      const merchantAddress = this.config.lendingPoolAddress;
      
      const transactions = await this.contractGateway.chainService.buildMarketplaceTransactions(
        quote.walletAddress,
        quote.orderAmountAlgo,
        merchantAddress,
        0 // tierAtApproval: 0=NEW (TODO: get from user profile)
      );
      
      logger.info("Atomic transaction group built successfully", {
        quoteId,
        transactionCount: transactions.length,
        flow: "User→Pool (unsigned), Pool→Merchant (signed), BNPL contract (signed)"
      });

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
   * Confirm marketplace checkout by submitting atomic transaction group.
   * 
   * Flow:
   * 1. User signs Txn 0 (user → pool, 1st EMI)
   * 2. Backend already signed Txn 1 & 2 (pool → merchant, BNPL contract)
   * 3. Submit all 3 transactions as atomic group
   * 4. Wait for confirmation
   * 5. Purchase gift card from Reloadly
   * 6. Create BNPL plan in database
   * 7. Deliver gift card to user
   * 
   * @param quoteId - Quote ID from createMarketplaceQuote
   * @param signedTransactions - Array of 3 base64-encoded transactions (Txn 0 signed by user, Txn 1 & 2 already signed)
   * @returns Gift card details with code and PIN
   */
  public async confirmCheckout(
    quoteId: string,
    signedTransactions: string[]
  ): Promise<GiftCardDetails> {
    // Get quote
    const quote = this.contractGateway.getQuote(quoteId) as MarketplaceQuote;
    if (!quote.productId) {
      throw new ValidationError("Invalid quote: not a marketplace quote");
    }

    // Validate quote not expired
    if (quote.expiresAtUnix < nowUnix()) {
      throw new ValidationError("Quote expired");
    }

    // Validate we have 3 transactions (atomic group)
    if (signedTransactions.length !== 3) {
      throw new ValidationError(`Expected 3 transactions in atomic group, got ${signedTransactions.length}`);
    }

    logger.info("Confirming marketplace checkout with atomic transaction group", {
      quoteId,
      productId: quote.productId,
      transactionCount: signedTransactions.length,
      totalAmount: quote.orderAmountAlgo,
      firstEmiAmount: quote.orderAmountAlgo / this.config.marketplaceTenureMonths
    });

    // Step 1: Submit atomic transaction group (all 3 transactions together)
    logger.info("Submitting atomic transaction group to blockchain", { quoteId });
    
    const txId = await this.contractGateway.chainService.submitSignedTransactions(signedTransactions);
    
    logger.info("Atomic transaction group confirmed", { 
      quoteId, 
      txId,
      flow: "User→Pool (1st EMI), Pool→Merchant (full amount), BNPL contract (plan created)"
    });

    // Step 2: Create BNPL plan in database
    const planId = createId("plan");
    const createdAtUnix = nowUnix();
    const installmentAmountAlgo = quote.orderAmountAlgo / this.config.marketplaceTenureMonths;
    
    // Calculate due dates for remaining 2 installments (user already paid first)
    const installments = [];
    for (let i = 1; i < this.config.marketplaceTenureMonths; i++) {
      installments.push({
        dueAtUnix: createdAtUnix + (i * 30 * 24 * 60 * 60), // 30 days apart
        amountAlgo: installmentAmountAlgo,
        status: "PENDING" as const
      });
    }

    const plan: PlanRecord = {
      planId,
      walletAddress: quote.walletAddress,
      merchantId: this.config.marketplaceMerchantId,
      status: "ACTIVE",
      tierAtApproval: "NEW",
      tenureMonths: this.config.marketplaceTenureMonths,
      aprPercent: 0,
      createdAtUnix,
      nextDueAtUnix: installments[0]?.dueAtUnix ?? createdAtUnix,
      financedAmountInr: quote.orderAmountInr,
      financedAmountAlgo: quote.orderAmountAlgo,
      remainingAmountAlgo: quote.orderAmountAlgo - installmentAmountAlgo, // First installment paid
      installmentsPaid: 1, // User just paid first installment
      installments
    };

    // Save plan to database
    if (this.repository) {
      await this.repository.savePlan(plan);
      
      // Update user's outstanding amount (only remaining 2 EMIs)
      const user = await this.repository.getOrCreateUser(quote.walletAddress);
      user.activeOutstandingInr += plan.remainingAmountAlgo * quote.algoToInrRate;
      await this.repository.updateUser(user);
    }

    logger.info("BNPL plan created in database", {
      planId: plan.planId,
      quoteId,
      productId: quote.productId,
      installmentsPaid: 1,
      remainingInstallments: installments.length,
      blockchainTxId: txId
    });

    // Step 3: Purchase gift card from Reloadly
    logger.info("Purchasing gift card from Reloadly", { quoteId, planId });
    
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
        expiresAt: null
      };

      // Store gift card details in database
      if (this.repository) {
        await this.repository.insertGiftCard(giftCardDetails);
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
      // Fulfillment failed after successful blockchain transaction - critical error
      logger.error("Gift card fulfillment failed after successful blockchain transaction", {
        planId: plan.planId,
        quoteId,
        blockchainTxId: txId,
        error
      });

      // Mark plan as failed
      if (this.repository) {
        await this.repository.updatePlan(planId, { status: "CANCELLED" });
      }

      throw new Error(
        `Payment successful but gift card delivery failed. ` +
        `Blockchain transaction: ${txId}. ` +
        `Contact support with plan ID: ${planId}`
      );
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
