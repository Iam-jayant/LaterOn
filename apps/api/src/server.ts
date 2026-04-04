import cors from "@fastify/cors";
import { USER_SAFE_ERROR_MESSAGE, type ProtocolAprTable } from "@lateron/sdk";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "./app-context";
import {
  AppError,
  BlockchainError,
  ForbiddenError,
  InsufficientPoolLiquidityError,
  NotFoundError,
  UnauthorizedError,
  ValidationError
} from "./errors";
import { logger } from "./lib/logger";
import { nowUnix } from "./lib/time";
import { registerCheckoutRoutes } from "./routes/checkout.js";
import { registerRepaymentRoutes } from "./routes/repayment.js";
import { registerLenderRoutes } from "./routes/lender.js";
import { registerAdminRoutes } from "./routes/admin.js";

const adminGuard = (app: FastifyInstance, key: string): void => {
  app.addHook("onRequest", async (request) => {
    if (!request.url.startsWith("/v1/admin")) {
      return;
    }
    const incoming = request.headers["x-admin-key"];
    if (incoming !== key) {
      throw new UnauthorizedError();
    }
  });
};

const rateLimitGuard = (app: FastifyInstance): void => {
  app.addHook("onRequest", async (request) => {
    if (request.url.startsWith("/health")) {
      return;
    }

    const identity = `${request.ip}:${request.method}:${request.url.split("?")[0]}`;
    app.ctx.rateLimitService.checkOrThrow(identity, app.ctx.config.rateLimitPerMinute);
  });
};

const normalizeHeader = (value: string | string[] | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  return Array.isArray(value) ? value[0] : value;
};

const resolveWalletFromAuth = (app: FastifyInstance, request: FastifyRequest): string | undefined => {
  if (!app.ctx.config.authRequired) {
    return undefined;
  }

  const authHeader = normalizeHeader(request.headers.authorization);
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing Bearer token");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  return app.ctx.authService.verifyToken(token, app.ctx.config.authTokenSecret).walletAddress;
};

const assertWalletMatch = (app: FastifyInstance, authenticatedWallet: string | undefined, targetWallet: string): void => {
  if (!app.ctx.config.authRequired) {
    return;
  }
  if (!authenticatedWallet || authenticatedWallet !== targetWallet) {
    throw new ForbiddenError("Wallet token does not match the requested wallet");
  }
};

const assertMerchantAccess = (
  app: FastifyInstance,
  request: FastifyRequest,
  merchantId: string
): void => {
  if (!app.ctx.config.merchantAuthRequired) {
    return;
  }

  const incoming = normalizeHeader(request.headers["x-merchant-key"]);
  if (!incoming) {
    throw new UnauthorizedError("Merchant API key is required");
  }

  const expected = app.ctx.config.merchantApiKeys[merchantId];
  if (!expected || incoming !== expected) {
    throw new UnauthorizedError("Invalid merchant API key");
  }
};

const maybeReplayIdempotentResponse = (
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  scope: string,
  identity: string
): { handled: true } | { handled: false; key?: string } => {
  if (!app.ctx.config.requireIdempotency) {
    return {
      handled: false
    };
  }

  const incoming = normalizeHeader(request.headers["x-idempotency-key"]);
  const storageKey = `${scope}:${identity}:${incoming ?? ""}`;
  const cached = app.ctx.idempotencyService.getOrThrow(storageKey);
  if (!cached) {
    return {
      handled: false,
      key: storageKey
    };
  }

  void reply.status(cached.statusCode).send(cached.body);
  return {
    handled: true
  };
};

const maybeSaveIdempotentResponse = (
  app: FastifyInstance,
  idempotencyKey: string | undefined,
  statusCode: number,
  body: unknown
): void => {
  if (!idempotencyKey) {
    return;
  }
  app.ctx.idempotencyService.save(idempotencyKey, {
    statusCode,
    body
  });
};

const createRoutes = (app: FastifyInstance): void => {
  // Register checkout routes
  registerCheckoutRoutes(app);

  // Register repayment routes
  registerRepaymentRoutes(app);

  // Register lender routes
  registerLenderRoutes(app);

  // Register admin routes
  registerAdminRoutes(app);

  app.post("/v1/auth/challenge", async (request) => {
    const payload = z
      .object({
        walletAddress: z.string().min(8)
      })
      .safeParse(request.body);
    if (!payload.success) {
      throw new ValidationError("Invalid auth challenge request", payload.error.flatten());
    }

    const challenge = app.ctx.authService.createChallenge(
      payload.data.walletAddress,
      app.ctx.config.authChallengeTtlSeconds
    );
    return {
      challengeId: challenge.challengeId,
      walletAddress: challenge.walletAddress,
      message: challenge.message,
      expiresAtUnix: challenge.expiresAtUnix
    };
  });

  app.post("/v1/auth/verify", async (request) => {
    const payload = z
      .object({
        walletAddress: z.string().min(8),
        challengeId: z.string().min(10),
        signature: z.string().min(6)
      })
      .safeParse(request.body);
    if (!payload.success) {
      throw new ValidationError("Invalid auth verify request", payload.error.flatten());
    }

    const token = app.ctx.authService.verifyChallengeAndIssueToken({
      walletAddress: payload.data.walletAddress,
      challengeId: payload.data.challengeId,
      signature: payload.data.signature,
      secret: app.ctx.config.authTokenSecret,
      tokenTtlSeconds: app.ctx.config.authTokenTtlSeconds,
      allowDevBypass: app.ctx.config.devSignatureBypass
    });
    return {
      walletAddress: payload.data.walletAddress,
      ...token
    };
  });

  app.post("/v1/quotes", async (request) => {
    const payload = z
      .object({
        walletAddress: z.string().min(8),
        merchantId: z.string().min(2),
        orderAmountInr: z.number().positive(),
        tenureMonths: z.number().int().positive().max(24)
      })
      .safeParse(request.body);
    if (!payload.success) {
      throw new ValidationError("Invalid quote request", payload.error.flatten());
    }

    const walletFromToken = resolveWalletFromAuth(app, request);
    assertWalletMatch(app, walletFromToken, payload.data.walletAddress);
    assertMerchantAccess(app, request, payload.data.merchantId);

    return app.ctx.quoteService.createQuote(payload.data);
  });

  app.post("/v1/checkout/commit", async (request, reply) => {
    const payload = z
      .object({
        quoteId: z.string().min(10)
      })
      .safeParse(request.body);
    if (!payload.success) {
      throw new ValidationError("Invalid checkout request", payload.error.flatten());
    }

    const walletFromToken = resolveWalletFromAuth(app, request);
    const merchantKey = normalizeHeader(request.headers["x-merchant-key"]) ?? "none";

    const idempotency = maybeReplayIdempotentResponse(
      app,
      request,
      reply,
      "checkout",
      `${walletFromToken ?? "anon"}:${payload.data.quoteId}:${merchantKey}`
    );
    if (idempotency.handled) {
      return;
    }

    const quote = app.ctx.gateway.getQuote(payload.data.quoteId);
    assertWalletMatch(app, walletFromToken, quote.walletAddress);
    assertMerchantAccess(app, request, quote.merchantId);

    const plan = await app.ctx.gateway.createPlanFromQuote(payload.data.quoteId);
    await app.ctx.readModel.sync();
    const response = {
      success: true,
      plan
    };
    maybeSaveIdempotentResponse(app, idempotency.key, 200, response);
    return response;
  });

  app.get("/v1/plans", async (request) => {
    const query = z
      .object({
        walletAddress: z.string().min(8)
      })
      .safeParse(request.query);
    if (!query.success) {
      throw new ValidationError("walletAddress query param is required");
    }

    const walletFromToken = resolveWalletFromAuth(app, request);
    assertWalletMatch(app, walletFromToken, query.data.walletAddress);

    await app.ctx.readModel.sync();
    return {
      plans: app.ctx.readModel.getPlansByWallet(query.data.walletAddress),
      user: app.ctx.readModel.getUser(query.data.walletAddress) ?? app.ctx.gateway.getOrCreateUser(query.data.walletAddress)
    };
  });

  app.post("/v1/plans/:planId/repay", async (request, reply) => {
    const params = z
      .object({
        planId: z.string().min(8)
      })
      .safeParse(request.params);
    const payload = z
      .object({
        amountAlgo: z.number().positive()
      })
      .safeParse(request.body);

    if (!params.success || !payload.success) {
      throw new ValidationError("Invalid repayment payload");
    }

    const existingPlan = await app.ctx.gateway.getPlan(params.data.planId);
    const walletFromToken = resolveWalletFromAuth(app, request);
    assertWalletMatch(app, walletFromToken, existingPlan.walletAddress);

    const idempotency = maybeReplayIdempotentResponse(
      app,
      request,
      reply,
      "repay",
      existingPlan.walletAddress
    );
    if (idempotency.handled) {
      return;
    }

    const plan = await app.ctx.gateway.repayInstallment(params.data.planId, payload.data.amountAlgo);
    await app.ctx.readModel.sync();
    const response = {
      success: true,
      plan
    };
    maybeSaveIdempotentResponse(app, idempotency.key, 200, response);
    return response;
  });

  app.get("/v1/liquidity/state", async () => {
    await app.ctx.readModel.sync();
    return {
      liquidity: app.ctx.readModel.getLiquidity()
    };
  });

  app.post("/v1/lender/deposit", async (request) => {
    const payload = z
      .object({
        walletAddress: z.string().min(8),
        amountAlgo: z.number().positive()
      })
      .safeParse(request.body);
    if (!payload.success) {
      throw new ValidationError("Invalid deposit payload");
    }

    const walletFromToken = resolveWalletFromAuth(app, request);
    assertWalletMatch(app, walletFromToken, payload.data.walletAddress);

    const liquidity = await app.ctx.gateway.depositLiquidity(payload.data.walletAddress, payload.data.amountAlgo);
    await app.ctx.readModel.sync();
    return {
      success: true,
      liquidity
    };
  });

  app.post("/v1/lender/withdraw", async (request) => {
    const payload = z
      .object({
        walletAddress: z.string().min(8),
        amountAlgo: z.number().positive()
      })
      .safeParse(request.body);
    if (!payload.success) {
      throw new ValidationError("Invalid withdraw payload");
    }

    const walletFromToken = resolveWalletFromAuth(app, request);
    assertWalletMatch(app, walletFromToken, payload.data.walletAddress);

    const liquidity = await app.ctx.gateway.withdrawLiquidity(payload.data.walletAddress, payload.data.amountAlgo);
    await app.ctx.readModel.sync();
    return {
      success: true,
      liquidity
    };
  });

  app.post("/v1/admin/params", async (request) => {
    const payload = z
      .object({
        reserveRatio: z.number().min(0).max(0.5).optional(),
        paused: z.boolean().optional(),
        aprTable: z
          .object({
            NEW: z.number().min(0).max(80),
            EMERGING: z.number().min(0).max(80),
            TRUSTED: z.number().min(0).max(80)
          })
          .optional()
      })
      .safeParse(request.body);
    if (!payload.success) {
      throw new ValidationError("Invalid admin payload");
    }

    const next = payload.data as Partial<{ reserveRatio: number; paused: boolean; aprTable: ProtocolAprTable }>;
    const params = app.ctx.gateway.updateProtocolParams(next);
    await app.ctx.readModel.sync();
    return {
      success: true,
      params
    };
  });

  app.post("/v1/admin/settle-risk/:planId", async (request) => {
    const params = z
      .object({
        planId: z.string().min(8)
      })
      .safeParse(request.params);
    if (!params.success) {
      throw new ValidationError("Invalid plan id");
    }

    const plan = await app.ctx.gateway.settleRisk(params.data.planId);
    await app.ctx.readModel.sync();
    return {
      success: true,
      plan
    };
  });

  app.post("/v1/admin/keeper/run", async () => {
    const output = await app.ctx.riskKeeper.runOnce();
    return {
      success: true,
      ...output
    };
  });
};

export const buildServer = async (ctx: AppContext): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false }); // Disable default logger, use winston instead
  app.decorate("ctx", ctx);

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (ctx.config.corsOrigins.includes("*") || ctx.config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"), false);
    }
  });
  adminGuard(app, ctx.config.adminApiKey);
  rateLimitGuard(app);
  createRoutes(app);

  // Health check endpoint
  app.get("/health", async () => {
    // Test database connection if available
    if (ctx.config.databaseUrl) {
      try {
        await ctx.readModel.sync();
        return {
          status: "ok",
          database: "connected"
        };
      } catch (error) {
        logger.error("Health check failed - database connection error", { error });
        return {
          status: "degraded",
          database: "disconnected"
        };
      }
    }
    return {
      status: "ok",
      database: "not_configured"
    };
  });

  app.setErrorHandler((error, request, reply) => {
    // Handle insufficient liquidity errors (hide internal details)
    if (error instanceof InsufficientPoolLiquidityError) {
      logger.error("Liquidity shortfall during checkout commit", {
        code: error.code,
        detail: error.detail,
        url: request.url,
        method: request.method
      });
      void reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: USER_SAFE_ERROR_MESSAGE,
          details: null
        }
      });
      return;
    }

    // Handle all AppError subclasses (ValidationError, NotFoundError, BlockchainError, etc.)
    if (error instanceof AppError) {
      logger.error(error.message, {
        code: error.code,
        statusCode: error.statusCode,
        detail: error.detail,
        url: request.url,
        method: request.method
      });
      void reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.detail ?? null
        }
      });
      return;
    }

    // Handle unexpected errors
    logger.error("Unhandled exception", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      url: request.url,
      method: request.method
    });
    void reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: USER_SAFE_ERROR_MESSAGE,
        details: null
      }
    });
  });

  return app;
};
