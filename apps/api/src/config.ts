export interface ApiConfig {
  apiPort: number;
  quoteTtlSeconds: number;
  defaultAlgoPerInr: number;
  adminApiKey: string;
  databaseUrl?: string;
  authRequired: boolean;
  authTokenSecret: string;
  authTokenTtlSeconds: number;
  authChallengeTtlSeconds: number;
  devSignatureBypass: boolean;
  merchantAuthRequired: boolean;
  merchantApiKeys: Record<string, string>;
  rateLimitPerMinute: number;
  corsOrigins: string[];
  requireIdempotency: boolean;
  chainEnabled: boolean;
  chainWaitRounds: number;
  algodAddress: string;
  algodToken: string;
  bnplAppId: number;
  poolAppId: number;
  relayerMnemonic?: string;
  relayerPrivateKey?: string;
  reloadlyClientId: string;
  reloadlyClientSecret: string;
  reloadlyBaseUrl: string;
  reloadlyAuthUrl: string;
  reloadlyTokenCacheTtlSeconds: number;
  coinGeckoBaseUrl: string;
  coinGeckoRateCacheTtlSeconds: number;
  coinGeckoFallbackRate: number;
  lendingPoolAddress: string;
  marketplaceMerchantId: string;
  marketplaceTenureMonths: number;
  indexerAddress: string;
  indexerToken: string;
  protocolMnemonic?: string;
  protocolAddress: string;
  ipHashSalt: string;
  knownDefiAppIds: number[];
}

const envNumber = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const envBool = (key: string, fallback: boolean): boolean => {
  const raw = process.env[key];
  if (!raw) {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const parseMerchantKeys = (input?: string): Record<string, string> => {
  const defaultValue = "merchant_demo:demo-merchant-key,merchant_a:key-a,merchant_b:key-b";
  const source = input && input.trim().length > 0 ? input : defaultValue;

  const map: Record<string, string> = {};
  for (const entry of source.split(",")) {
    const [merchantId, key] = entry.split(":").map((item) => item?.trim());
    if (!merchantId || !key) {
      continue;
    }
    map[merchantId] = key;
  }
  return map;
};

const parseCorsOrigins = (input?: string): string[] => {
  const source = input && input.trim().length > 0 ? input : "http://localhost:3000,http://localhost:3001";
  return source
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const parseKnownDefiAppIds = (input?: string): number[] => {
  const source = input && input.trim().length > 0 ? input : "21580889,552635992,1166022341";
  return source
    .split(",")
    .map((item) => item.trim())
    .map((item) => parseInt(item, 10))
    .filter((item) => !isNaN(item));
};

const rawEnvConfig = (): Partial<ApiConfig> => ({
  apiPort: envNumber("API_PORT", 4000),
  quoteTtlSeconds: envNumber("QUOTE_TTL_SECONDS", 300),
  defaultAlgoPerInr: envNumber("DEFAULT_ALGO_PER_INR", 0.0022),
  adminApiKey: process.env.ADMIN_API_KEY ?? "change-me",
  databaseUrl: process.env.DATABASE_URL,
  authRequired: envBool("AUTH_REQUIRED", true),
  authTokenSecret: process.env.AUTH_TOKEN_SECRET ?? "replace-with-strong-secret",
  authTokenTtlSeconds: envNumber("AUTH_TOKEN_TTL_SECONDS", 3600),
  authChallengeTtlSeconds: envNumber("AUTH_CHALLENGE_TTL_SECONDS", 300),
  devSignatureBypass: envBool("DEV_SIGNATURE_BYPASS", false),
  merchantAuthRequired: envBool("MERCHANT_AUTH_REQUIRED", true),
  merchantApiKeys: parseMerchantKeys(process.env.MERCHANT_API_KEYS),
  rateLimitPerMinute: envNumber("RATE_LIMIT_PER_MINUTE", 100),
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),
  requireIdempotency: envBool("REQUIRE_IDEMPOTENCY", true),
  chainEnabled: envBool("CHAIN_ENABLED", false),
  chainWaitRounds: envNumber("CHAIN_WAIT_ROUNDS", 10),
  algodAddress: process.env.ALGOD_ADDRESS ?? "https://testnet-api.algonode.cloud",
  algodToken: process.env.ALGOD_TOKEN ?? "",
  bnplAppId: envNumber("BNPL_APP_ID", 0),
  poolAppId: envNumber("POOL_APP_ID", 0),
  relayerMnemonic: process.env.RELAYER_MNEMONIC,
  relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY,
  reloadlyClientId: process.env.RELOADLY_CLIENT_ID ?? "",
  reloadlyClientSecret: process.env.RELOADLY_CLIENT_SECRET ?? "",
  reloadlyBaseUrl: process.env.RELOADLY_BASE_URL ?? "https://giftcards-sandbox.reloadly.com",
  reloadlyAuthUrl: process.env.RELOADLY_AUTH_URL ?? "https://auth.reloadly.com",
  reloadlyTokenCacheTtlSeconds: envNumber("RELOADLY_TOKEN_CACHE_TTL_SECONDS", 3600),
  coinGeckoBaseUrl: process.env.COINGECKO_BASE_URL ?? "https://api.coingecko.com/api/v3",
  coinGeckoRateCacheTtlSeconds: envNumber("COINGECKO_RATE_CACHE_TTL_SECONDS", 300),
  coinGeckoFallbackRate: envNumber("COINGECKO_FALLBACK_RATE", 0.0022),
  lendingPoolAddress: process.env.LENDING_POOL_ADDRESS ?? "",
  marketplaceMerchantId: process.env.MARKETPLACE_MERCHANT_ID ?? "reloadly",
  marketplaceTenureMonths: envNumber("MARKETPLACE_TENURE_MONTHS", 3),
  indexerAddress: process.env.INDEXER_ADDRESS ?? "https://testnet-idx.algonode.cloud",
  indexerToken: process.env.INDEXER_TOKEN ?? "",
  protocolMnemonic: process.env.PROTOCOL_MNEMONIC,
  protocolAddress: process.env.PROTOCOL_ADDRESS ?? "",
  ipHashSalt: process.env.IP_HASH_SALT ?? "",
  knownDefiAppIds: parseKnownDefiAppIds(process.env.KNOWN_DEFI_APP_IDS)
});

const defaults: ApiConfig = {
  apiPort: 4000,
  quoteTtlSeconds: 300,
  defaultAlgoPerInr: 0.0022,
  adminApiKey: "change-me",
  databaseUrl: undefined,
  authRequired: true,
  authTokenSecret: "replace-with-strong-secret",
  authTokenTtlSeconds: 3600,
  authChallengeTtlSeconds: 300,
  devSignatureBypass: false,
  merchantAuthRequired: true,
  merchantApiKeys: parseMerchantKeys(),
  rateLimitPerMinute: 100,
  corsOrigins: parseCorsOrigins(),
  requireIdempotency: true,
  chainEnabled: false,
  chainWaitRounds: 10,
  algodAddress: "https://testnet-api.algonode.cloud",
  algodToken: "",
  bnplAppId: 0,
  poolAppId: 0,
  relayerMnemonic: undefined,
  relayerPrivateKey: undefined,
  reloadlyClientId: "",
  reloadlyClientSecret: "",
  reloadlyBaseUrl: "https://giftcards-sandbox.reloadly.com",
  reloadlyAuthUrl: "https://auth.reloadly.com",
  reloadlyTokenCacheTtlSeconds: 3600,
  coinGeckoBaseUrl: "https://api.coingecko.com/api/v3",
  coinGeckoRateCacheTtlSeconds: 300,
  coinGeckoFallbackRate: 0.0022,
  lendingPoolAddress: "",
  marketplaceMerchantId: "reloadly",
  marketplaceTenureMonths: 3,
  indexerAddress: "https://testnet-idx.algonode.cloud",
  indexerToken: "",
  protocolMnemonic: undefined,
  protocolAddress: "",
  ipHashSalt: "",
  knownDefiAppIds: parseKnownDefiAppIds()
};

export const resolveConfig = (partial: Partial<ApiConfig>): ApiConfig => ({
  ...defaults,
  ...partial
});

export const loadConfig = (): ApiConfig => resolveConfig(rawEnvConfig());
