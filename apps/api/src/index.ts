import { serve } from "@hono/node-server";
import { createAppContext } from "./app-context";
import { loadConfig } from "./config";
import { logger } from "./lib/logger";
import { buildServer } from "./server";
import dns from "dns";

// Configure DNS to use Google DNS (8.8.8.8) for reliable resolution
// This ensures Supabase domains resolve correctly even with local DNS issues
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const bootstrap = async (): Promise<void> => {
  const config = loadConfig();
  
  // Validate required environment variables
  const requiredEnvVars = [
    { name: "ALGOD_ADDRESS", value: config.algodAddress },
    { name: "BNPL_APP_ID", value: config.bnplAppId },
    { name: "POOL_APP_ID", value: config.poolAppId },
    { name: "INDEXER_ADDRESS", value: config.indexerAddress },
    { name: "IP_HASH_SALT", value: config.ipHashSalt }
  ];

  const missingVars = requiredEnvVars.filter(
    (env) => !env.value || (typeof env.value === "number" && env.value === 0)
  );

  if (missingVars.length > 0) {
    logger.error("Missing required environment variables", {
      missing: missingVars.map((v) => v.name)
    });
    process.exit(1);
  }

  // Warn about optional but recommended environment variables
  const optionalVars = [
    { name: "PROTOCOL_MNEMONIC", value: config.protocolMnemonic, purpose: "Score ASA operations" },
    { name: "PROTOCOL_ADDRESS", value: config.protocolAddress, purpose: "Score ASA operations" },
    { name: "DATABASE_URL", value: config.databaseUrl, purpose: "Persistent storage" }
  ];

  const missingOptional = optionalVars.filter((env) => !env.value);
  if (missingOptional.length > 0) {
    logger.warn("Optional environment variables not set", {
      missing: missingOptional.map((v) => ({ name: v.name, purpose: v.purpose }))
    });
  }

  const ctx = await createAppContext(config);
  const app = buildServer(ctx);

  // Start server
  const server = serve({
    fetch: app.fetch,
    port: config.apiPort,
    hostname: "0.0.0.0"
  });

  // Graceful shutdown handler
  const gracefulShutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, starting graceful shutdown`);
    
    try {
      server.close();
      logger.info("Server closed successfully");
      process.exit(0);
    } catch (error) {
      logger.error("Error during graceful shutdown", { error });
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => void gracefulShutdown("SIGINT"));

  logger.info(`API server started on port ${config.apiPort}`);
};

void bootstrap();
