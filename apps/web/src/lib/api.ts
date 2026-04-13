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

  async getUserPurchases(authToken: string): Promise<Array<{
    planId: string;
    productName: string;
    denomination: number;
    code: string;
    pin: string;
    purchasedAt: string;
    expiresAt: string | null;
  }>> {
    const response = await this.request<{ purchases: Array<{
      planId: string;
      productName: string;
      denomination: number;
      code: string;
      pin: string;
      purchasedAt: string;
      expiresAt: string | null;
    }> }>('/api/user/purchases', {
      headers: {
        authorization: `Bearer ${authToken}`
      }
    });
    return response.purchases;
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

  // Consent & Onboarding APIs
  async saveConsent(params: {
    walletAddress: string;
    purpose: string;
    txnId: string;
  }): Promise<{ success: boolean; consentId: number }> {
    return this.request('/api/consent/save', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async checkConsent(authToken: string, purpose: string): Promise<boolean> {
    try {
      const response = await this.request<{ hasConsent: boolean; txnId: string | null; consentTimestamp: string | null }>('/api/consent/check', {
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });
      return response.hasConsent;
    } catch {
      return false;
    }
  }

  async analyseWallet(authToken: string): Promise<{
    breakdown: Array<{
      signal: string;
      value: string | number;
      points: number;
      maxPoints: number;
      barPercent: number;
    }>;
    totalScore: number;
    tier: string;
    creditLimit: number;
  }> {
    return this.request('/api/user/analyse-wallet', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });
  }

  async checkUserExists(walletAddress: string): Promise<{ exists: boolean }> {
    try {
      await this.getUserProfile(walletAddress);
      return { exists: true };
    } catch {
      return { exists: false };
    }
  }

  // Data Access Log API
  async getDataAccessLog(authToken: string): Promise<Array<{
    operation: string;
    accessedBy: string;
    accessedAt: string;
  }>> {
    return this.request('/api/user/data-access-log', {
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });
  }

  // User Deletion API
  async deleteUserData(authToken: string): Promise<{ success: boolean; message: string }> {
    return this.request('/api/user/me', {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });
  }
}

export const apiClient = new ApiClient();
