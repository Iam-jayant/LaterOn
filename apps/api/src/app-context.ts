import { Pool } from "pg";
import { resolveConfig, type ApiConfig } from "./config";
import { PostgresMirror } from "./db/postgres-mirror";
import { PostgresRepository } from "./db/postgres-repository";
import { AlgorandAppService } from "./services/algorand-app-service";
import { AuthService } from "./services/auth-service";
import { ContractGateway } from "./services/contract-gateway";
import { IdempotencyService } from "./services/idempotency-service";
import { QuoteService } from "./services/quote-service";
import { RateLimitService } from "./services/rate-limit-service";
import { ReadModelService } from "./services/read-model";
import { RiskKeeperService } from "./services/risk-keeper";
import { InMemoryStore } from "./services/store";
import { ReloadlyService } from "./services/reloadly-service";
import { CoinGeckoService } from "./services/coingecko-service";
import { MarketplaceService } from "./services/marketplace-service";
import { ConsentService } from "./services/consent-service";
import { WalletAnalysisService } from "./services/wallet-analysis-service";
import { ScoreASAService } from "./services/score-asa-service";
import { ScoreASALifecycleService } from "./services/score-asa-lifecycle";
import algosdk from "algosdk";

export interface AppContext {
  gateway: ContractGateway;
  readModel: ReadModelService;
  quoteService: QuoteService;
  riskKeeper: RiskKeeperService;
  authService: AuthService;
  idempotencyService: IdempotencyService;
  rateLimitService: RateLimitService;
  chainService: AlgorandAppService;
  mirror: PostgresMirror;
  repository: PostgresRepository;
  reloadlyService: ReloadlyService;
  coinGeckoService: CoinGeckoService;
  marketplaceService: MarketplaceService;
  consentService: ConsentService;
  walletAnalysisService: WalletAnalysisService;
  scoreASAService: ScoreASAService;
  scoreASALifecycleService: ScoreASALifecycleService;
  config: ApiConfig;
}

export const createAppContext = async (config: Partial<ApiConfig>): Promise<AppContext> => {
  const resolvedConfig = resolveConfig(config);
  const store = new InMemoryStore();
  const chainService = new AlgorandAppService(resolvedConfig);

  // Initialize database repository (PostgreSQL or Supabase)
  let repository: PostgresRepository | any;
  let mirror: PostgresMirror;
  
  // Prefer Supabase client if configured
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const { createClient } = await import("@supabase/supabase-js");
    const { SupabaseRepository } = await import("./db/supabase-repository.js");
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
    
    repository = new SupabaseRepository(supabase);
    await repository.init();
    
    // Mirror not needed with Supabase (direct access)
    mirror = null as any;
  } else if (resolvedConfig.databaseUrl) {
    // Fallback to PostgreSQL connection pool
    const pool = new Pool({
      connectionString: resolvedConfig.databaseUrl,
      min: 2,
      max: 10,
    });
    repository = new PostgresRepository(pool);
    await repository.init();
    
    mirror = new PostgresMirror(resolvedConfig.databaseUrl);
    await mirror.init();
  } else {
    // Create stub implementations when database is not configured
    repository = null as any;
    mirror = null as any;
  }

  const gateway = new ContractGateway(store, chainService, repository);
  const readModel = new ReadModelService(gateway, mirror);
  const quoteService = new QuoteService(gateway, resolvedConfig);
  const riskKeeper = new RiskKeeperService(gateway, readModel);
  const authService = new AuthService(store);
  const idempotencyService = new IdempotencyService(store);
  const rateLimitService = new RateLimitService(store);
  
  // Initialize marketplace services
  const reloadlyService = new ReloadlyService(resolvedConfig);
  const coinGeckoService = new CoinGeckoService(resolvedConfig);
  const marketplaceService = new MarketplaceService(
    resolvedConfig,
    reloadlyService,
    coinGeckoService,
    gateway,
    repository
  );
  
  // Initialize consent and wallet analysis services
  const ipHashSalt = process.env.IP_HASH_SALT ?? "default-salt-change-in-production";
  const consentService = new ConsentService(repository, ipHashSalt);
  
  // Initialize Algorand Indexer client
  const indexerAddress = process.env.INDEXER_ADDRESS ?? "https://testnet-idx.algonode.cloud";
  const indexerToken = process.env.INDEXER_TOKEN ?? "";
  const indexerClient = new algosdk.Indexer(indexerToken, indexerAddress, "");
  const walletAnalysisService = new WalletAnalysisService(indexerClient, repository);
  
  // Initialize Score ASA services
  const algodAddress = process.env.ALGOD_ADDRESS ?? "https://testnet-api.algonode.cloud";
  const algodToken = process.env.ALGOD_TOKEN ?? "";
  const algodClient = new algosdk.Algodv2(algodToken, algodAddress, "");
  
  // Get protocol account from mnemonic
  const protocolMnemonic = process.env.PROTOCOL_MNEMONIC ?? "";
  const protocolAccount = protocolMnemonic 
    ? algosdk.mnemonicToSecretKey(protocolMnemonic)
    : null as any; // Will fail if Score ASA operations are attempted
  
  const scoreASAService = new ScoreASAService(algodClient, protocolAccount, repository);
  const scoreASALifecycleService = new ScoreASALifecycleService(repository, scoreASAService);
  
  // Inject lifecycle service into gateway (for clawback on default)
  (gateway as any).scoreASALifecycleService = scoreASALifecycleService;
  
  return {
    gateway,
    readModel,
    quoteService,
    riskKeeper,
    authService,
    idempotencyService,
    rateLimitService,
    chainService,
    mirror,
    repository,
    reloadlyService,
    coinGeckoService,
    marketplaceService,
    consentService,
    walletAnalysisService,
    scoreASAService,
    scoreASALifecycleService,
    config: resolvedConfig
  };
};
