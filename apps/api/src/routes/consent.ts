import type { Hono } from "hono";
import { z } from "zod";
import { ValidationError } from "../errors.js";
import { logger } from "../lib/logger.js";
import type { AppContext } from "../app-context.js";

type HonoApp = Hono<{ Variables: { ctx: AppContext } }>;

/**
 * Consent API Routes
 * 
 * Implements DPDP Act 2023 compliant consent management:
 * 1. POST /api/consent/save - Save consent record with transaction ID
 * 2. GET /api/consent/check - Check if user has given consent
 * 
 * Requirements: 3.1-3.7, 19.7
 */

/**
 * GET /api/consent/check
 * 
 * Check if authenticated user has given consent for a specific purpose.
 * Returns consent status, transaction ID, and timestamp.
 * 
 * Request: None (uses authenticated wallet address from Bearer token)
 * 
 * Response:
 * - hasConsent: boolean indicating if consent exists
 * - txnId: Algorand transaction ID (null if no consent)
 * - consentTimestamp: ISO 8601 timestamp (null if no consent)
 * 
 * Status Codes:
 * - 200: Success
 * - 401: Unauthorized (missing or invalid token)
 * - 500: Database error
 */
const registerCheckConsentRoute = (app: HonoApp): void => {
  app.get("/api/consent/check", async (c) => {
    try {
      // Extract wallet address from Bearer token
      const authHeader = c.req.header("authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return c.json({
          error: {
            code: "UNAUTHORIZED",
            message: "Missing Bearer token",
            details: null
          }
        }, 401);
      }

      const token = authHeader.slice("Bearer ".length).trim();
      const payload = c.var.ctx.authService.verifyToken(token, c.var.ctx.config.authTokenSecret);
      const walletAddress = payload.walletAddress;

      logger.info("Checking consent", { walletAddress });

      // Check consent using ConsentService
      const hasConsent = await c.var.ctx.consentService.hasConsent(walletAddress, 'credit_scoring');
      
      // Get consent record details if it exists
      let txnId: string | null = null;
      let consentTimestamp: string | null = null;
      
      if (hasConsent) {
        // Query consent record directly for transaction details
        // Note: ConsentService doesn't expose getConsent method, so we need to add it or query directly
        // For now, we'll use a workaround - this should be refactored to use ConsentService
        try {
          const result = await (c.var.ctx.repository as any).pool.query(
            `SELECT txn_id, consent_timestamp FROM consent_records 
             WHERE wallet_address = $1 AND purpose = $2`,
            [walletAddress, 'credit_scoring']
          );
          
          if (result.rows.length > 0) {
            txnId = result.rows[0].txn_id;
            consentTimestamp = result.rows[0].consent_timestamp;
          }
        } catch (err) {
          logger.error("Failed to fetch consent details", { error: err });
        }
      }

      logger.info("Consent check completed", { walletAddress, hasConsent });

      return c.json({
        hasConsent,
        txnId,
        consentTimestamp: consentTimestamp ? new Date(consentTimestamp).toISOString() : null
      }, 200);
    } catch (error) {
      logger.error("Failed to check consent", { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });

      return c.json({
        error: {
          code: "CONSENT_CHECK_FAILED",
          message: "Failed to check consent. Please try again later.",
          details: null
        }
      }, 500);
    }
  });
};

/**
 * POST /api/consent/save
 * 
 * Save a consent record to the database after on-chain consent transaction.
 * No authentication required for first-time users.
 * 
 * Request body:
 * - walletAddress: User's Algorand wallet address
 * - purpose: Consent purpose (e.g., "credit_scoring")
 * - txnId: Algorand transaction ID of consent transaction
 * 
 * Response:
 * - success: true
 * - consentId: Database ID of created consent record
 * 
 * Status Codes:
 * - 200: Success
 * - 400: Invalid request
 * - 500: Database error
 * 
 * Validates:
 * - Requirement 3.1: Create consent record in database
 * - Requirement 3.2: Include wallet_address field
 * - Requirement 3.3: Include purpose field
 * - Requirement 3.5: Include txn_id field
 * - Requirement 3.6: Include ip_hash field
 * - Requirement 19.7: Save consent record after transaction confirmation
 */
const saveConsentSchema = z.object({
  walletAddress: z.string().min(8),
  purpose: z.string().min(1),
  txnId: z.string().min(8)
});

const registerSaveConsentRoute = (app: HonoApp): void => {
  app.post("/api/consent/save", async (c) => {
    const body = await c.req.json();
    const payload = saveConsentSchema.safeParse(body);
    if (!payload.success) {
      logger.error("Invalid consent save request", { 
        error: payload.error,
        body
      });
      throw new ValidationError("Invalid consent save request", payload.error);
    }

    try {
      // Extract IP address from headers (Requirement 3.6)
      const ipAddress = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";

      logger.info("Saving consent record", {
        walletAddress: payload.data.walletAddress,
        purpose: payload.data.purpose,
        txnId: payload.data.txnId
      });

      // Save consent record using ConsentService
      const result = await c.var.ctx.consentService.saveConsent({
        walletAddress: payload.data.walletAddress,
        purpose: payload.data.purpose,
        txnId: payload.data.txnId,
        ipAddress
      });

      logger.info("Consent record saved successfully", {
        consentId: result.consentId,
        walletAddress: payload.data.walletAddress
      });

      return c.json({
        success: true,
        consentId: result.consentId
      }, 200);
    } catch (error) {
      logger.error("Failed to save consent record", { 
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        walletAddress: payload.data.walletAddress
      });

      // Check for Supabase-specific errors
      if (typeof error === 'object' && error !== null) {
        const supabaseError = error as any;
        logger.error("Supabase error details", {
          code: supabaseError.code,
          message: supabaseError.message,
          details: supabaseError.details,
          hint: supabaseError.hint
        });

        // Check for unique constraint violation (duplicate consent)
        // Supabase error code for unique violation is '23505'
        if (supabaseError.code === '23505' || 
            (supabaseError.message && supabaseError.message.includes('unique_wallet_purpose'))) {
          return c.json({
            success: true,
            consentId: -1, // Indicate existing consent
            message: "Consent already exists"
          }, 200);
        }
      }

      // Check for standard Error with unique constraint message
      if (error instanceof Error && error.message.includes("unique constraint")) {
        return c.json({
          success: true,
          consentId: -1,
          message: "Consent already exists"
        }, 200);
      }

      return c.json({
        error: {
          code: "CONSENT_SAVE_FAILED",
          message: "Failed to save consent record. Please try again later.",
          details: null
        }
      }, 500);
    }
  });
};

export const registerConsentRoutes = (app: HonoApp): void => {
  registerCheckConsentRoute(app);
  registerSaveConsentRoute(app);
};
