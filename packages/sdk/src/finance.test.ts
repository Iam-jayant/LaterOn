import { describe, expect, it } from "vitest";
import { calculateEmi, toMonthlyRate } from "./finance";

describe("calculateEmi", () => {
  it("returns 0 for zero principal", () => {
    expect(calculateEmi(0, 0.01, 6)).toBe(0);
  });

  it("calculates EMI using standard formula", () => {
    const monthly = toMonthlyRate(18);
    const emi = calculateEmi(1000, monthly, 6);
    expect(emi).toBeGreaterThan(170);
    expect(emi).toBeLessThan(180);
  });

  it("throws for invalid month count", () => {
    expect(() => calculateEmi(1000, 0.01, 0)).toThrow();
  });
});
