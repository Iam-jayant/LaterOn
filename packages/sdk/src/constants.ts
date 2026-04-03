import type { ProtocolAprTable, Tier, TierCaps } from "./types";

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const TIER_CAPS: Record<Tier, TierCaps> = {
  NEW: {
    maxOutstandingInr: 5000,
    maxOrderInr: 2000,
    downPaymentRatio: 0.5
  },
  EMERGING: {
    maxOutstandingInr: 15000,
    maxOrderInr: 7000,
    downPaymentRatio: 0.3
  },
  TRUSTED: {
    maxOutstandingInr: 50000,
    maxOrderInr: 20000,
    downPaymentRatio: 0.15
  }
};

export const DEFAULT_APR_TABLE: ProtocolAprTable = {
  NEW: 18,
  EMERGING: 14,
  TRUSTED: 10
};

export const RISK_POLICY = {
  lateAfterDays: 7,
  defaultAfterDays: 15,
  banWindowDays: 180,
  banDurationDays: 90,
  defaultCountForBan: 2
} as const;

export const USER_SAFE_ERROR_MESSAGE = "Internal error. Please try again.";
