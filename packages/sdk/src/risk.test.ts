import { describe, expect, it } from "vitest";
import { applyRiskOutcomeToProfile, deriveRiskStatus, determineTier } from "./risk";
import type { UserProfile } from "./types";

const baseProfile: UserProfile = {
  walletAddress: "TEST",
  tier: "NEW",
  completedPlans: 0,
  defaults: 0,
  latePayments: 0,
  activeOutstandingInr: 0
};

describe("risk helpers", () => {
  it("computes tier transitions", () => {
    expect(
      determineTier({
        ...baseProfile,
        completedPlans: 5
      })
    ).toBe("TRUSTED");
  });

  it("marks plan late after threshold", () => {
    const result = deriveRiskStatus(
      {
        status: "ACTIVE",
        nextDueAtUnix: 1_700_000_000
      },
      1_700_000_000 + 8 * 24 * 60 * 60
    );

    expect(result.nextStatus).toBe("LATE");
    expect(result.isLateTransition).toBe(true);
  });

  it("increments default count and sets NEW tier", () => {
    const result = applyRiskOutcomeToProfile(baseProfile, "LATE", "DEFAULTED", 1_700_000_000);
    expect(result.defaults).toBe(1);
    expect(result.tier).toBe("NEW");
  });
});
