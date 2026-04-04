import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ValidationError } from "../errors.js";
import { AtomicTxBuilder } from "../services/atomic-tx-builder.js";
import { nowUnix } from "../lib/time.js";
import { createId } from "../lib/ids.js";
import type { PlanRecord } from "@lateron/sdk";

// Temporary in-memory storage for pending checkouts
// In production, use Redis or similar distributed cache
const pendingCheckouts = new Map<string, { quoteId: string; planId: string; createdAtUnix: number }>();

/**
 * Checkout API Routes
 * 
 * Implements the checkout flow with three endpoints:
 * 1. POST /api/checkout/quote - Generate a quote for a purchase
 * 2. POST /api/checkout/commit - Build unsigned transaction group for checkout
 * 3. POST /api/checkout/confirm - Save plan to PostgreSQL after on-chain confirmation
 * 
 * Requirements: 3.1, 3.3, 3.10, 3.12
 */

/**
 * POST /api/checkout/quote
 * 
 * Generate a quote for a purchase using the existing QuoteService.
 * 
 * Request body:
 * - walletAddress: Borrower's Algorand wallet address
 * - merchantId: Merchant identifier
 * - orderAmountInr: Order amount in INR
 * - tenureMonths: Repayment tenure in months (default: 3)
 * 
 * Response:
 * - CheckoutQuote object with quote details
 * 
 * Validates:
 * - Requirement 3.1: Fetch quote on checkout navigation
 */
const quoteSchema = z.object({
  walletAddress: z.string().min(8),
  merchantId: z.string().min(2),
  orderAmountInr: z.number().positive(),
  tenureMonths: z.number().int().positive().max(24).default(3),
});

/**
 * POST /api/checkout/commit
 * 
 * Build unsigned transaction group for checkout using AtomicTxBuilder.
 * Returns base64-encoded unsigned transactions for wallet signing.
 * 
 * Request body:
 * - quoteId: ID of the quote to commit
 * 
 * Response:
 * - unsignedTxns: Array of base64-encoded unsigned transactions
 * - planId: Generated plan ID for confirmation step
 * - quote: Quote details for reference
 * 
 * Validates:
 * - Requirement 3.3: Call API checkout commit endpoint
 * - Requirement 3.12: Validate quote has not expired
 */
const commitSchema = z.object({
  quoteId: z.string().min(10),
});

/**
 * POST /api/checkout/confirm
 * 
 * Save plan to PostgreSQL after on-chain confirmation.
 * Called by frontend after transaction group is confirmed on-chain.
 * 
 * Request body:
 * - planId: Plan ID from commit response
 * - txId: Transaction ID from on-chain confirmation
 * 
 * Response:
 * - success: true
 * - plan: Saved plan record
 * 
 * Validates:
 * - Requirement 3.10: Save plan record to PostgreSQL after on-chain confirmation
 */
const confirmSchema = z.object({
  planId: z.string().min(8),
  txId: z.string().min(8),
});

export const registerCheckoutRoutes = (app: FastifyInstance): void => {
  /**
   * POST /api/checkout/quote
   * Generate quote using existing QuoteService
   */
  app.post("/api/checkout/quote", async (request, reply) => {
    const payload = quoteSchema.safeParse(request.body);
    if (!payload.success) {
      throw new ValidationError("Invalid quote request", payload.error.flatten());
    }

    const quote = app.ctx.quoteService.createQuote({
      walletAddress: payload.data.walletAddress,
      merchantId: payload.data.merchantId,
      orderAmountInr: payload.data.orderAmountInr,
      tenureMonths: payload.data.tenureMonths,
    });

    return reply.status(200).send(quote);
  });

  /**
   * POST /api/checkout/commit
   * Build unsigned transaction group using AtomicTxBuilder
   */
  app.post("/api/checkout/commit", async (request, reply) => {
    const payload = commitSchema.safeParse(request.body);
    if (!payload.success) {
      throw new ValidationError("Invalid commit request", payload.error.flatten());
    }

    // Get quote and validate expiration (Requirement 3.12)
    const quote = app.ctx.gateway.getQuote(payload.data.quoteId);
    if (quote.expiresAtUnix < nowUnix()) {
      throw new ValidationError("Quote has expired");
    }

    // Get or create user to determine tier
    const user = await app.ctx.gateway.getOrCreateUser(quote.walletAddress);
    
    // Map tier to numeric value for contract
    const tierMap: Record<string, number> = {
      NEW: 0,
      EMERGING: 1,
      TRUSTED: 2,
    };
    const tierAtApproval = tierMap[user.tier] ?? 0;

    // Generate plan ID for this checkout
    const planId = createId("plan");
    const planIdNumeric = parseInt(planId.replace(/\D/g, "").slice(0, 8), 10) || Date.now();

    // Calculate next due date (30 days from now for first installment)
    const nextDueUnix = nowUnix() + 30 * 24 * 60 * 60;

    // Build atomic transaction group
    const txBuilder = new AtomicTxBuilder(app.ctx.config);
    const txGroup = await txBuilder.buildCheckoutGroup({
      borrowerAddress: quote.walletAddress,
      merchantAddress: quote.merchantId, // Using merchantId as address for MVP
      upfrontAmountMicroAlgo: Math.round(quote.upfrontAmountAlgo * 1_000_000),
      financedAmountMicroAlgo: Math.round(quote.financedAmountAlgo * 1_000_000),
      nextDueUnix,
      tierAtApproval,
      planId: planIdNumeric,
    });

    // Encode transactions as base64 for frontend
    const unsignedTxns = txGroup.map((tx) => Buffer.from(tx.toByte()).toString("base64"));

    // Store plan ID and quote ID mapping for confirmation step
    pendingCheckouts.set(planId, {
      quoteId: quote.quoteId,
      planId,
      createdAtUnix: nowUnix(),
    });

    return reply.status(200).send({
      unsignedTxns,
      planId,
      quote,
    });
  });

  /**
   * POST /api/checkout/confirm
   * Save plan to PostgreSQL after on-chain confirmation
   */
  app.post("/api/checkout/confirm", async (request, reply) => {
    const payload = confirmSchema.safeParse(request.body);
    if (!payload.success) {
      throw new ValidationError("Invalid confirm request", payload.error.flatten());
    }

    // Retrieve pending checkout info
    const pending = pendingCheckouts.get(payload.data.planId);
    if (!pending) {
      throw new ValidationError("Plan ID not found in pending checkouts");
    }

    // Get quote to reconstruct plan details
    const quote = app.ctx.gateway.getQuote(pending.quoteId);
    const user = await app.ctx.gateway.getOrCreateUser(quote.walletAddress);

    // Calculate next due date (30 days from now for first installment)
    const createdAtUnix = nowUnix();
    const nextDueUnix = createdAtUnix + 30 * 24 * 60 * 60;

    // Calculate installment amount
    const installmentAmountAlgo =
      quote.installmentAmountAlgo > 0
        ? quote.installmentAmountAlgo
        : quote.tenureMonths > 0
          ? quote.financedAmountAlgo / quote.tenureMonths
          : quote.financedAmountAlgo;

    // Generate installment schedule
    const installments = [];
    for (let i = 0; i < quote.tenureMonths; i++) {
      installments.push({
        installmentNumber: i + 1,
        dueAtUnix: createdAtUnix + (i + 1) * 30 * 24 * 60 * 60,
        amountAlgo: installmentAmountAlgo,
      });
    }

    // Create plan record
    const plan: PlanRecord = {
      planId: payload.data.planId,
      walletAddress: quote.walletAddress,
      merchantId: quote.merchantId,
      status: "ACTIVE",
      tierAtApproval: user.tier,
      tenureMonths: quote.tenureMonths,
      aprPercent: quote.monthlyRate * 12 * 100,
      createdAtUnix,
      nextDueAtUnix: nextDueUnix,
      financedAmountInr: quote.financedAmountInr,
      financedAmountAlgo: quote.financedAmountAlgo,
      remainingAmountAlgo: quote.financedAmountAlgo,
      installmentsPaid: 0,
      installments,
    };

    // Save plan to PostgreSQL (Requirement 3.10)
    await app.ctx.repository.savePlan(plan);

    // Update liquidity state
    app.ctx.gateway.getLiquidityState().availableAlgo -= quote.financedAmountAlgo;
    app.ctx.gateway.getLiquidityState().totalLentAlgo += quote.financedAmountAlgo;

    // Clean up pending checkout
    pendingCheckouts.delete(payload.data.planId);

    // Delete consumed quote
    const store = app.ctx.gateway["store"] as any;
    if (store?.quotes) {
      store.quotes.delete(pending.quoteId);
    }

    return reply.status(200).send({
      success: true,
      plan,
    });
  });
};
