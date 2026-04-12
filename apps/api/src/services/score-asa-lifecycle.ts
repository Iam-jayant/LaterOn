import type { PostgresRepository } from "../db/postgres-repository.js";
import type { ScoreASAService } from "./score-asa-service.js";
import { logger } from "../lib/logger.js";

/**
 * ScoreASALifecycleService manages Score ASA lifecycle events:
 * - Metadata updates when scores change
 * - Clawbacks on default or ban
 * - Recovery/re-minting after ban expiry or default resolution
 * 
 * Requirements: 16.1-16.6, 17.1-17.4, 18.1-18.4, 28.1-28.7
 */
export class ScoreASALifecycleService {
  constructor(
    private readonly repository: PostgresRepository,
    private readonly scoreASAService: ScoreASAService
  ) {}

  /**
   * Update Score ASA metadata when later_on_score changes.
   * Called after score recalculation.
   * 
   * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6
   * 
   * @param walletAddress - User's wallet address
   * @param newScore - Updated credit score
   * @param newTier - Updated tier
   */
  async updateScoreASAMetadata(params: {
    walletAddress: string;
    newScore: number;
    newTier: string;
  }): Promise<void> {
    try {
      logger.info("Updating Score ASA metadata", {
        walletAddress: params.walletAddress,
        newScore: params.newScore,
        newTier: params.newTier
      });

      // Get user to retrieve score_asa_id
      const user = await this.repository.getUser(params.walletAddress);
      if (!user) {
        logger.warn("User not found for Score ASA metadata update", {
          walletAddress: params.walletAddress
        });
        return;
      }

      // Check if user has a Score ASA
      const scoreAsaId = (user as any).scoreAsaId;
      if (!scoreAsaId) {
        logger.info("User does not have Score ASA, skipping metadata update", {
          walletAddress: params.walletAddress
        });
        return;
      }

      // Update ASA metadata (Requirement 16.2, 16.3, 16.4, 16.5)
      const txId = await this.scoreASAService.updateASAMetadata({
        asaId: scoreAsaId,
        score: params.newScore,
        tier: params.newTier
      });

      logger.info("Score ASA metadata updated successfully", {
        walletAddress: params.walletAddress,
        asaId: scoreAsaId,
        txId,
        newScore: params.newScore,
        newTier: params.newTier
      });
    } catch (error) {
      // Log error but don't throw - graceful degradation (Requirement 16.6)
      logger.error("Failed to update Score ASA metadata", {
        walletAddress: params.walletAddress,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  }

  /**
   * Clawback Score ASA from user on payment plan default.
   * Called when payment plan status changes to DEFAULTED.
   * 
   * Requirements: 17.1, 17.2, 17.3, 17.4
   * 
   * @param walletAddress - User's wallet address
   */
  async clawbackOnDefault(walletAddress: string): Promise<void> {
    try {
      logger.info("Clawing back Score ASA on default", { walletAddress });

      // Get user to retrieve score_asa_id
      const user = await this.repository.getUser(walletAddress);
      if (!user) {
        logger.warn("User not found for Score ASA clawback", { walletAddress });
        return;
      }

      // Check if user has a Score ASA
      const scoreAsaId = (user as any).scoreAsaId;
      if (!scoreAsaId) {
        logger.info("User does not have Score ASA, skipping clawback", { walletAddress });
        return;
      }

      // Clawback ASA (Requirement 17.2)
      const txId = await this.scoreASAService.clawbackASA({
        asaId: scoreAsaId,
        fromAddress: walletAddress
      });

      logger.info("Score ASA clawed back successfully on default", {
        walletAddress,
        asaId: scoreAsaId,
        txId
      });

      // Note: score_asa_id is set to NULL by ScoreASAService.clawbackASA (Requirement 17.3)
    } catch (error) {
      // Log error but don't throw - graceful degradation (Requirement 17.4)
      logger.error("Failed to clawback Score ASA on default", {
        walletAddress,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  }

  /**
   * Clawback Score ASA from user when banned.
   * Called when user's bannedUntilUnix is set.
   * 
   * Requirements: 18.1, 18.2, 18.3, 18.4
   * 
   * @param walletAddress - User's wallet address
   */
  async clawbackOnBan(walletAddress: string): Promise<void> {
    try {
      logger.info("Clawing back Score ASA on ban", { walletAddress });

      // Get user to retrieve score_asa_id
      const user = await this.repository.getUser(walletAddress);
      if (!user) {
        logger.warn("User not found for Score ASA clawback", { walletAddress });
        return;
      }

      // Check if user has a Score ASA
      const scoreAsaId = (user as any).scoreAsaId;
      if (!scoreAsaId) {
        logger.info("User does not have Score ASA, skipping clawback", { walletAddress });
        return;
      }

      // Clawback ASA (Requirement 18.2)
      const txId = await this.scoreASAService.clawbackASA({
        asaId: scoreAsaId,
        fromAddress: walletAddress
      });

      logger.info("Score ASA clawed back successfully on ban", {
        walletAddress,
        asaId: scoreAsaId,
        txId
      });

      // Note: score_asa_id is set to NULL by ScoreASAService.clawbackASA (Requirement 18.3)
    } catch (error) {
      // Log error but don't throw - graceful degradation (Requirement 18.4)
      logger.error("Failed to clawback Score ASA on ban", {
        walletAddress,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  }

  /**
   * Re-mint Score ASA for users who had it clawed back.
   * Called when ban expires or default is resolved.
   * 
   * Requirements: 28.1, 28.2, 28.3, 28.4, 28.5, 28.6, 28.7
   * 
   * @param walletAddress - User's wallet address
   * @returns ASA ID if created, null if skipped
   */
  async recoverScoreASA(walletAddress: string): Promise<number | null> {
    try {
      logger.info("Attempting Score ASA recovery", { walletAddress });

      // Get user
      const user = await this.repository.getUser(walletAddress);
      if (!user) {
        logger.warn("User not found for Score ASA recovery", { walletAddress });
        return null;
      }

      // Check if user already has a Score ASA (Requirement 28.6)
      const scoreAsaId = (user as any).scoreAsaId;
      if (scoreAsaId) {
        logger.info("User already has Score ASA, skipping recovery", {
          walletAddress,
          existingAsaId: scoreAsaId
        });
        return null;
      }

      // Check if ban has expired (Requirement 28.2)
      const bannedUntilUnix = (user as any).bannedUntilUnix;
      const currentUnix = Math.floor(Date.now() / 1000);
      if (bannedUntilUnix && bannedUntilUnix > currentUnix) {
        logger.info("User is still banned, cannot recover Score ASA", {
          walletAddress,
          bannedUntilUnix,
          currentUnix
        });
        return null;
      }

      // Check if user has sufficient balance (Requirement 28.4)
      const balance = await this.scoreASAService.checkUserBalance(walletAddress);
      if (balance < 0.1) {
        logger.warn("User has insufficient balance for Score ASA recovery", {
          walletAddress,
          balance,
          required: 0.1
        });
        return null;
      }

      // Create new Score ASA with current score and tier (Requirement 28.5)
      const asaId = await this.scoreASAService.createScoreASA({
        walletAddress,
        score: user.laterOnScore,
        tier: user.tier
      });

      logger.info("Score ASA created for recovery", {
        walletAddress,
        asaId,
        score: user.laterOnScore,
        tier: user.tier
      });

      // Note: User needs to opt-in and then we transfer (Requirement 28.4)
      // This is handled by the frontend flow

      return asaId;
    } catch (error) {
      logger.error("Failed to recover Score ASA", {
        walletAddress,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      return null;
    }
  }
}
