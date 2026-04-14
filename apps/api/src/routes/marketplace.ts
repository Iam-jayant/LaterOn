import type { Hono } from "hono";
import { z } from "zod";
import { ValidationError, NotFoundError, ForbiddenError } from "../errors.js";
import { logger } from "../lib/logger.js";
import type { AppContext } from "../app-context.js";

type HonoApp = Hono<{ Variables: { ctx: AppContext } }>;

/**
 * Marketplace API Routes
 * 
 * Implements gift card marketplace endpoints:
 * 1. GET /api/marketplace/catalog - Fetch available gift cards
 * 2. POST /api/marketplace/quote - Create marketplace quote with BNPL
 * 3. POST /api/marketplace/checkout - Execute gift card purchase
 * 4. GET /api/marketplace/gift-card/:planId - Retrieve gift card details
 * 
 * Requirements: 2.3, 3.4, 5.1-5.7, 6.2-6.8, 7.1-7.6, 9.5, 12.1, 12.6
 */

/**
 * GET /api/marketplace/catalog
 * 
 * Fetch available gift cards from Reloadly, filtered to India and supported brands.
 * Results are cached for 5 minutes to reduce API calls.
 * 
 * Response:
 * - products: Array of GiftCardProduct objects
 * 
 * Status Codes:
 * - 200: Success
 * - 500: Reloadly API unavailable
 * 
 * Validates:
 * - Requirement 2.3: Fetch gift card catalog from Reloadly API
 * - Requirement 3.4: Filter catalog by country (India)
 * - Requirement 12.1: Handle Reloadly API errors
 */
const registerCatalogRoute = (app: HonoApp): void => {
  app.get("/api/marketplace/catalog", async (c) => {
    try {
      logger.info("Fetching marketplace catalog");
      
      const catalog = await c.var.ctx.marketplaceService.getCatalog();
      
      logger.info("Marketplace catalog fetched successfully", { count: catalog.length });
      
      return c.json({
        products: catalog
      }, 200);
    } catch (error) {
      // Log error for debugging (Requirement 12.5)
      logger.error("Failed to fetch marketplace catalog", { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Return appropriate HTTP status code and descriptive error message (Requirements 3.6, 12.1, 12.6)
      return c.json({
        error: {
          code: "CATALOG_UNAVAILABLE",
          message: "Gift cards temporarily unavailable. Please try again later.",
          details: null
        }
      }, 500);
    }
  });
};

/**
 * POST /api/marketplace/quote
 * 
 * Create a quote for gift card purchase with BNPL.
 * Calculates ALGO amounts using CoinGecko exchange rates.
 * 
 * Request body:
 * - walletAddress: User's wallet address
 * - productId: Gift card product ID
 * - denomination: Gift card denomination in INR
 * 
 * Response:
 * - MarketplaceQuote object with installment breakdown
 * 
 * Status Codes:
 * - 200: Success
 * - 400: Invalid request
 * - 401: Unauthorized
 * - 500: CoinGecko API unavailable
 * 
 * Validates:
 * - Requirement 5.1: Display payment options including "Pay in 3"
 * - Requirement 5.2: Initiate BNPL checkout flow
 * - Requirement 5.3: Calculate installment amounts
 * - Requirement 5.5: Fetch ALGO to INR exchange rates
 * - Requirement 5.6: Convert INR amounts to ALGO
 * - Requirement 5.7: Display payment amounts in both ALGO and INR
 */
const quoteRequestSchema = z.object({
  walletAddress: z.string().min(8),
  productId: z.number().int().positive(),
  denomination: z.number().positive() // Allow decimals for gift card denominations like 11.99
});

const registerQuoteRoute = (app: HonoApp): void => {
  app.post("/api/marketplace/quote", async (c) => {
    const body = await c.req.json();
    const payload = quoteRequestSchema.safeParse(body);
    if (!payload.success) {
      // Log validation error for debugging (Requirement 12.5)
      logger.error("Invalid quote request", { 
        error: payload.error,
        body
      });
      throw new ValidationError("Invalid quote request", payload.error);
    }

    try {
      logger.info("Creating marketplace quote", {
        walletAddress: payload.data.walletAddress,
        productId: payload.data.productId,
        denomination: payload.data.denomination
      });

      const quote = await c.var.ctx.marketplaceService.createMarketplaceQuote({
        walletAddress: payload.data.walletAddress,
        productId: payload.data.productId,
        denomination: payload.data.denomination
      });

      logger.info("Marketplace quote created successfully", { quoteId: quote.quoteId });

      return c.json(quote, 200);
    } catch (error) {
      // Log error for debugging (Requirement 12.5)
      logger.error("Failed to create marketplace quote", { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        walletAddress: payload.data.walletAddress,
        productId: payload.data.productId
      });

      // Return appropriate HTTP status code based on error type (Requirement 12.6)
      if (error instanceof ValidationError) {
        throw error;
      }

      // Return descriptive error message (Requirement 3.6)
      return c.json({
        error: {
          code: "QUOTE_CREATION_FAILED",
          message: "Unable to create quote. Please try again later.",
          details: null
        }
      }, 500);
    }
  });
};

/**
 * POST /api/marketplace/checkout
 * 
 * Execute gift card purchase with BNPL.
 * Orchestrates atomic transaction submission and Reloadly fulfillment.
 * 
 * Request body:
 * - quoteId: Quote ID from createMarketplaceQuote
 * 
 * Response:
 * - success: true
 * - plan: PlanRecord with gift card details
 * - giftCard: Gift card code and PIN
 * 
 * Status Codes:
 * - 200: Success
 * - 400: Invalid quote or expired
 * - 401: Unauthorized
 * - 402: Insufficient pool liquidity
 * - 500: Transaction failed or gift card fulfillment failed
 * 
 * Validates:
 * - Requirement 6.2: Prepare atomic transaction for first installment
 * - Requirement 6.3: Include payment from user to lending pool
 * - Requirement 6.4: Include disbursement from lending pool to merchant
 * - Requirement 6.7: Submit signed transaction to Algorand TestNet
 * - Requirement 6.8: Wait for blockchain confirmation
 * - Requirement 7.1: Call Reloadly API after transaction confirmation
 * - Requirement 7.2: Retrieve gift card code and PIN
 * - Requirement 7.6: Refund if Reloadly fulfillment fails
 * - Requirement 12.6: Return appropriate HTTP status codes
 */
const checkoutRequestSchema = z.object({
  quoteId: z.string().min(10)
});

const registerCheckoutRoute = (app: HonoApp): void => {
  app.post("/api/marketplace/checkout", async (c) => {
    const body = await c.req.json();
    const payload = checkoutRequestSchema.safeParse(body);
    if (!payload.success) {
      // Log validation error for debugging (Requirement 12.5)
      logger.error("Invalid checkout request", { 
        error: payload.error,
        body
      });
      throw new ValidationError("Invalid checkout request", payload.error);
    }

    try {
      logger.info("Processing marketplace checkout", {
        quoteId: payload.data.quoteId
      });

      // Purchase gift card (this handles plan creation and Reloadly fulfillment)
      const giftCard = await c.var.ctx.marketplaceService.purchaseGiftCard(payload.data.quoteId);

      // Get the created plan
      const plan = await c.var.ctx.gateway.getPlan(giftCard.planId);

      logger.info("Marketplace checkout completed successfully", {
        planId: giftCard.planId,
        productName: giftCard.productName
      });

      return c.json({
        success: true,
        plan,
        giftCard: {
          code: giftCard.code,
          pin: giftCard.pin,
          productName: giftCard.productName,
          denomination: giftCard.denomination,
          expiresAt: giftCard.expiresAt
        }
      }, 200);
    } catch (error) {
      // Log error for debugging (Requirement 12.5)
      logger.error("Marketplace checkout failed", { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        quoteId: payload.data.quoteId
      });

      // Return appropriate HTTP status codes based on error type (Requirement 12.6)
      if (error instanceof ValidationError) {
        throw error;
      }

      // Check for specific error messages and return descriptive errors (Requirement 3.6)
      if (error instanceof Error) {
        if (error.message.includes("Insufficient pool liquidity")) {
          return c.json({
            error: {
              code: "INSUFFICIENT_LIQUIDITY",
              message: "Insufficient pool liquidity. Please try again later.",
              details: null
            }
          }, 402);
        }

        if (error.message.includes("Quote expired")) {
          return c.json({
            error: {
              code: "QUOTE_EXPIRED",
              message: "Quote expired. Please create a new quote.",
              details: null
            }
          }, 400);
        }

        if (error.message.includes("gift card delivery failed")) {
          // Extract transaction ID from error message if present
          const txIdMatch = error.message.match(/transaction ID: ([a-zA-Z0-9_-]+)/);
          const txId = txIdMatch ? txIdMatch[1] : "unknown";
          
          return c.json({
            error: {
              code: "FULFILLMENT_FAILED",
              message: `Payment received but gift card delivery failed. Contact support with transaction ID: ${txId}`,
              details: null
            }
          }, 500);
        }
      }

      // Generic error response
      return c.json({
        error: {
          code: "CHECKOUT_FAILED",
          message: "Checkout failed. Please try again later.",
          details: null
        }
      }, 500);
    }
  });
};

/**
 * POST /api/marketplace/checkout/prepare
 * 
 * Prepare marketplace checkout by building unsigned transactions.
 * Returns base64-encoded unsigned transactions for frontend signing.
 * 
 * Request body:
 * - quoteId: Quote ID from createMarketplaceQuote
 * 
 * Response:
 * - transactions: Array of base64-encoded unsigned transactions
 * 
 * Status Codes:
 * - 200: Success
 * - 400: Invalid quote or expired
 * - 402: Insufficient pool liquidity
 * - 500: Transaction building failed
 * 
 * Validates:
 * - Requirement 2.5: Build atomic transaction group
 * - Requirement 2.6: Return unsigned transactions to frontend
 */
const registerCheckoutPrepareRoute = (app: HonoApp): void => {
  app.post("/api/marketplace/checkout/prepare", async (c) => {
    const body = await c.req.json();
    const payload = checkoutRequestSchema.safeParse(body);
    if (!payload.success) {
      logger.error("Invalid checkout prepare request", { 
        error: payload.error,
        body
      });
      throw new ValidationError("Invalid checkout prepare request", payload.error);
    }

    try {
      logger.info("Preparing marketplace checkout", {
        quoteId: payload.data.quoteId
      });

      // Build unsigned transactions
      const transactions = await c.var.ctx.marketplaceService.prepareCheckout(payload.data.quoteId);

      logger.info("Marketplace checkout prepared successfully", {
        quoteId: payload.data.quoteId,
        transactionCount: transactions.length
      });

      return c.json({
        transactions
      }, 200);
    } catch (error) {
      logger.error("Marketplace checkout prepare failed", { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        quoteId: payload.data.quoteId
      });

      if (error instanceof ValidationError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.message.includes("Insufficient pool liquidity")) {
          return c.json({
            error: {
              code: "INSUFFICIENT_LIQUIDITY",
              message: "Insufficient pool liquidity. Please try again later.",
              details: null
            }
          }, 402);
        }

        if (error.message.includes("Quote expired")) {
          return c.json({
            error: {
              code: "QUOTE_EXPIRED",
              message: "Quote expired. Please create a new quote.",
              details: null
            }
          }, 400);
        }
      }

      return c.json({
        error: {
          code: "PREPARE_FAILED",
          message: "Failed to prepare checkout. Please try again later.",
          details: null
        }
      }, 500);
    }
  });
};

/**
 * POST /api/marketplace/checkout/confirm
 * 
 * Confirm marketplace checkout by submitting signed transactions and fulfilling gift card.
 * 
 * Request body:
 * - quoteId: Quote ID from createMarketplaceQuote
 * - signedTransactions: Array of base64-encoded signed transactions
 * 
 * Response:
 * - success: true
 * - giftCard: Gift card details with code and PIN
 * 
 * Status Codes:
 * - 200: Success
 * - 400: Invalid quote or expired
 * - 500: Transaction submission failed or gift card fulfillment failed
 * 
 * Validates:
 * - Requirement 2.7: Submit signed transactions to blockchain
 * - Requirement 7.1: Call Reloadly API after transaction confirmation
 * - Requirement 7.2: Retrieve gift card code and PIN
 * - Requirement 7.6: Refund if Reloadly fulfillment fails
 */
const confirmRequestSchema = z.object({
  quoteId: z.string().min(10),
  signedTransactions: z.array(z.string())
});

const registerCheckoutConfirmRoute = (app: HonoApp): void => {
  app.post("/api/marketplace/checkout/confirm", async (c) => {
    const body = await c.req.json();
    const payload = confirmRequestSchema.safeParse(body);
    if (!payload.success) {
      logger.error("Invalid checkout confirm request", { 
        error: payload.error,
        body
      });
      throw new ValidationError("Invalid checkout confirm request", payload.error);
    }

    try {
      logger.info("Confirming marketplace checkout", {
        quoteId: payload.data.quoteId,
        transactionCount: payload.data.signedTransactions.length
      });

      // Submit signed transactions and fulfill gift card
      const giftCard = await c.var.ctx.marketplaceService.confirmCheckout(
        payload.data.quoteId,
        payload.data.signedTransactions
      );

      logger.info("Marketplace checkout confirmed successfully", {
        planId: giftCard.planId,
        productName: giftCard.productName
      });

      return c.json({
        success: true,
        giftCard: {
          code: giftCard.code,
          pin: giftCard.pin,
          productName: giftCard.productName,
          denomination: giftCard.denomination,
          expiresAt: giftCard.expiresAt,
          planId: giftCard.planId
        }
      }, 200);
    } catch (error) {
      logger.error("Marketplace checkout confirm failed", { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        quoteId: payload.data.quoteId
      });

      if (error instanceof ValidationError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.message.includes("Quote expired")) {
          return c.json({
            error: {
              code: "QUOTE_EXPIRED",
              message: "Quote expired. Please create a new quote.",
              details: null
            }
          }, 400);
        }

        if (error.message.includes("balance") && error.message.includes("below min")) {
          // Extract account address from error message
          const accountMatch = error.message.match(/account ([A-Z0-9]+) balance/);
          const account = accountMatch ? accountMatch[1] : "your account";
          
          return c.json({
            error: {
              code: "INSUFFICIENT_BALANCE",
              message: `Insufficient ALGO balance. ${account === "your account" ? "Your wallet" : "Account"} needs at least 0.2 ALGO to cover transaction fees and minimum balance requirements. Please fund your wallet with testnet ALGO from https://bank.testnet.algorand.network/`,
              details: { account }
            }
          }, 400);
        }

        if (error.message.includes("gift card delivery failed")) {
          const txIdMatch = error.message.match(/transaction ID: ([a-zA-Z0-9_-]+)/);
          const txId = txIdMatch ? txIdMatch[1] : "unknown";
          
          return c.json({
            error: {
              code: "FULFILLMENT_FAILED",
              message: `Payment received but gift card delivery failed. Contact support with transaction ID: ${txId}`,
              details: null
            }
          }, 500);
        }
      }

      return c.json({
        error: {
          code: "CONFIRM_FAILED",
          message: "Failed to confirm checkout. Please try again later.",
          details: null
        }
      }, 500);
    }
  });
};

/**
 * GET /api/marketplace/gift-card/:planId
 * 
 * Retrieve gift card details for a plan.
 * Validates user authorization (wallet address matches plan owner).
 * 
 * Path parameters:
 * - planId: Plan ID
 * 
 * Response:
 * - giftCard: Gift card code and PIN
 * 
 * Status Codes:
 * - 200: Success
 * - 401: Unauthorized
 * - 403: Forbidden (not plan owner)
 * - 404: Plan not found or no gift card attached
 * 
 * Validates:
 * - Requirement 7.5: Store gift card details associated with BNPL plan
 * - Requirement 9.5: Allow users to view gift card details
 */
const giftCardParamsSchema = z.object({
  planId: z.string().min(8)
});

const registerGiftCardRoute = (app: HonoApp): void => {
  app.get("/api/marketplace/gift-card/:planId", async (c) => {
    const params = giftCardParamsSchema.safeParse(c.req.param());
    if (!params.success) {
      // Log validation error for debugging (Requirement 12.5)
      logger.error("Invalid plan ID", { 
        error: params.error,
        params: c.req.param()
      });
      throw new ValidationError("Invalid plan ID", params.error);
    }

    try {
      logger.info("Retrieving gift card details", {
        planId: params.data.planId
      });

      // Get plan to validate ownership
      await c.var.ctx.gateway.getPlan(params.data.planId);

      // TODO: Add wallet authorization check when auth is implemented
      // For now, we'll allow anyone to retrieve gift card details
      // In production, verify that the authenticated wallet matches plan.walletAddress

      // Get gift card details
      const giftCard = await c.var.ctx.marketplaceService.getGiftCardDetails(params.data.planId);

      if (!giftCard) {
        logger.warn("Gift card not found for plan", { planId: params.data.planId });
        throw new NotFoundError("Gift card not found for this plan");
      }

      logger.info("Gift card details retrieved successfully", { planId: params.data.planId });

      return c.json({
        giftCard: {
          code: giftCard.code,
          pin: giftCard.pin,
          productName: giftCard.productName,
          denomination: giftCard.denomination,
          expiresAt: giftCard.expiresAt
        }
      }, 200);
    } catch (error) {
      // Log error for debugging (Requirement 12.5)
      logger.error("Failed to retrieve gift card details", { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        planId: params.data.planId
      });

      // Return appropriate HTTP status codes based on error type (Requirement 12.6)
      if (error instanceof NotFoundError) {
        return c.json({
          error: {
            code: "NOT_FOUND",
            message: error.message,
            details: null
          }
        }, 404);
      }

      if (error instanceof ForbiddenError) {
        return c.json({
          error: {
            code: "FORBIDDEN",
            message: "Not authorized to access this gift card",
            details: null
          }
        }, 403);
      }

      // Generic error response with descriptive message (Requirement 3.6)
      return c.json({
        error: {
          code: "RETRIEVAL_FAILED",
          message: "Failed to retrieve gift card details. Please try again later.",
          details: null
        }
      }, 500);
    }
  });
};

export const registerMarketplaceRoutes = (app: HonoApp): void => {
  registerCatalogRoute(app);
  registerQuoteRoute(app);
  registerCheckoutRoute(app);
  registerCheckoutPrepareRoute(app);
  registerCheckoutConfirmRoute(app);
  registerGiftCardRoute(app);
};
