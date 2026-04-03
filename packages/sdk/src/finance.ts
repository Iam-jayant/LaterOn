import type { Tier } from "./types";

export const toMonthlyRate = (aprPercent: number): number => aprPercent / 100 / 12;

export const calculateEmi = (principal: number, monthlyRate: number, months: number): number => {
  if (months <= 0) {
    throw new Error("Months must be greater than zero");
  }

  if (principal <= 0) {
    return 0;
  }

  if (monthlyRate === 0) {
    return principal / months;
  }

  const multiplier = (1 + monthlyRate) ** months;
  return (principal * monthlyRate * multiplier) / (multiplier - 1);
};

export const getDownPaymentRatioForTier = (tier: Tier): number => {
  switch (tier) {
    case "NEW":
      return 0.5;
    case "EMERGING":
      return 0.3;
    case "TRUSTED":
      return 0.15;
    default:
      return 0.5;
  }
};

export const generateInstallmentDueDates = (startUnixSeconds: number, months: number): number[] => {
  const dueDates: number[] = [];
  const startDate = new Date(startUnixSeconds * 1000);

  for (let index = 0; index < months; index += 1) {
    const next = new Date(startDate);
    next.setUTCMonth(startDate.getUTCMonth() + index + 1);
    dueDates.push(Math.floor(next.getTime() / 1000));
  }

  return dueDates;
};
