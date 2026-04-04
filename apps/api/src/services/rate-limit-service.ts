import { TooManyRequestsError } from "../errors";
import { nowUnix } from "../lib/time";
import type { InMemoryStore } from "./store";

export class RateLimitService {
  public constructor(private readonly store: InMemoryStore) {}

  public checkOrThrow(identity: string, limitPerMinute: number): void {
    if (limitPerMinute <= 0) {
      return;
    }

    const currentUnix = nowUnix();
    const minuteWindowStart = currentUnix - (currentUnix % 60);
    const existing = this.store.rateLimitWindows.get(identity);

    if (!existing || existing.windowStartUnix !== minuteWindowStart) {
      this.store.rateLimitWindows.set(identity, {
        windowStartUnix: minuteWindowStart,
        count: 1
      });
      return;
    }

    existing.count += 1;
    this.store.rateLimitWindows.set(identity, existing);
    if (existing.count > limitPerMinute) {
      throw new TooManyRequestsError("Too many requests. Please retry in a minute.");
    }
  }
}
