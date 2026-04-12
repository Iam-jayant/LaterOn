import type { ContractGateway } from "./contract-gateway.js";
import type { ScoreASALifecycleService } from "./score-asa-lifecycle.js";
import type { PostgresRepository } from "../db/postgres-repository.js";
import { logger } from "../lib/logger.js";

/**
 * Event handlers for Score ASA lifecycle management.
 * Listens to ContractGateway events and triggers appropriate ASA operations.
 * 
 * Requirements: 16.1, 17.1, 18.1
 */
export class ScoreASAEventHandlers {
  constructor(
    private readonly gateway: ContractGateway,
    private readonly lifecycleService: ScoreASALifecycleService,
    private readonly repository: PostgresRepository
  ) {}

  /**
   * Initialize event listeners.
   * Sets up handlers for risk.settled events to trigger clawbacks.
   * 
   * Note: Event handling is currently done inline in ContractGateway.syncRisk()
   * via direct calls to scoreASALifecycleService. This method is kept for
   * future event-driven architecture migration.
   */
  initialize(): void {
    // Event handling is currently done inline in ContractGateway
    // Future: Implement proper event emitter pattern in ContractGateway
    logger.info("Score ASA event handlers initialized (inline mode)");
  }

  /**
   * Handle risk.settled event.
   * Triggers clawback when status changes to DEFAULTED.
   * 
   * Requirements: 17.1, 17.2, 17.3, 17.4
   */
  private async handleRiskSettled(event: {
    planId: string;
    previousStatus: string;
    nextStatus: string;
    walletAddress: string;
    chainTx?: any;
  }): Promise<void> {
    try {
      logger.info("Handling risk.settled event", {
        planId: event.planId,
        previousStatus: event.previousStatus,
        nextStatus: event.nextStatus,
        walletAddress: event.walletAddress
      });

      // Check if status changed to DEFAULTED (Requirement 17.1)
      if (event.nextStatus === "DEFAULTED" && event.previousStatus !== "DEFAULTED") {
        logger.info("Payment plan defaulted, triggering Score ASA clawback", {
          planId: event.planId,
          walletAddress: event.walletAddress
        });

        // Trigger clawback (Requirements 17.2, 17.3, 17.4)
        await this.lifecycleService.clawbackOnDefault(event.walletAddress);
      }
    } catch (error) {
      // Log error but don't throw - event handlers should not block
      logger.error("Failed to handle risk.settled event", {
        event,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  }

  /**
   * Handle user ban event.
   * Triggers clawback when user is banned.
   * 
   * Requirements: 18.1, 18.2, 18.3, 18.4
   * 
   * Note: This should be called when bannedUntilUnix is set in the user profile.
   */
  async handleUserBanned(walletAddress: string): Promise<void> {
    try {
      logger.info("User banned, triggering Score ASA clawback", { walletAddress });

      // Trigger clawback (Requirements 18.2, 18.3, 18.4)
      await this.lifecycleService.clawbackOnBan(walletAddress);
    } catch (error) {
      // Log error but don't throw
      logger.error("Failed to handle user ban", {
        walletAddress,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  }

  /**
   * Handle score update event.
   * Triggers metadata update when later_on_score changes.
   * 
   * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6
   * 
   * Note: This should be called after score recalculation.
   */
  async handleScoreUpdated(params: {
    walletAddress: string;
    newScore: number;
    newTier: string;
  }): Promise<void> {
    try {
      logger.info("Score updated, triggering Score ASA metadata update", params);

      // Trigger metadata update (Requirements 16.1-16.6)
      await this.lifecycleService.updateScoreASAMetadata(params);
    } catch (error) {
      // Log error but don't throw
      logger.error("Failed to handle score update", {
        params,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  }
}
