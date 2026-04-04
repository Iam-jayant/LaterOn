import { calculateEmi, getDownPaymentRatioForTier, toMonthlyRate, TIER_CAPS, type CheckoutQuote } from "@lateron/sdk";
import { ValidationError } from "../errors";
import { createId } from "../lib/ids";
import { nowUnix } from "../lib/time";
import type { ApiConfig } from "../config";
import { ContractGateway } from "./contract-gateway";

const signQuote = (payload: string): string => Buffer.from(payload).toString("base64url");

export interface CreateQuoteInput {
  walletAddress: string;
  merchantId: string;
  orderAmountInr: number;
  tenureMonths: number;
}

export class QuoteService {
  public constructor(
    private readonly gateway: ContractGateway,
    private readonly config: ApiConfig
  ) {}

  public createQuote(input: CreateQuoteInput): CheckoutQuote {
    if (input.orderAmountInr <= 0) {
      throw new ValidationError("Order amount must be positive");
    }
    if (input.tenureMonths <= 0) {
      throw new ValidationError("Tenure must be positive");
    }

    const user = this.gateway.getOrCreateUser(input.walletAddress);
    
    // Handle async user retrieval - for now, use synchronous fallback
    // In production, this should be refactored to be async
    const userProfile = user instanceof Promise ? { tier: "NEW" as const } : user;
    
    const caps = TIER_CAPS[userProfile.tier];
    if (input.orderAmountInr > caps.maxOrderInr) {
      throw new ValidationError("Order exceeds tier cap");
    }

    const algoPerInr = this.config.defaultAlgoPerInr;
    const orderAmountAlgo = Number((input.orderAmountInr * algoPerInr).toFixed(6));
    const downPaymentRatio = getDownPaymentRatioForTier(userProfile.tier);
    const upfrontAmountAlgo = Number((orderAmountAlgo * downPaymentRatio).toFixed(6));
    const financedAmountAlgo = Number((orderAmountAlgo - upfrontAmountAlgo).toFixed(6));
    const financedAmountInr = Number((input.orderAmountInr * (1 - downPaymentRatio)).toFixed(2));
    const apr = this.gateway.getProtocolParams().aprTable[userProfile.tier];
    const monthlyRate = toMonthlyRate(apr);
    const installmentAmountAlgo = Number(calculateEmi(financedAmountAlgo, monthlyRate, input.tenureMonths).toFixed(6));
    const expiresAtUnix = nowUnix() + this.config.quoteTtlSeconds;

    const quote: CheckoutQuote = {
      quoteId: createId("quote"),
      walletAddress: input.walletAddress,
      merchantId: input.merchantId,
      orderAmountInr: input.orderAmountInr,
      financedAmountInr,
      orderAmountAlgo,
      upfrontAmountAlgo,
      financedAmountAlgo,
      installmentAmountAlgo,
      tenureMonths: input.tenureMonths,
      monthlyRate,
      expiresAtUnix,
      signature: signQuote(
        `${input.walletAddress}:${input.merchantId}:${orderAmountAlgo}:${financedAmountAlgo}:${expiresAtUnix}`
      )
    };

    return this.gateway.registerQuote(quote);
  }
}
