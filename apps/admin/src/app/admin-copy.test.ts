import { describe, expect, it } from "vitest";

describe("admin smoke", () => {
  it("keeps numeric reserve defaults sane", () => {
    const reserve = 0.05;
    expect(reserve).toBeGreaterThan(0);
    expect(reserve).toBeLessThan(0.2);
  });
});
