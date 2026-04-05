import { ValidationError } from "../errors";
import { nowUnix } from "../lib/time";
import type { IdempotencyRecord, InMemoryStore } from "./store";

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60; // 24 hours

export class IdempotencyService {
  public constructor(private readonly store: InMemoryStore) {}

  public getOrThrow(key: string): IdempotencyRecord | undefined {
    if (!key || key.trim().length < 8) {
      throw new ValidationError("x-idempotency-key header is required and must be at least 8 chars");
    }
    return this.store.idempotency.get(key);
  }

  public save(key: string, record: Omit<IdempotencyRecord, "createdAtUnix">): void {
    this.store.idempotency.set(key, {
      ...record,
      createdAtUnix: nowUnix()
    });
  }

  /**
   * Generate an idempotency key for marketplace checkout requests
   * @param walletAddress - User's wallet address
   * @param quoteId - Quote ID for the purchase
   * @returns Idempotency key string
   */
  public generateMarketplaceKey(walletAddress: string, quoteId: string): string {
    return `marketplace:${walletAddress}:${quoteId}`;
  }

  /**
   * Check if a request is a duplicate based on idempotency key
   * Returns the cached response if found and not expired
   * @param key - Idempotency key
   * @returns Cached response or undefined if not found or expired
   */
  public checkDuplicate(key: string): IdempotencyRecord | undefined {
    const record = this.store.idempotency.get(key);
    
    if (!record) {
      return undefined;
    }

    // Check if record has expired (24-hour TTL)
    const now = nowUnix();
    if (now - record.createdAtUnix > IDEMPOTENCY_TTL_SECONDS) {
      // Clean up expired record
      this.store.idempotency.delete(key);
      return undefined;
    }

    return record;
  }

  /**
   * Clean up expired idempotency records
   * Should be called periodically to prevent memory leaks
   */
  public cleanupExpired(): number {
    const now = nowUnix();
    let cleanedCount = 0;

    for (const [key, record] of this.store.idempotency.entries()) {
      if (now - record.createdAtUnix > IDEMPOTENCY_TTL_SECONDS) {
        this.store.idempotency.delete(key);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }
}
