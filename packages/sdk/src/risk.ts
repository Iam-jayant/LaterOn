import { RISK_POLICY } from "./constants";
import type { PlanRecord, PlanStatus, RiskTransitionResult, UserProfile } from "./types";

export const determineTier = (profile: UserProfile): UserProfile["tier"] => {
  if (profile.completedPlans >= 5 && profile.defaults === 0 && profile.latePayments <= 1) {
    return "TRUSTED";
  }

  if (profile.completedPlans >= 2 && profile.defaults === 0) {
    return "EMERGING";
  }

  return "NEW";
};

export const deriveRiskStatus = (plan: Pick<PlanRecord, "status" | "nextDueAtUnix">, nowUnix: number): RiskTransitionResult => {
  if (plan.status === "COMPLETED" || plan.status === "DEFAULTED" || plan.status === "CANCELLED") {
    return {
      nextStatus: plan.status,
      isLateTransition: false,
      isDefaultTransition: false
    };
  }

  const overdueSeconds = nowUnix - plan.nextDueAtUnix;
  const lateThreshold = RISK_POLICY.lateAfterDays * 24 * 60 * 60;
  const defaultThreshold = RISK_POLICY.defaultAfterDays * 24 * 60 * 60;

  if (overdueSeconds >= defaultThreshold) {
    return {
      nextStatus: "DEFAULTED",
      isLateTransition: false,
      isDefaultTransition: true
    };
  }

  if (overdueSeconds >= lateThreshold) {
    return {
      nextStatus: "LATE",
      isLateTransition: plan.status !== "LATE",
      isDefaultTransition: false
    };
  }

  return {
    nextStatus: "ACTIVE",
    isLateTransition: false,
    isDefaultTransition: false
  };
};

export const applyRiskOutcomeToProfile = (
  profile: UserProfile,
  previousStatus: PlanStatus,
  nextStatus: PlanStatus,
  nowUnix: number
): UserProfile => {
  const updated: UserProfile = { ...profile };

  if (previousStatus !== "LATE" && nextStatus === "LATE") {
    updated.latePayments += 1;
  }

  if (previousStatus !== "DEFAULTED" && nextStatus === "DEFAULTED") {
    updated.defaults += 1;
    updated.tier = "NEW";

    if (updated.defaults >= RISK_POLICY.defaultCountForBan) {
      const banDuration = RISK_POLICY.banDurationDays * 24 * 60 * 60;
      updated.bannedUntilUnix = nowUnix + banDuration;
    }
  } else {
    updated.tier = determineTier(updated);
  }

  return updated;
};
