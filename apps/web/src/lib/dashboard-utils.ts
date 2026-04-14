import type { Plan } from './api';

/**
 * Dashboard Utility Functions
 * 
 * Provides derived data calculations for dashboard display.
 * These functions transform API data into display-ready formats.
 */

// Conversion rate constant
export const ALGO_TO_INR = 80;

/**
 * Get product name from plan
 * Currently returns fallback as merchantId doesn't map to product names yet
 */
export function getProductName(plan: Plan): string {
  return plan.productName || 'Purchase';
}

/**
 * Get next EMI date from plan installments
 * Finds the first unpaid installment or returns the last installment date
 */
export function getNextEmiDate(plan: Plan): Date {
  if (plan.installments.length === 0) {
    return new Date(plan.nextDueAtUnix * 1000);
  }

  const nextUnpaid = plan.installments.find(
    (inst) => inst.installmentNumber > plan.installmentsPaid
  );
  
  if (nextUnpaid) {
    return new Date(nextUnpaid.dueAtUnix * 1000);
  }
  
  // If all paid, return last installment date
  const lastInstallment = plan.installments[plan.installments.length - 1];
  return new Date(lastInstallment.dueAtUnix * 1000);
}

/**
 * Calculate remaining amount in INR from ALGO
 */
export function getRemainingAmountInr(plan: Plan): number {
  return Math.round(plan.remainingAmountAlgo * ALGO_TO_INR);
}

/**
 * Calculate progress percentage based on installments paid
 */
export function getProgressPercentage(plan: Plan): number {
  if (plan.installments.length === 0) {
    return Math.round((plan.installmentsPaid / Math.max(plan.tenureMonths, 1)) * 100);
  }
  return Math.round((plan.installmentsPaid / plan.installments.length) * 100);
}

/**
 * Determine EMI status based on due date and payment status
 */
export function getEmiStatus(
  installment: { dueAtUnix: number; installmentNumber: number },
  installmentsPaid: number,
  installmentNumber: number
): 'paid' | 'due-soon' | 'overdue' {
  const now = Date.now() / 1000;
  const daysDiff = (installment.dueAtUnix - now) / (24 * 60 * 60);
  
  // Check if already paid
  if (installmentNumber <= installmentsPaid) {
    return 'paid';
  }
  
  // Check if overdue
  if (daysDiff < 0) {
    return 'overdue';
  }
  
  // Check if due soon (within 7 days)
  if (daysDiff <= 7) {
    return 'due-soon';
  }
  
  // Future installment (not yet due, more than 7 days away)
  // For display purposes in "Upcoming EMIs", we don't show these
  // But if we need to, they would be in a neutral state
  return 'due-soon';
}

/**
 * Truncate wallet address to format "ABCD...XYZ1"
 */
export function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

/**
 * Format date for EMI display (e.g., "15 Jan 2024")
 */
export function formatEmiDate(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Format INR amount with Indian locale (e.g., "1,23,456")
 */
export function formatInr(amount: number): string {
  return amount.toLocaleString('en-IN');
}
