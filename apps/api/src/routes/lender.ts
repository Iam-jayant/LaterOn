import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ValidationError } from "../errors.js";
import algosdk from "algosdk";

/**
 * Lender API Routes
 * 
 * Implements the lender deposit flow with three endpoints:
 * 1. POST /api/lender/deposit/prepare - Build unsigned payment transaction to pool
 * 2. POST /api/lender/deposit/confirm - Record deposit in lender_deposits table
 * 3. GET /api/lender/stats - Return pool statistics from PostgreSQL
 * 
 * Requirements: 7.3, 7.5, 7.8
 */

/**
 * POST /api/lender/deposit/prepare
 * 
 * Build unsigned payment transaction to the LiquidityPool contract.
 * Returns base64-encoded unsigned transaction for wallet signing.
 * 
 * Request body:
 * - lenderAddress: Lender's Algorand wallet address
 * - amountAlgo: Deposit amount in ALGO
 * 
 * Response:
 * - unsignedTxn: Base64-encoded unsigned transaction
 * - amountAlgo: Deposit amount for confirmation step
 * 
 * Validates:
 * - Requirement 7.2: Validate amount is positive
 * - Requirement 7.3: Construct payment transaction to pool
 */
const prepareDepositSchema = z.object({
  lenderAddress: z.string().min(8),
  amountAlgo: z.number().positive(),
});

/**
 * POST /api/lender/deposit/confirm
 * 
 * Record deposit in lender_deposits table after on-chain confirmation.
 * Called by frontend after transaction is confirmed on-chain.
 * 
 * Request body:
 * - lenderAddress: Lender's Algorand wallet address
 * - amountAlgo: Deposit amount in ALGO
 * - txId: Transaction ID from on-chain confirmation
 * 
 * Response:
 * - success: true
 * - deposit: Recorded deposit details
 * 
 * Validates:
 * - Requirement 7.5: Update pool statistics in PostgreSQL
 * - Requirement 7.8: Track lender deposits in lender_deposits table
 */
const confirmDepositSchema = z.object({
  lenderAddress: z.string().min(8),
  amountAlgo: z.number().positive(),
  txId: z.string().min(8),
});

export const registerLenderRoutes = (app: FastifyInstance): void => {
  /**
   * POST /api/lender/deposit/prepare
   * Build unsigned payment transaction to pool
   */
  app.post("/api/lender/deposit/prepare", async (request, reply) => {
    const payload = prepareDepositSchema.safeParse(request.body);
    if (!payload.success) {
      throw new ValidationError("Invalid deposit prepare request", payload.error.flatten());
    }

    // Validate amount is positive (Requirement 7.2)
    if (payload.data.amountAlgo <= 0) {
      throw new ValidationError("Deposit amount must be positive");
    }

    // Get pool address from config
    const poolAddress = algosdk.getApplicationAddress(app.ctx.config.poolAppId);

    // Get suggested transaction parameters
    const algod = new algosdk.Algodv2(
      app.ctx.config.algodToken,
      app.ctx.config.algodAddress,
      ""
    );
    const suggestedParams = await algod.getTransactionParams().do();

    // Build payment transaction to pool (Requirement 7.3)
    const paymentTx = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: payload.data.lenderAddress,
      receiver: poolAddress,
      amount: Math.round(payload.data.amountAlgo * 1_000_000), // Convert ALGO to microALGO
      suggestedParams,
    });

    // Encode transaction as base64 for frontend
    const unsignedTxn = Buffer.from(paymentTx.toByte()).toString("base64");

    return reply.status(200).send({
      unsignedTxn,
      amountAlgo: payload.data.amountAlgo,
      poolAddress,
    });
  });

  /**
   * POST /api/lender/deposit/confirm
   * Record deposit in lender_deposits table after on-chain confirmation
   */
  app.post("/api/lender/deposit/confirm", async (request, reply) => {
    const payload = confirmDepositSchema.safeParse(request.body);
    if (!payload.success) {
      throw new ValidationError("Invalid deposit confirm request", payload.error.flatten());
    }

    // Record deposit in lender_deposits table (Requirement 7.8)
    await app.ctx.repository.saveDeposit(
      payload.data.lenderAddress,
      payload.data.amountAlgo,
      payload.data.txId
    );

    // Update pool statistics (Requirement 7.5)
    // Increment total_deposits and available_liquidity
    const liquidityState = app.ctx.gateway.getLiquidityState();
    liquidityState.totalDepositsAlgo += payload.data.amountAlgo;
    liquidityState.availableAlgo += payload.data.amountAlgo;

    return reply.status(200).send({
      success: true,
      deposit: {
        lenderAddress: payload.data.lenderAddress,
        amountAlgo: payload.data.amountAlgo,
        txId: payload.data.txId,
      },
    });
  });

  /**
   * GET /api/lender/stats
   * Return pool statistics from PostgreSQL
   */
  app.get("/api/lender/stats", async (request, reply) => {
    // Get pool statistics (Requirement 7.1)
    const liquidityState = app.ctx.gateway.getLiquidityState();

    // Calculate statistics
    const stats = {
      totalDepositsAlgo: liquidityState.totalDepositsAlgo,
      totalLentAlgo: liquidityState.totalLentAlgo,
      availableLiquidityAlgo: liquidityState.availableAlgo,
    };

    return reply.status(200).send(stats);
  });
};
