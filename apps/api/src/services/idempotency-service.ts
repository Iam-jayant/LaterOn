import { ValidationError } from "../errors";
import { nowUnix } from "../lib/time";
import type { IdempotencyRecord, InMemoryStore } from "./store";

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
}
