import { createHash } from "node:crypto";
import type { PostgresRepository } from "../db/postgres-repository.js";

export interface ConsentRecord {
  id: number;
  walletAddress: string;
  purpose: string;
  consentTimestamp: number;
  txnId: string;
  ipHash: string;
  createdAt: Date;
}

export interface DataAccessLog {
  id: number;
  walletAddress: string;
  operation: string;
  accessedBy: string;
  accessedAt: Date;
}

/**
 * ConsentService manages DPDP Act 2023 compliant consent records and data access logging.
 * 
 * Responsibilities:
 * - Store consent records with on-chain transaction IDs
 * - Hash IP addresses for privacy-preserving audit trails
 * - Log all data access operations for user transparency
 * - Handle right to erasure (DPDP Act requirement)
 */
export class ConsentService {
  constructor(
    private readonly repository: PostgresRepository,
    private readonly ipHashSalt: string
  ) {}

  /**
   * Save a consent record to the database.
   * Hashes the IP address using SHA-256 with salt for privacy.
   * 
   * @param params - Consent parameters including wallet address, purpose, transaction ID, and IP
   * @returns The created consent record ID
   */
  async saveConsent(params: {
    walletAddress: string;
    purpose: string;
    txnId: string;
    ipAddress: string;
  }): Promise<{ consentId: number }> {
    const ipHash = this.hashIpAddress(params.ipAddress);
    const consentTimestamp = Math.floor(Date.now() / 1000);

    const result = await this.repository.saveConsentRecord({
      walletAddress: params.walletAddress,
      purpose: params.purpose,
      consentTimestamp,
      txnId: params.txnId,
      ipHash,
    });

    return { consentId: result.id };
  }

  /**
   * Check if a valid consent record exists for a wallet and purpose.
   * 
   * @param walletAddress - Algorand wallet address
   * @param purpose - Consent purpose (e.g., "credit_scoring")
   * @returns True if consent exists, false otherwise
   */
  async hasConsent(walletAddress: string, purpose: string): Promise<boolean> {
    return await this.repository.getConsentRecord(walletAddress, purpose);
  }

  /**
   * Log a data access operation for audit trail.
   * Creates a timestamped record of who accessed what data.
   * 
   * @param params - Data access parameters including wallet, operation, and accessor
   */
  async logDataAccess(params: {
    walletAddress: string;
    operation: string;
    accessedBy: string;
  }): Promise<void> {
    await this.repository.insertDataAccessLog({
      walletAddress: params.walletAddress,
      operation: params.operation,
      accessedBy: params.accessedBy,
    });
  }

  /**
   * Retrieve all data access logs for a wallet address.
   * Returns logs ordered by accessed_at DESC (most recent first).
   * 
   * @param walletAddress - Algorand wallet address
   * @returns Array of data access log entries
   */
  async getDataAccessLog(walletAddress: string): Promise<DataAccessLog[]> {
    return await this.repository.getDataAccessLogs(walletAddress);
  }

  /**
   * Delete all user data for DPDP right to erasure.
   * Deletes user record, consent records, and data access logs.
   * Marks payment plans as DELETED for audit purposes (does not delete).
   * 
   * @param walletAddress - Algorand wallet address
   */
  async deleteUserData(walletAddress: string): Promise<void> {
    await this.repository.deleteUserData(walletAddress);
  }

  /**
   * Hash an IP address using SHA-256 with salt.
   * Provides privacy-preserving audit trail without storing raw IPs.
   * 
   * @param ip - IP address to hash
   * @returns SHA-256 hash of IP + salt
   */
  private hashIpAddress(ip: string): string {
    return createHash("sha256")
      .update(ip + this.ipHashSalt)
      .digest("hex");
  }
}
