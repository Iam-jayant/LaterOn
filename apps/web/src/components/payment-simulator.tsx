"use client";

import { calculateEmi, getDownPaymentRatioForTier, toMonthlyRate, type Tier } from "@lateron/sdk";
import { useMemo, useState } from "react";

const tierLabels: Record<Tier, string> = {
  NEW: "New",
  EMERGING: "Emerging",
  TRUSTED: "Trusted"
};

const aprByTier: Record<Tier, number> = {
  NEW: 18,
  EMERGING: 14,
  TRUSTED: 10
};

export const PaymentSimulator = () => {
  const [orderAmount, setOrderAmount] = useState(1800);
  const [tier, setTier] = useState<Tier>("NEW");
  const [months, setMonths] = useState(3);

  const preview = useMemo(() => {
    const downPaymentRatio = getDownPaymentRatioForTier(tier);
    const upfront = orderAmount * downPaymentRatio;
    const financed = orderAmount - upfront;
    const monthlyRate = toMonthlyRate(aprByTier[tier]);
    const emi = calculateEmi(financed, monthlyRate, months);

    return {
      upfront,
      financed,
      emi
    };
  }, [months, orderAmount, tier]);

  return (
    <div className="card">
      <div className="eyebrow">Checkout Preview</div>
      <h3 style={{ marginTop: 10 }}>See your plan before you commit</h3>

      <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
        <label>
          Order amount (INR)
          <input
            type="number"
            min={500}
            max={20000}
            value={orderAmount}
            onChange={(event) => setOrderAmount(Number(event.target.value))}
            style={{ width: "100%", marginTop: 6, padding: 10 }}
          />
        </label>

        <label>
          Tier
          <select value={tier} onChange={(event) => setTier(event.target.value as Tier)} style={{ width: "100%", marginTop: 6, padding: 10 }}>
            <option value="NEW">New</option>
            <option value="EMERGING">Emerging</option>
            <option value="TRUSTED">Trusted</option>
          </select>
        </label>

        <label>
          Tenure (months)
          <select value={months} onChange={(event) => setMonths(Number(event.target.value))} style={{ width: "100%", marginTop: 6, padding: 10 }}>
            <option value={3}>Pay in 3</option>
            <option value={6}>Pay in 6</option>
            <option value={9}>Pay in 9</option>
            <option value={12}>Pay in 12</option>
          </select>
        </label>
      </div>

      <div className="stats">
        <div className="stat">
          <small>Pay now</small>
          <strong>₹{preview.upfront.toFixed(0)}</strong>
        </div>
        <div className="stat">
          <small>Financed</small>
          <strong>₹{preview.financed.toFixed(0)}</strong>
        </div>
        <div className="stat">
          <small>Monthly</small>
          <strong>₹{preview.emi.toFixed(0)}</strong>
        </div>
      </div>

      <p style={{ marginTop: 12 }}>
        Current tier: <strong>{tierLabels[tier]}</strong>. Better repayment behavior unlocks lower upfront and better terms.
      </p>
    </div>
  );
};
