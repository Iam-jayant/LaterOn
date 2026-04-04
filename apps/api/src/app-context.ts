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
  config: ApiConfig;
}

export const createAppContext = async (config: Partial<ApiConfig>): Promise<AppContext> => {
  const resolvedConfig = resolveConfig(config);
  const store = new InMemoryStore();
  const chainService = new AlgorandAppService(resolvedConfig);

  // Initialize PostgreSQL connection pool and repository
  const pool = new Pool({
    connectionString: resolvedConfig.databaseUrl,
    min: 2,
    max: 10,
  });
  const repository = new PostgresRepository(pool);
  await repository.init();

  const gateway = new ContractGateway(store, chainService, repository);
  const mirror = new PostgresMirror(resolvedConfig.databaseUrl);
  await mirror.init();
  const readModel = new ReadModelService(gateway, mirror);
  const quoteService = new QuoteService(gateway, resolvedConfig);
  const riskKeeper = new RiskKeeperService(gateway, readModel);
  const authService = new AuthService(store);
  const idempotencyService = new IdempotencyService(store);
  const rateLimitService = new RateLimitService(store);
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
    config: resolvedConfig
  };
};
