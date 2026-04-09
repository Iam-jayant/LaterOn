import type { CheckoutQuote, LiquidityState, PlanRecord, ProtocolAprTable, UserProfile } from "@lateron/sdk";
import { DEFAULT_APR_TABLE } from "@lateron/sdk";

export interface ProtocolParams {
  aprTable: ProtocolAprTable;
  reserveRatio: number;
  paused: boolean;
}

export interface AuthChallenge {
  challengeId: string;
  walletAddress: string;
  message: string;
  expiresAtUnix: number;
  consumed: boolean;
}

export interface SessionTokenPayload {
  walletAddress: string;
  exp: number;
  iat: number;
}

export interface IdempotencyRecord {
  statusCode: number;
  body: unknown;
  createdAtUnix: number;
}

export interface RateLimitWindow {
  windowStartUnix: number;
  count: number;
}

export interface ContractEvent<TPayload = unknown> {
  id: number;
  type: string;
  payload: TPayload;
  occurredAtUnix: number;
}

export class InMemoryStore {
  public readonly users = new Map<string, UserProfile>();
  public readonly plans = new Map<string, PlanRecord>();
  public readonly quotes = new Map<string, CheckoutQuote>();
  public readonly events: ContractEvent[] = [];
  public readonly authChallenges = new Map<string, AuthChallenge>();
  public readonly idempotency = new Map<string, IdempotencyRecord>();
  public readonly rateLimitWindows = new Map<string, RateLimitWindow>();

  public protocolParams: ProtocolParams = {
    aprTable: { ...DEFAULT_APR_TABLE },
    reserveRatio: 0.05,
    paused: false
  };

  public liquidity: LiquidityState = {
    totalDepositsAlgo: 1000, // Initial test liquidity
    totalLentAlgo: 0,
    reserveAlgo: 0,
    availableAlgo: 1000 // Initial test liquidity for marketplace testing
  };

  private eventId = 1;

  public nextEventId(): number {
    const id = this.eventId;
    this.eventId += 1;
    return id;
  }
}
