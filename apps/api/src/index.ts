import { createAppContext } from "./app-context";
import { loadConfig } from "./config";
import { logger } from "./lib/logger";
import { buildServer } from "./server";

const bootstrap = async (): Promise<void> => {
  const config = loadConfig();
  
  // Validate required environment variables
  const requiredEnvVars = [
    { name: "ALGOD_ADDRESS", value: config.algodAddress },
    { name: "BNPL_APP_ID", value: config.bnplAppId },
    { name: "POOL_APP_ID", value: config.poolAppId }
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

  const ctx = await createAppContext(config);
  const app = await buildServer(ctx);

  // Graceful shutdown handler
  const gracefulShutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, starting graceful shutdown`);
    
    try {
      await app.close();
      logger.info("Server closed successfully");
      process.exit(0);
    } catch (error) {
      logger.error("Error during graceful shutdown", { error });
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => void gracefulShutdown("SIGINT"));

  try {
    await app.listen({
      host: "0.0.0.0",
      port: config.apiPort
    });
    logger.info(`API server started on port ${config.apiPort}`);
  } catch (error) {
    logger.error("Failed to start API server", { error });
    process.exit(1);
  }
};

void bootstrap();
