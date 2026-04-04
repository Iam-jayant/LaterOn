import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ValidationError } from "../errors.js";
import { AtomicTxBuilder } from "../services/atomic-tx-builder.js";
import { nowUnix } from "../lib/time.js";

/**
 * Repayment API Routes
 * 
 * Implements the repayment flow with two endpoints:
 * 1. POST /api/repayment/prepare - Build unsigned repayment transaction
 * 2. POST /api/repayment/confirm - Update plan in PostgreSQL after on-chain confirmation
 * 
 * Requirements: 4.4, 4.7
 */

/**
 * POST /api/repayment/prepare
 * 
 * Build unsigned repayment transaction using AtomicTxBuilder.
 * Returns base64-encoded unsigned transaction for wallet signing.
 * 
 * Request body:
 * - planId: ID of the payment plan to repay
 * - walletAddress: Borrower's wallet address (for validation)
 * 
 * Response:
 * - unsignedTxn: Base64-encoded unsigned transaction
 * - plan: Current plan details for reference
 * - repaymentAmount: Amount to be repaid in ALGO
 * 
 * Validates:
 * - Requirement 4.4: Construct repayment transaction calling BNPLCore
 */
const prepareSchema = z.object({
  planId: z.string().min(8),
  walletAddress: z.string().min(8),
});

/**
 * POST /api/repayment/confirm
 * 
 * Update plan in PostgreSQL after on-chain confirmation.
 * Called by frontend after repayment transaction is confirmed on-chain.
 * 
 * Request body:
 * - planId: Plan ID from prepare response
 * - txId: Transaction ID from on-chain confirmation
 * - repaymentAmountAlgo: Amount repaid in ALGO
 * 
 * Response:
 * - success: true
 * - plan: Updated plan record
 * 
 * Validates:
 * - Requirement 4.7: Update plan record in PostgreSQL after on-chain confirmation
 */
const confirmSchema = z.object({
  planId: z.string().min(8),
  txId: z.string().min(8),
  repaymentAmountAlgo: z.number().positive(),
});

export const registerRepaymentRoutes = (app: FastifyInstance): void => {
  /**
   * POST /api/repayment/prepare
   * Build unsigned repayment transaction using AtomicTxBuilder
   */
  app.post("/api/repayment/prepare", async (request, reply) => {
    const payload = prepareSchema.safeParse(request.body);
    if (!payload.success) {
      throw new ValidationError("Invalid repayment prepare request", payload.error.flatten());
    }

    // Get plan from PostgreSQL
    const plan = await app.ctx.repository.getPlan(payload.data.planId);
    if (!plan) {
      throw new ValidationError("Plan not found");
    }

    // Validate wallet address matches plan owner
    if (plan.walletAddress !== payload.data.walletAddress) {
      throw new ValidationError("Wallet address does not match plan owner");
    }

    // Validate plan is not already completed
    if (plan.status === "COMPLETED") {
      throw new ValidationError("Plan is already completed");
    }

    // Calculate repayment amount (installment amount for MVP)
    // For MVP: divide remaining amount by remaining installments
    const remainingInstallments = plan.tenureMonths - plan.installmentsPaid;
    const repaymentAmountAlgo = remainingInstallments > 0 
      ? plan.remainingAmountAlgo / remainingInstallments
      : plan.remainingAmountAlgo;

    // Convert plan ID to numeric for contract
    const planIdNumeric = parseInt(plan.planId.replace(/\D/g, "").slice(0, 8), 10) || Date.now();

    // Build repayment transaction
    const txBuilder = new AtomicTxBuilder(app.ctx.config);
    const repaymentTx = await txBuilder.buildRepaymentTx({
      borrowerAddress: plan.walletAddress,
      planId: planIdNumeric,
      repaymentAmountMicroAlgo: Math.round(repaymentAmountAlgo * 1_000_000),
    });

    // Encode transaction as base64 for frontend
    const unsignedTxn = Buffer.from(repaymentTx.toByte()).toString("base64");

    return reply.status(200).send({
      unsignedTxn,
      plan,
      repaymentAmountAlgo,
    });
  });

  /**
   * POST /api/repayment/confirm
   * Update plan in PostgreSQL after on-chain confirmation
   */
  app.post("/api/repayment/confirm", async (request, reply) => {
    const payload = confirmSchema.safeParse(request.body);
    if (!payload.success) {
      throw new ValidationError("Invalid repayment confirm request", payload.error.flatten());
    }

    // Get current plan from PostgreSQL
    const plan = await app.ctx.repository.getPlan(payload.data.planId);
    if (!plan) {
      throw new ValidationError("Plan not found");
    }

    // Calculate new remaining amount and installments paid
    const newRemainingAmount = plan.remainingAmountAlgo - payload.data.repaymentAmountAlgo;
    const newInstallmentsPaid = plan.installmentsPaid + 1;

    // Determine new status
    let newStatus = plan.status;
    if (newRemainingAmount <= 0.01) {
      // Consider completed if remaining is negligible (accounting for floating point)
      newStatus = "COMPLETED";
    }

    // Calculate next due date (30 days from now for next installment)
    const nextDueUnix = nowUnix() + 30 * 24 * 60 * 60;

    // Update plan in PostgreSQL (Requirement 4.7)
    await app.ctx.repository.updatePlan(payload.data.planId, {
      remainingAmountAlgo: Math.max(0, newRemainingAmount),
      installmentsPaid: newInstallmentsPaid,
      status: newStatus,
      nextDueAtUnix: newStatus === "COMPLETED" ? plan.nextDueAtUnix : nextDueUnix,
    });

    // If plan is completed, update user's completed plans count
    if (newStatus === "COMPLETED" && plan.status !== "COMPLETED") {
      const user = await app.ctx.repository.getOrCreateUser(plan.walletAddress);
      // Note: User completed_plans increment would require additional repository method
      // For MVP, this is handled by the gateway/read model
    }

    // Update liquidity state (return funds to pool)
    const liquidityState = app.ctx.gateway.getLiquidityState();
    liquidityState.availableAlgo += payload.data.repaymentAmountAlgo;
    liquidityState.totalLentAlgo -= payload.data.repaymentAmountAlgo;

    // Get updated plan
    const updatedPlan = await app.ctx.repository.getPlan(payload.data.planId);

    return reply.status(200).send({
      success: true,
      plan: updatedPlan,
    });
  });
};
