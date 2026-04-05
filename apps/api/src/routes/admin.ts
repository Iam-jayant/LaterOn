import type { Hono } from "hono";
import { nowUnix } from "../lib/time.js";
import { logger } from "../lib/logger.js";
import type { AppContext } from "../app-context.js";

type HonoApp = Hono<{ Variables: { ctx: AppContext } }>;

/**
 * Admin API Routes
 * 
 * Implements manual risk keeper and health check endpoints:
 * 1. POST /api/admin/risk-keeper/run - Query ACTIVE and LATE plans, call settle_risk for overdue plans
 * 2. GET /api/health - Return 200 when database connection is healthy
 * 
 * Requirements: 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 8.4
 */

interface RiskTransition {
  planId: string;
  oldStatus: string;
  newStatus: string;
  walletAddress: string;
}

/**
 * POST /api/admin/risk-keeper/run
 * 
 * Manual risk keeper execution:
 * - Query all ACTIVE and LATE plans from PostgreSQL
 * - For each plan, check if overdue
 * - 7+ days overdue → transition to LATE
 * - 15+ days overdue → transition to DEFAULTED
 * - Update plan status in PostgreSQL after settlement
 * 
 * Response:
 * - processed: Number of plans processed
 * - transitions: Array of status transitions made
 * - errors: Array of plans that failed to settle
 * 
 * Validates:
 * - Requirement 6.3: Query ACTIVE and LATE plans
 * - Requirement 6.4: Compare next due date with current timestamp
 * - Requirement 6.5: Transition to LATE when overdue by 7+ days
 * - Requirement 6.6: Transition to DEFAULTED when overdue by 15+ days
 * - Requirement 6.7: Update plan status in PostgreSQL
 * - Requirement 6.8: Display results showing plans processed and transitions made
 */
export const registerAdminRoutes = (app: HonoApp): void => {
  app.post("/api/admin/risk-keeper/run", async (c) => {
    const currentUnix = nowUnix();
    const transitions: RiskTransition[] = [];
    const errors: Array<{ planId: string; error: string }> = [];
    let processed = 0;

    try {
      // Query all ACTIVE and LATE plans (Requirements 6.3, 6.4)
      const plans = await c.var.ctx.repository.getActivePlans();
      
      logger.info(`Risk keeper processing ${plans.length} active/late plans`);

      // Process each plan
      for (const plan of plans) {
        processed++;
        
        try {
          const previousStatus = plan.status;
          
          // Calculate days overdue
          const daysOverdue = (currentUnix - plan.nextDueAtUnix) / (24 * 60 * 60);
          
          // Determine if risk settlement is needed
          let shouldSettle = false;
          let expectedStatus = previousStatus;
          
          // Risk transition logic (Requirements 6.5, 6.6)
          if (daysOverdue >= 15) {
            // 15+ days overdue → DEFAULTED
            shouldSettle = true;
            expectedStatus = "DEFAULTED";
          } else if (daysOverdue >= 7) {
            // 7+ days overdue → LATE
            shouldSettle = true;
            expectedStatus = "LATE";
          }
          
          // Only settle if status should change
          if (shouldSettle && previousStatus !== expectedStatus) {
            // Call settle_risk through ContractGateway (Requirement 6.7)
            const updatedPlan = await c.var.ctx.gateway.settleRisk(plan.planId, currentUnix);
            
            // Log the transition
            logger.info("Risk settlement completed", {
              planId: plan.planId,
              walletAddress: plan.walletAddress,
              previousStatus,
              newStatus: updatedPlan.status,
              daysOverdue: Math.floor(daysOverdue),
            });
            
            // Record transition (Requirement 6.8)
            transitions.push({
              planId: plan.planId,
              oldStatus: previousStatus,
              newStatus: updatedPlan.status,
              walletAddress: plan.walletAddress,
            });
          }
        } catch (error) {
          // Handle individual plan errors gracefully (Requirement 6.10)
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          logger.error("Failed to settle risk for plan", {
            planId: plan.planId,
            error: errorMessage,
          });
          
          errors.push({
            planId: plan.planId,
            error: errorMessage,
          });
        }
      }

      // Return results (Requirement 6.8)
      return c.json({
        success: true,
        processed,
        transitions,
        errors: errors.length > 0 ? errors : undefined,
      }, 200);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Risk keeper execution failed", { error: errorMessage });
      
      return c.json({
        success: false,
        error: errorMessage,
        processed,
        transitions,
      }, 500);
    }
  });

  /**
   * GET /api/health
   * 
   * Health check endpoint for monitoring.
   * Returns 200 when database connection is healthy.
   * 
   * Response:
   * - status: "ok" when healthy
   * - database: "connected" when database is accessible
   * - timestamp: Current Unix timestamp
   * 
 * Validates:
   * - Requirement 8.4: Health check endpoint for monitoring
   */
  app.get("/api/health", async (c) => {
    try {
      // Test database connection
      await c.var.ctx.repository.healthCheck();
      
      return c.json({
        status: "ok",
        database: "connected",
        timestamp: nowUnix(),
      }, 200);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Health check failed", { error: errorMessage });
      
      return c.json({
        status: "unhealthy",
        database: "disconnected",
        error: errorMessage,
        timestamp: nowUnix(),
      }, 503);
    }
  });
};
