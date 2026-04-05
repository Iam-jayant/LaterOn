export const checkoutMessage = (upfront: number, monthly: number): string =>
  `Pay ${upfront.toFixed(2)} ALGO now, then ${monthly.toFixed(2)} ALGO monthly`;
