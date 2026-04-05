import { RISK_POLICY, SCORE_POLICY } from "./constants";
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

/**
 * Update LaterOn Score for on-time installment payment.
 * Increases score by SCORE_POLICY.onTimePaymentIncrease.
 * 
 * @param profile - User profile to update
 * @returns Updated profile with increased score
 */
export const applyOnTimePaymentScoreIncrease = (profile: UserProfile): UserProfile => {
  const newScore = Math.min(
    profile.laterOnScore + SCORE_POLICY.onTimePaymentIncrease,
    SCORE_POLICY.maxScore
  );
  
  return {
    ...profile,
    laterOnScore: newScore
  };
};

/**
 * Apply completion bonus to LaterOn Score when all installments are paid.
 * Increases score by SCORE_POLICY.completionBonus.
 * 
 * @param profile - User profile to update
 * @returns Updated profile with completion bonus applied
 */
export const applyCompletionBonus = (profile: UserProfile): UserProfile => {
  const newScore = Math.min(
    profile.laterOnScore + SCORE_POLICY.completionBonus,
    SCORE_POLICY.maxScore
  );
  
  return {
    ...profile,
    laterOnScore: newScore
  };
};

/**
 * Decrease LaterOn Score for overdue installment.
 * Decreases score by SCORE_POLICY.overdueDecrease.
 * 
 * @param profile - User profile to update
 * @returns Updated profile with decreased score
 */
export const applyOverdueScoreDecrease = (profile: UserProfile): UserProfile => {
  const newScore = Math.max(
    profile.laterOnScore - SCORE_POLICY.overdueDecrease,
    SCORE_POLICY.minScore
  );
  
  return {
    ...profile,
    laterOnScore: newScore
  };
};
