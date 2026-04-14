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
import algosdk from "algosdk";

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
      // Build atomic transaction group (3 unsigned transactions)
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
        totalTransactions: transactions.length,
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

      logger.info("Confirming marketplace checkout - signing backend transactions", {
        quoteId,
        productId: quote.productId,
        transactionCount: signedTransactions.length,
        totalAmount: quote.orderAmountAlgo,
        firstEmiAmount: quote.orderAmountAlgo / this.config.marketplaceTenureMonths
      });

      // Decode transactions
      const txn0Signed = new Uint8Array(Buffer.from(signedTransactions[0], 'base64')); // User-signed
      const txn1Unsigned = algosdk.decodeUnsignedTransaction(new Uint8Array(Buffer.from(signedTransactions[1], 'base64')));
      const txn2Unsigned = algosdk.decodeUnsignedTransaction(new Uint8Array(Buffer.from(signedTransactions[2], 'base64')));

      // Sign Txn 1 & 2 with relayer
      const chainService = this.contractGateway.chainService as any;
      if (!chainService.signer) {
        logger.error("Relayer not configured - cannot sign backend transactions", {
          quoteId,
          chainServiceEnabled: chainService.enabled,
          chainServiceReady: chainService.isEnabled()
        });
        throw new Error("Relayer not configured");
      }

      logger.info("Signing backend transactions with relayer", {
        quoteId,
        relayerAddress: chainService.signer.sender
      });

      const txn1Signed = txn1Unsigned.signTxn(chainService.signer.privateKey);
      const txn2Signed = txn2Unsigned.signTxn(chainService.signer.privateKey);

      // Combine all signed transactions
      const completeAtomicGroup = [
        Buffer.from(txn0Signed).toString('base64'),
        Buffer.from(txn1Signed).toString('base64'),
        Buffer.from(txn2Signed).toString('base64')
      ];

      // Submit atomic transaction group
      logger.info("Submitting complete atomic transaction group to blockchain", { quoteId });
      
      const txId = await this.contractGateway.chainService.submitSignedTransactions(completeAtomicGroup);
      
      logger.info("Atomic transaction group confirmed", { 
        quoteId, 
        txId,
        flow: "User→Pool (1st EMI), Pool→Merchant (full amount), BNPL contract (plan created)"
      });

      // Create BNPL plan in database
      const planId = createId("plan");
      const createdAtUnix = nowUnix();
      const installmentAmountAlgo = quote.orderAmountAlgo / this.config.marketplaceTenureMonths;
      
      // Calculate due dates for remaining 2 installments (user already paid first)
      const installments = [];
      for (let i = 1; i < this.config.marketplaceTenureMonths; i++) {
        installments.push({
          dueAtUnix: createdAtUnix + (i * 30 * 24 * 60 * 60),
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
        remainingAmountAlgo: quote.orderAmountAlgo - installmentAmountAlgo,
        installmentsPaid: 1,
        installments
      };

      // Save plan to database
      if (this.repository) {
        // Add gift card metadata to plan
        plan.giftCardDetails = {
          productId: quote.productId,
          productName: quote.productName,
          denomination: quote.denomination
        };
        
        await this.repository.savePlan(plan);
        
        // Update user's outstanding amount
        const user = await this.repository.getOrCreateUser(quote.walletAddress);
        user.activeOutstandingInr += plan.remainingAmountAlgo * quote.algoToInrRate;
        await this.repository.updateUser(user);
      }
      
      // IMPORTANT: Also add plan to ContractGateway's in-memory store for read model
      // Access the store directly since there's no public method
      (this.contractGateway as any).store.plans.set(plan.planId, plan);

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
        logger.error("Gift card fulfillment failed after successful blockchain transaction", {
          planId: plan.planId,
          quoteId,
          blockchainTxId: txId,
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined
        });

        if (this.repository) {
          await this.repository.updatePlan(planId, { status: "CANCELLED" });
        }

        throw new Error(
          `Payment successful but gift card delivery failed. ` +
          `Blockchain transaction: ${txId}. ` +
          `Contact support with plan ID: ${planId}`
        );
      }
    } catch (error) {
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
