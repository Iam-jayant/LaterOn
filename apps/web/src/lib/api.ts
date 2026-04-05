const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export interface Plan {
  planId: string;
  walletAddress: string;
  merchantId: string;
  status: 'ACTIVE' | 'COMPLETED' | 'DEFAULTED';
  tierAtApproval: string;
  tenureMonths: number;
  aprPercent: number;
  createdAtUnix: number;
  nextDueAtUnix: number;
  financedAmountInr: number;
  financedAmountAlgo: number;
  remainingAmountAlgo: number;
  installmentsPaid: number;
  installments: Array<{
    installmentNumber: number;
    dueAtUnix: number;
    amountAlgo: number;
  }>;
}

export interface UserProfile {
  walletAddress: string;
  tier: 'NEW' | 'EMERGING' | 'TRUSTED';
  capacityAlgo: number;
  completedPlans: number;
  activePlans: number;
}

export interface CheckoutQuote {
  quoteId: string;
  walletAddress: string;
  merchantId: string;
  orderAmountInr: number;
  tenureMonths: number;
  upfrontAmountAlgo: number;
  financedAmountAlgo: number;
  financedAmountInr: number;
  installmentAmountAlgo: number;
  monthlyRate: number;
  expiresAtUnix: number;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = apiBase) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // User & Profile APIs
  async getUserProfile(walletAddress: string, authToken?: string): Promise<UserProfile> {
    const headers: Record<string, string> = {};
    if (authToken) {
      headers.authorization = `Bearer ${authToken}`;
    }

    return this.request<UserProfile>(`/api/user/${walletAddress}`, { headers });
  }

  async getUserPlans(walletAddress: string, authToken?: string): Promise<Plan[]> {
    const headers: Record<string, string> = {};
    if (authToken) {
      headers.authorization = `Bearer ${authToken}`;
    }

    return this.request<Plan[]>(`/api/user/${walletAddress}/plans`, { headers });
  }

  // Checkout APIs
  async createQuote(params: {
    walletAddress: string;
    merchantId: string;
    orderAmountInr: number;
    tenureMonths?: number;
  }): Promise<CheckoutQuote> {
    return this.request<CheckoutQuote>('/api/checkout/quote', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async commitCheckout(quoteId: string): Promise<{
    unsignedTxns: string[];
    planId: string;
    quote: CheckoutQuote;
  }> {
    return this.request('/api/checkout/commit', {
      method: 'POST',
      body: JSON.stringify({ quoteId }),
    });
  }

  async confirmCheckout(planId: string, txId: string): Promise<{
    success: boolean;
    plan: Plan;
  }> {
    return this.request('/api/checkout/confirm', {
      method: 'POST',
      body: JSON.stringify({ planId, txId }),
    });
  }

  // Repayment APIs
  async prepareRepayment(planId: string, walletAddress: string): Promise<{
    unsignedTxn: string;
    plan: Plan;
    repaymentAmount: number;
  }> {
    return this.request('/api/repayment/prepare', {
      method: 'POST',
      body: JSON.stringify({ planId, walletAddress }),
    });
  }

  async confirmRepayment(
    planId: string,
    txId: string,
    repaymentAmountAlgo: number
  ): Promise<{
    success: boolean;
    plan: Plan;
  }> {
    return this.request('/api/repayment/confirm', {
      method: 'POST',
      body: JSON.stringify({ planId, txId, repaymentAmountAlgo }),
    });
  }
}

export const apiClient = new ApiClient();
