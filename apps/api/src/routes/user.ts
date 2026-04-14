import type { Hono } from "hono";
import { z } from "zod";
import { TIER_CAPS } from "@lateron/sdk";
import { ValidationError, UnauthorizedError, ForbiddenError } from "../errors.js";
import { logger } from "../lib/logger.js";
import type { AppContext } from "../app-context.js";

type HonoApp = Hono<{ Variables: { ctx: AppContext } }>;

/**
 * User API Routes
 * 
 * Implements user-specific operations:
 * 1. POST /api/user/analyse-wallet - Analyze wallet and calculate credit score
 * 2. GET /api/user/data-access-log - Retrieve data access audit trail
 * 3. DELETE /api/user/me - Delete user data (right to erasure)
 * 
 * Requirements: 11.1-11.7, 7.1-7.6, 5.1-5.8
 */

/**
 * Helper function to resolve wallet address from authentication token.
 * Throws UnauthorizedError if token is missing or invalid.
 * 
 * @param c - Hono context
 * @returns Authenticated wallet address
 */
const resolveWalletFromAuth = (c: any): string => {
  const authHeader = c.req.header("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing Bearer token");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const payload = c.var.ctx.authService.verifyToken(token, c.var.ctx.config.authTokenSecret);
  return payload.walletAddress;
};

const assertWalletMatch = (authenticatedWalletAddress: string, requestedWalletAddress: string): void => {
  if (authenticatedWalletAddress !== requestedWalletAddress) {
    throw new UnauthorizedError("Wallet address does not match authenticated user");
  }
};

/**
 * POST /api/user/profile
 * 
 * Save or update user profile (name and email).
 * No authentication required for first-time users during onboarding.
 * 
 * Request body:
 * - name: User's name (optional)
 * - email: User's email (optional)
 * - walletAddress: User's wallet address
 * 
 * Response:
 * - success: true
 * 
 * Status Codes:
 * - 200: Success
 * - 500: Database error
 */
const registerProfileRoute = (app: HonoApp): void => {
  app.post("/api/user/profile", async (c) => {
    try {
      const body = await c.req.json();
      const { name, email, walletAddress } = body;

      if (!walletAddress) {
        return c.json({
          error: {
            code: "INVALID_REQUEST",
            message: "walletAddress is required",
            details: null
          }
        }, 400);
      }

      logger.info("Updating user profile", { walletAddress, hasName: !!name, hasEmail: !!email });

      // Update user profile in database
      await c.var.ctx.repository.updateUserProfile(walletAddress, { name, email });

      logger.info("User profile updated successfully", { walletAddress });

      return c.json({ success: true }, 200);
    } catch (error) {
      logger.error("Failed to update user profile", { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });

      return c.json({
        error: {
          code: "PROFILE_UPDATE_FAILED",
          message: "Failed to update profile. Please try again later.",
          details: null
        }
      }, 500);
    }
  });
};

const registerUserProfileFetchRoute = (app: HonoApp): void => {
  app.get("/api/user/:walletAddress", async (c) => {
    const walletAddress = c.req.param("walletAddress");
    const authenticatedWalletAddress = resolveWalletFromAuth(c);
    assertWalletMatch(authenticatedWalletAddress, walletAddress);

    const repository = c.var.ctx.repository;
    const user = repository
      ? await repository.getUser(walletAddress)
      : await c.var.ctx.gateway.getOrCreateUser(walletAddress);

    if (!user) {
      return c.json({
        error: {
          code: "USER_NOT_FOUND",
          message: "User not found",
          details: null,
        }
      }, 404);
    }

    const plans = repository
      ? await repository.getPlansByWallet(walletAddress)
      : await c.var.ctx.gateway.listPlansByWallet(walletAddress);
    const activePlans = plans.filter((plan) => plan.status === "ACTIVE" || plan.status === "LATE").length;
    const capacityRemainingInr = Math.max(0, TIER_CAPS[user.tier].maxOutstandingInr - user.activeOutstandingInr);
    const capacityAlgo = Number((capacityRemainingInr * c.var.ctx.config.defaultAlgoPerInr).toFixed(6));

    const extendedUser = user as typeof user & {
      scoreAsaId?: number;
      name?: string | null;
      email?: string | null;
    };

    return c.json({
      walletAddress: user.walletAddress,
      tier: user.tier,
      capacityAlgo,
      completedPlans: user.completedPlans,
      activePlans,
      laterOnScore: user.laterOnScore,
      scoreAsaId: extendedUser.scoreAsaId ?? null,
      name: extendedUser.name ?? null,
      email: extendedUser.email ?? null,
    }, 200);
  });
};

const registerUserPlansRoute = (app: HonoApp): void => {
  app.get("/api/user/:walletAddress/plans", async (c) => {
    const walletAddress = c.req.param("walletAddress");
    const authenticatedWalletAddress = resolveWalletFromAuth(c);
    assertWalletMatch(authenticatedWalletAddress, walletAddress);

    const repository = c.var.ctx.repository;
    const plans = repository
      ? await repository.getPlansByWallet(walletAddress)
      : await c.var.ctx.gateway.listPlansByWallet(walletAddress);

    const plansWithProductNames = repository
      ? await Promise.all(
          plans.map(async (plan) => {
            const giftCard = await repository.getGiftCardByPlanId(plan.planId);
            return {
              ...plan,
              productName: giftCard?.productName ?? null,
            };
          })
        )
      : plans.map((plan) => ({
          ...plan,
          productName: null,
        }));

    return c.json(plansWithProductNames, 200);
  });
};

/**
 * POST /api/user/create-score-asa
 * 
 * Create Score ASA for authenticated user after wallet analysis.
 * Requires authentication and existing user record with score.
 * 
 * Request: None (uses authenticated wallet address)
 * 
 * Response:
 * - asaId: Algorand ASA ID of created Score token
 * 
 * Status Codes:
 * - 200: Success
 * - 401: Unauthorized (missing or invalid token)
 * - 500: ASA creation failed
 */
const registerCreateScoreASARoute = (app: HonoApp): void => {
  app.post("/api/user/create-score-asa", async (c) => {
    try {
      // Resolve authenticated wallet address
      const walletAddress = resolveWalletFromAuth(c);

      logger.info("Creating Score ASA", { walletAddress });

      // Get user profile to retrieve score and tier
      const user = await c.var.ctx.repository.getUser(walletAddress);
      if (!user) {
        return c.json({
          error: {
            code: "USER_NOT_FOUND",
            message: "User not found",
            details: null
          }
        }, 404);
      }

      // Create Score ASA
      const asaId = await c.var.ctx.scoreASAService.createScoreASA({
        walletAddress,
        score: user.laterOnScore ?? 500,
        tier: user.tier ?? 'NEW'
      });

      logger.info("Score ASA created successfully", { walletAddress, asaId });

      return c.json({ asaId }, 200);
    } catch (error) {
      // Re-throw known errors
      if (error instanceof UnauthorizedError) {
        throw error;
      }

      logger.error("Failed to create Score ASA", { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });

      return c.json({
        error: {
          code: "ASA_CREATION_FAILED",
          message: "Failed to create Score ASA. Please try again later.",
          details: null
        }
      }, 500);
    }
  });
};

/**
 * POST /api/user/transfer-score-asa
 * 
 * Transfer Score ASA to user after opt-in confirmation.
 * Requires authentication.
 * 
 * Request body:
 * - asaId: ASA ID to transfer
 * 
 * Response:
 * - success: true
 * 
 * Status Codes:
 * - 200: Success
 * - 401: Unauthorized (missing or invalid token)
 * - 500: Transfer failed
 */
const registerTransferScoreASARoute = (app: HonoApp): void => {
  app.post("/api/user/transfer-score-asa", async (c) => {
    try {
      // Resolve authenticated wallet address
      const walletAddress = resolveWalletFromAuth(c);

      const body = await c.req.json();
      const { asaId } = body;

      if (!asaId) {
        return c.json({
          error: {
            code: "INVALID_REQUEST",
            message: "asaId is required",
            details: null
          }
        }, 400);
      }

      logger.info("Transferring Score ASA", { walletAddress, asaId });

      // Transfer ASA to user
      await c.var.ctx.scoreASAService.transferASAToUser({
        asaId,
        recipientAddress: walletAddress
      });

      logger.info("Score ASA transferred successfully", { walletAddress, asaId });

      return c.json({ success: true }, 200);
    } catch (error) {
      // Re-throw known errors
      if (error instanceof UnauthorizedError) {
        throw error;
      }

      logger.error("Failed to transfer Score ASA", { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });

      return c.json({
        error: {
          code: "ASA_TRANSFER_FAILED",
          message: "Failed to transfer Score ASA. Please try again later.",
          details: null
        }
      }, 500);
    }
  });
};

/**
 * GET /api/user/wallet-balance
 * 
 * Check authenticated user's ALGO balance.
 * Used to verify minimum balance requirement for ASA holding.
 * 
 * Request: None (uses authenticated wallet address)
 * 
 * Response:
 * - balance: Current balance in ALGO
 * 
 * Status Codes:
 * - 200: Success
 * - 401: Unauthorized (missing or invalid token)
 * - 500: Balance check failed
 */
const registerWalletBalanceRoute = (app: HonoApp): void => {
  app.get("/api/user/wallet-balance", async (c) => {
    try {
      // Resolve authenticated wallet address
      const walletAddress = resolveWalletFromAuth(c);

      logger.info("Checking wallet balance", { walletAddress });

      // Check balance using ScoreASAService
      const balance = await c.var.ctx.scoreASAService.checkUserBalance(walletAddress);

      logger.info("Wallet balance retrieved", { walletAddress, balance });

      return c.json({ balance }, 200);
    } catch (error) {
      // Re-throw known errors
      if (error instanceof UnauthorizedError) {
        throw error;
      }

      logger.error("Failed to check wallet balance", { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });

      return c.json({
        error: {
          code: "BALANCE_CHECK_FAILED",
          message: "Failed to check wallet balance. Please try again later.",
          details: null
        }
      }, 500);
    }
  });
};

/**
 * POST /api/user/analyse-wallet
 * 
 * Analyze user's wallet using Algorand Indexer and calculate credit score.
 * Requires authentication and valid consent record.
 * 
 * Request: None (uses authenticated wallet address)
 * 
 * Response:
 * - breakdown: Array of WalletSignal objects with score breakdown
 * - totalScore: Total credit score (500-1000)
 * - tier: User tier (Starter/Builder/Trusted)
 * - creditLimit: Credit limit in INR
 * 
 * Status Codes:
 * - 200: Success
 * - 401: Unauthorized (missing or invalid token)
 * - 403: Forbidden (no consent record found)
 * - 500: Wallet analysis failed
 * 
 * Validates:
 * - Requirement 11.1: Provide POST /api/user/analyse-wallet endpoint
 * - Requirement 11.2: Require authentication
 * - Requirement 11.3: Verify consent exists
 * - Requirement 11.4: Return HTTP 403 if no consent
 * - Requirement 11.5: Call WalletAnalysisService.analyzeWallet
 * - Requirement 11.6: Update users.later_on_score in database
 * - Requirement 11.7: Return score breakdown
 */
const registerAnalyseWalletRoute = (app: HonoApp): void => {
  app.post("/api/user/analyse-wallet", async (c) => {
    try {
      // Resolve authenticated wallet address (Requirement 11.2)
      const walletAddress = resolveWalletFromAuth(c);

      logger.info("Analyzing wallet", { walletAddress });

      // Verify consent exists (Requirement 11.3)
      const hasConsent = await c.var.ctx.consentService.hasConsent(walletAddress, "credit_scoring");
      if (!hasConsent) {
        logger.warn("Consent not found for wallet analysis", { walletAddress });
        throw new ForbiddenError("Consent required for wallet analysis");
      }

      // Log data access for audit trail (Requirement 6.8)
      await c.var.ctx.consentService.logDataAccess({
        walletAddress,
        operation: "wallet_analysis",
        accessedBy: "system"
      });

      // Call WalletAnalysisService to analyze wallet (Requirement 11.5)
      const scoreBreakdown = await c.var.ctx.walletAnalysisService.analyzeWallet(walletAddress);

      // Update users.later_on_score in database (Requirement 11.6)
      await c.var.ctx.repository.updateUserScore(walletAddress, scoreBreakdown.totalScore);

      // Trigger Score ASA metadata update (Requirement 16.1)
      if (c.var.ctx.scoreASALifecycleService) {
        // Call metadata update asynchronously without blocking
        c.var.ctx.scoreASALifecycleService.updateScoreASAMetadata({
          walletAddress,
          newScore: scoreBreakdown.totalScore,
          newTier: scoreBreakdown.tier
        }).catch((error: Error) => {
          // Error is already logged in updateScoreASAMetadata
        });
      }

      logger.info("Wallet analysis completed successfully", {
        walletAddress,
        totalScore: scoreBreakdown.totalScore,
        tier: scoreBreakdown.tier
      });

      // Return score breakdown (Requirement 11.7)
      return c.json({
        breakdown: scoreBreakdown.breakdown,
        totalScore: scoreBreakdown.totalScore,
        tier: scoreBreakdown.tier,
        creditLimit: scoreBreakdown.creditLimit
      }, 200);
    } catch (error) {
      // Re-throw known errors
      if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
        throw error;
      }

      logger.error("Wallet analysis failed", { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });

      return c.json({
        error: {
          code: "ANALYSIS_FAILED",
          message: "Failed to analyze wallet. Please try again later.",
          details: null
        }
      }, 500);
    }
  });
};

/**
 * GET /api/user/data-access-log
 * 
 * Retrieve data access audit trail for authenticated user.
 * Returns all data access log entries ordered by accessed_at DESC.
 * 
 * Request: None (uses authenticated wallet address)
 * 
 * Response:
 * - logs: Array of data access log entries
 *   - operation: Description of data access
 *   - accessedBy: Identifier of accessor
 *   - accessedAt: ISO 8601 timestamp
 * 
 * Status Codes:
 * - 200: Success
 * - 401: Unauthorized (missing or invalid token)
 * - 500: Database error
 * 
 * Validates:
 * - Requirement 7.1: Provide GET /api/user/data-access-log endpoint
 * - Requirement 7.2: Require authentication
 * - Requirement 7.3: Return all data_access_log records for user
 * - Requirement 7.4: Include operation, accessed_by, accessed_at fields
 * - Requirement 7.5: Order by accessed_at DESC
 * - Requirement 7.6: Return HTTP 200 with array
 */
const registerDataAccessLogRoute = (app: HonoApp): void => {
  app.get("/api/user/data-access-log", async (c) => {
    try {
      // Resolve authenticated wallet address (Requirement 7.2)
      const walletAddress = resolveWalletFromAuth(c);

      logger.info("Retrieving data access log", { walletAddress });

      // Get data access logs (Requirement 7.3)
      const logs = await c.var.ctx.consentService.getDataAccessLog(walletAddress);

      logger.info("Data access log retrieved successfully", {
        walletAddress,
        logCount: logs.length
      });

      // Return logs with required fields (Requirements 7.4, 7.5, 7.6)
      return c.json({
        logs: logs.map(log => ({
          operation: log.operation,
          accessedBy: log.accessedBy,
          accessedAt: log.accessedAt.toISOString()
        }))
      }, 200);
    } catch (error) {
      // Re-throw known errors
      if (error instanceof UnauthorizedError) {
        throw error;
      }

      logger.error("Failed to retrieve data access log", { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });

      return c.json({
        error: {
          code: "LOG_RETRIEVAL_FAILED",
          message: "Failed to retrieve data access log. Please try again later.",
          details: null
        }
      }, 500);
    }
  });
};

/**
 * DELETE /api/user/me
 * 
 * Delete user data (right to erasure under DPDP Act 2023).
 * Deletes user record, consent records, and data access logs.
 * Marks payment plans as DELETED for audit purposes.
 * 
 * Request: None (uses authenticated wallet address)
 * 
 * Response:
 * - success: true
 * - message: Confirmation message
 * 
 * Status Codes:
 * - 200: Success
 * - 401: Unauthorized (missing or invalid token)
 * - 500: Database error
 * 
 * Validates:
 * - Requirement 5.1: Provide DELETE /api/user/me endpoint
 * - Requirement 5.2: Require authentication
 * - Requirement 5.3: Delete user record from users table
 * - Requirement 5.4: Mark payment_plans as DELETED
 * - Requirement 5.6: Delete consent records
 * - Requirement 5.7: Delete data_access_log records
 * - Requirement 5.8: Return HTTP 200 with success message
 */
const registerDeleteUserRoute = (app: HonoApp): void => {
  app.delete("/api/user/me", async (c) => {
    try {
      // Resolve authenticated wallet address (Requirement 5.2)
      const walletAddress = resolveWalletFromAuth(c);

      logger.info("Deleting user data", { walletAddress });

      // Delete user data using ConsentService (Requirements 5.3, 5.4, 5.6, 5.7)
      await c.var.ctx.consentService.deleteUserData(walletAddress);

      logger.info("User data deleted successfully", { walletAddress });

      // Return success response (Requirement 5.8)
      return c.json({
        success: true,
        message: "User data deleted successfully"
      }, 200);
    } catch (error) {
      // Re-throw known errors
      if (error instanceof UnauthorizedError) {
        throw error;
      }

      logger.error("Failed to delete user data", { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });

      return c.json({
        error: {
          code: "DELETION_FAILED",
          message: "Failed to delete user data. Please try again later.",
          details: null
        }
      }, 500);
    }
  });
};

/**
 * POST /api/user/recover-score-asa
 * 
 * Request Score ASA recovery for users who had it clawed back.
 * Checks if ban expired or default resolved, then creates new Score ASA.
 * 
 * Request: None (uses authenticated wallet address)
 * 
 * Response:
 * - success: boolean
 * - asaId: ASA ID if created, null if not eligible
 * - message: Status message
 * - requiresOptIn: boolean indicating if user needs to opt-in
 * 
 * Status Codes:
 * - 200: Success (ASA created or not eligible)
 * - 401: Unauthorized (missing or invalid token)
 * - 500: Recovery failed
 * 
 * Validates:
 * - Requirement 28.1: Provide mechanism to re-mint Score ASA
 * - Requirement 28.2: Check if ban expired
 * - Requirement 28.3: Check if default resolved
 * - Requirement 28.4: Verify sufficient balance
 * - Requirement 28.5: Create new Score ASA with current score and tier
 * - Requirement 28.6: Prevent duplicate ASA creation
 * - Requirement 28.7: Prompt opt-in and transfer
 */
const registerRecoverScoreASARoute = (app: HonoApp): void => {
  app.post("/api/user/recover-score-asa", async (c) => {
    try {
      // Resolve authenticated wallet address (Requirement 28.1)
      const walletAddress = resolveWalletFromAuth(c);

      logger.info("Requesting Score ASA recovery", { walletAddress });

      // Attempt recovery (Requirements 28.2-28.7)
      const asaId = await c.var.ctx.scoreASALifecycleService.recoverScoreASA(walletAddress);

      if (asaId) {
        logger.info("Score ASA recovery successful", {
          walletAddress,
          asaId
        });

        return c.json({
          success: true,
          asaId,
          message: "Score ASA created successfully. Please opt-in to receive it.",
          requiresOptIn: true
        }, 200);
      } else {
        logger.info("Score ASA recovery not eligible", { walletAddress });

        return c.json({
          success: false,
          asaId: null,
          message: "Not eligible for Score ASA recovery. Check if ban expired, default resolved, and balance >= 0.1 ALGO.",
          requiresOptIn: false
        }, 200);
      }
    } catch (error) {
      // Re-throw known errors
      if (error instanceof UnauthorizedError) {
        throw error;
      }

      logger.error("Score ASA recovery failed", { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });

      return c.json({
        error: {
          code: "RECOVERY_FAILED",
          message: "Failed to recover Score ASA. Please try again later.",
          details: null
        }
      }, 500);
    }
  });
};

/**
 * GET /api/user/purchases
 * 
 * Retrieve all gift card purchases for authenticated user.
 * Returns gift cards with codes, PINs, and purchase details.
 * 
 * Request: None (uses authenticated wallet address)
 * 
 * Response:
 * - purchases: Array of gift card purchase objects
 *   - planId: Plan ID
 *   - productName: Gift card product name
 *   - denomination: Gift card value in INR
 *   - code: Gift card code
 *   - pin: Gift card PIN
 *   - purchasedAt: ISO 8601 timestamp
 *   - expiresAt: ISO 8601 timestamp (if available)
 * 
 * Status Codes:
 * - 200: Success
 * - 401: Unauthorized (missing or invalid token)
 * - 500: Database error
 */
const registerPurchasesRoute = (app: HonoApp): void => {
  app.get("/api/user/purchases", async (c) => {
    try {
      // Resolve authenticated wallet address
      const walletAddress = resolveWalletFromAuth(c);

      logger.info("Retrieving user purchases", { walletAddress });

      // Get all gift card purchases for this wallet
      const purchases = await c.var.ctx.repository.getGiftCardsByWallet(walletAddress);

      logger.info("User purchases retrieved successfully", {
        walletAddress,
        purchaseCount: purchases.length
      });

      return c.json({
        purchases: purchases.map(purchase => ({
          planId: purchase.planId,
          productName: purchase.productName,
          denomination: purchase.denomination,
          code: purchase.code,
          pin: purchase.pin,
          purchasedAt: new Date(purchase.purchasedAtUnix * 1000).toISOString(),
          expiresAt: purchase.expiresAt
        }))
      }, 200);
    } catch (error) {
      // Re-throw known errors
      if (error instanceof UnauthorizedError) {
        throw error;
      }

      logger.error("Failed to retrieve user purchases", { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });

      return c.json({
        error: {
          code: "PURCHASES_RETRIEVAL_FAILED",
          message: "Failed to retrieve purchases. Please try again later.",
          details: null
        }
      }, 500);
    }
  });
};

export const registerUserRoutes = (app: HonoApp): void => {
  registerProfileRoute(app);
  registerCreateScoreASARoute(app);
  registerTransferScoreASARoute(app);
  registerWalletBalanceRoute(app);
  registerAnalyseWalletRoute(app);
  registerDataAccessLogRoute(app);
  registerDeleteUserRoute(app);
  registerRecoverScoreASARoute(app);
  registerPurchasesRoute(app);
  registerUserProfileFetchRoute(app);
  registerUserPlansRoute(app);
};
