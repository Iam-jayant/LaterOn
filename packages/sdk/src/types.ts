export type Tier = "NEW" | "EMERGING" | "TRUSTED";

export type PlanStatus = "ACTIVE" | "COMPLETED" | "LATE" | "DEFAULTED" | "CANCELLED";

export type CurrencyDisplayMode = "INR" | "ALGO";

export interface TierCaps {
  maxOutstandingInr: number;
  maxOrderInr: number;
  downPaymentRatio: number;
}

export interface ProtocolAprTable {
  NEW: number;
  EMERGING: number;
  TRUSTED: number;
}

export interface UserProfile {
  walletAddress: string;
  tier: Tier;
  completedPlans: number;
  defaults: number;
  latePayments: number;
  activeOutstandingInr: number;
  bannedUntilUnix?: number;
}

export interface CheckoutQuote {
  quoteId: string;
  walletAddress: string;
  merchantId: string;
  orderAmountInr: number;
  financedAmountInr: number;
  orderAmountAlgo: number;
  upfrontAmountAlgo: number;
  financedAmountAlgo: number;
  installmentAmountAlgo: number;
  tenureMonths: number;
  monthlyRate: number;
  expiresAtUnix: number;
  signature: string;
}

export interface RepaymentScheduleItem {
  installmentNumber: number;
  dueAtUnix: number;
  amountAlgo: number;
}

export interface PlanRecord {
  planId: string;
  walletAddress: string;
  merchantId: string;
  status: PlanStatus;
  tierAtApproval: Tier;
  tenureMonths: number;
  aprPercent: number;
  createdAtUnix: number;
  nextDueAtUnix: number;
  financedAmountInr: number;
  financedAmountAlgo: number;
  remainingAmountAlgo: number;
  installmentsPaid: number;
  installments: RepaymentScheduleItem[];
}

export interface LiquidityState {
  totalDepositsAlgo: number;
  totalLentAlgo: number;
  reserveAlgo: number;
  availableAlgo: number;
}

export interface RiskTransitionResult {
  nextStatus: PlanStatus;
  isLateTransition: boolean;
  isDefaultTransition: boolean;
}
