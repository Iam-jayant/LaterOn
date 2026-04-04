const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const useDevAuth = process.env.NEXT_PUBLIC_USE_DEV_AUTH !== "false";

const tokenCache = new Map<string, string>();

const merchantKeys: Record<string, string> = {
  merchant_demo: process.env.NEXT_PUBLIC_MERCHANT_KEY ?? "demo-merchant-key",
  merchant_a: "key-a",
  merchant_b: "key-b"
};

export const resolveMerchantKey = (merchantId: string): string => {
  return merchantKeys[merchantId] ?? merchantKeys.merchant_demo;
};

export const createIdempotencyKey = (scope: string): string => {
  const random = Math.random().toString(16).slice(2);
  return `${scope}-${Date.now()}-${random}`;
};

export const ensureWalletToken = async (walletAddress: string): Promise<string | undefined> => {
  if (!useDevAuth || !walletAddress) {
    return undefined;
  }

  const cached = tokenCache.get(walletAddress);
  if (cached) {
    return cached;
  }

  const challengeResponse = await fetch(`${apiBase}/v1/auth/challenge`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      walletAddress
    })
  });

  if (!challengeResponse.ok) {
    throw new Error("Unable to create auth challenge");
  }

  const challenge = (await challengeResponse.json()) as {
    challengeId: string;
  };

  const verifyResponse = await fetch(`${apiBase}/v1/auth/verify`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      walletAddress,
      challengeId: challenge.challengeId,
      signature: `DEV:${challenge.challengeId}`
    })
  });
  if (!verifyResponse.ok) {
    throw new Error("Unable to verify auth challenge");
  }

  const verified = (await verifyResponse.json()) as {
    token: string;
  };
  tokenCache.set(walletAddress, verified.token);
  return verified.token;
};

export const buildAuthHeaders = async (walletAddress: string): Promise<Record<string, string>> => {
  const headers: Record<string, string> = {};
  const token = await ensureWalletToken(walletAddress);
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  return headers;
};
