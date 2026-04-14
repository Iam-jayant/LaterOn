import { cors } from "hono/cors";
import { Hono } from "hono";
import { USER_SAFE_ERROR_MESSAGE, type ProtocolAprTable } from "@lateron/sdk";
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
import { registerMarketplaceRoutes } from "./routes/marketplace.js";
import { registerConsentRoutes } from "./routes/consent.js";
import { registerUserRoutes } from "./routes/user.js";

// Extend Hono context with AppContext
type HonoApp = Hono<{ Variables: { ctx: AppContext } }>;

const adminGuard = (app: HonoApp, key: string): void => {
  app.use("*", async (c, next) => {
    if (!c.req.path.startsWith("/v1/admin")) {
      return next();
    }
    const incoming = c.req.header("x-admin-key");
    if (incoming !== key) {
      throw new UnauthorizedError();
    }
    return next();
  });
};

const rateLimitGuard = (app: HonoApp): void => {
  app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/health")) {
      return next();
    }

    const identity = `${c.req.header("x-forwarded-for") ?? "unknown"}:${c.req.method}:${c.req.path.split("?")[0]}`;
    c.var.ctx.rateLimitService.checkOrThrow(identity, c.var.ctx.config.rateLimitPerMinute);
    return next();
  });
};

const normalizeHeader = (value: string | undefined): string | undefined => {
  return value;
};

const resolveWalletFromAuth = (c: any): string | undefined => {
  if (!c.var.ctx.config.authRequired) {
    return undefined;
  }

  const authHeader = normalizeHeader(c.req.header("authorization"));
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing Bearer token");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  return c.var.ctx.authService.verifyToken(token, c.var.ctx.config.authTokenSecret).walletAddress;
};

const assertWalletMatch = (c: any, authenticatedWallet: string | undefined, targetWallet: string): void => {
  if (!c.var.ctx.config.authRequired) {
    return;
  }
  if (!authenticatedWallet || authenticatedWallet !== targetWallet) {
    throw new ForbiddenError("Wallet token does not match the requested wallet");
  }
};

const assertMerchantAccess = (
  c: any,
  merchantId: string
): void => {
  if (!c.var.ctx.config.merchantAuthRequired) {
    return;
  }

  const incoming = normalizeHeader(c.req.header("x-merchant-key"));
  if (!incoming) {
    throw new UnauthorizedError("Merchant API key is required");
  }

  const expected = c.var.ctx.config.merchantApiKeys[merchantId];
  if (!expected || incoming !== expected) {
    throw new UnauthorizedError("Invalid merchant API key");
  }
};

const maybeReplayIdempotentResponse = (
  c: any,
  scope: string,
  identity: string
): { handled: true; response: Response } | { handled: false; key?: string } => {
  if (!c.var.ctx.config.requireIdempotency) {
    return {
      handled: false
    };
  }

  const incoming = normalizeHeader(c.req.header("x-idempotency-key"));
  const storageKey = `${scope}:${identity}:${incoming ?? ""}`;
  const cached = c.var.ctx.idempotencyService.getOrThrow(storageKey);
  if (!cached) {
    return {
      handled: false,
      key: storageKey
    };
  }

  return {
    handled: true,
    response: c.json(cached.body, cached.statusCode)
  };
};

const maybeSaveIdempotentResponse = (
  c: any,
  idempotencyKey: string | undefined,
  statusCode: number,
  body: unknown
): void => {
  if (!idempotencyKey) {
    return;
  }
  c.var.ctx.idempotencyService.save(idempotencyKey, {
    statusCode,
    body
  });
};

const createRoutes = (app: HonoApp): void => {
  // Register checkout routes
  registerCheckoutRoutes(app);

  // Register repayment routes
  registerRepaymentRoutes(app);

  // Register lender routes
  registerLenderRoutes(app);

  // Register admin routes
  registerAdminRoutes(app);

  // Register marketplace routes
  registerMarketplaceRoutes(app);

  // Register consent routes
  registerConsentRoutes(app);

  // Register user routes
  registerUserRoutes(app);

  app.post("/v1/auth/challenge", async (c) => {
    const body = await c.req.json();
    const payload = z
      .object({
        walletAddress: z.string().min(8)
      })
      .safeParse(body);
    if (!payload.success) {
      throw new ValidationError("Invalid auth challenge request", payload.error.flatten());
    }

    const challenge = c.var.ctx.authService.createChallenge(
      payload.data.walletAddress,
      c.var.ctx.config.authChallengeTtlSeconds
    );
    return c.json({
      challengeId: challenge.challengeId,
      walletAddress: challenge.walletAddress,
      message: challenge.message,
      expiresAtUnix: challenge.expiresAtUnix
    });
  });

  app.post("/v1/auth/verify", async (c) => {
    const body = await c.req.json();
    const payload = z
      .object({
        walletAddress: z.string().min(8),
        challengeId: z.string().min(10),
        signature: z.string().min(6)
      })
      .safeParse(body);
    if (!payload.success) {
      throw new ValidationError("Invalid auth verify request", payload.error.flatten());
    }

    const token = c.var.ctx.authService.verifyChallengeAndIssueToken({
      walletAddress: payload.data.walletAddress,
      challengeId: payload.data.challengeId,
      signature: payload.data.signature,
      secret: c.var.ctx.config.authTokenSecret,
      tokenTtlSeconds: c.var.ctx.config.authTokenTtlSeconds,
      allowDevBypass: c.var.ctx.config.devSignatureBypass
    });
    return c.json({
      walletAddress: payload.data.walletAddress,
      ...token
    });
  });

  app.post("/v1/quotes", async (c) => {
    const body = await c.req.json();
    const payload = z
      .object({
        walletAddress: z.string().min(8),
        merchantId: z.string().min(2),
        orderAmountInr: z.number().positive(),
        tenureMonths: z.number().int().positive().max(24)
      })
      .safeParse(body);
    if (!payload.success) {
      throw new ValidationError("Invalid quote request", payload.error.flatten());
    }

    const walletFromToken = resolveWalletFromAuth(c);
    assertWalletMatch(c, walletFromToken, payload.data.walletAddress);
    assertMerchantAccess(c, payload.data.merchantId);

    return c.json(c.var.ctx.quoteService.createQuote(payload.data));
  });

  app.post("/v1/checkout/commit", async (c) => {
    const body = await c.req.json();
    const payload = z
      .object({
        quoteId: z.string().min(10)
      })
      .safeParse(body);
    if (!payload.success) {
      throw new ValidationError("Invalid checkout request", payload.error.flatten());
    }

    const walletFromToken = resolveWalletFromAuth(c);
    const merchantKey = normalizeHeader(c.req.header("x-merchant-key")) ?? "none";

    const idempotency = maybeReplayIdempotentResponse(
      c,
      "checkout",
      `${walletFromToken ?? "anon"}:${payload.data.quoteId}:${merchantKey}`
    );
    if (idempotency.handled) {
      return idempotency.response;
    }

    const quote = c.var.ctx.gateway.getQuote(payload.data.quoteId);
    assertWalletMatch(c, walletFromToken, quote.walletAddress);
    assertMerchantAccess(c, quote.merchantId);

    const plan = await c.var.ctx.gateway.createPlanFromQuote(payload.data.quoteId);
    await c.var.ctx.readModel.sync();
    const response = {
      success: true,
      plan
    };
    maybeSaveIdempotentResponse(c, idempotency.key, 200, response);
    return c.json(response);
  });

  app.get("/v1/plans", async (c) => {
    const query = z
      .object({
        walletAddress: z.string().min(8)
      })
      .safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
    if (!query.success) {
      throw new ValidationError("walletAddress query param is required");
    }

    const walletFromToken = resolveWalletFromAuth(c);
    assertWalletMatch(c, walletFromToken, query.data.walletAddress);

    // If using Supabase repository, query directly from database
    // Otherwise fall back to read model (in-memory)
    if (c.var.ctx.repository) {
      const plans = await c.var.ctx.repository.getPlansByWallet(query.data.walletAddress);
      const user = await c.var.ctx.repository.getOrCreateUser(query.data.walletAddress);
      return c.json({ plans, user });
    }

    // Fallback to in-memory read model
    await c.var.ctx.readModel.sync();
    return c.json({
      plans: c.var.ctx.readModel.getPlansByWallet(query.data.walletAddress),
      user: c.var.ctx.readModel.getUser(query.data.walletAddress) ?? c.var.ctx.gateway.getOrCreateUser(query.data.walletAddress)
    });
  });

  app.post("/v1/plans/:planId/repay", async (c) => {
    const params = z
      .object({
        planId: z.string().min(8)
      })
      .safeParse(c.req.param());
    const body = await c.req.json();
    const payload = z
      .object({
        amountAlgo: z.number().positive()
      })
      .safeParse(body);

    if (!params.success || !payload.success) {
      throw new ValidationError("Invalid repayment payload");
    }

    const existingPlan = await c.var.ctx.gateway.getPlan(params.data.planId);
    const walletFromToken = resolveWalletFromAuth(c);
    assertWalletMatch(c, walletFromToken, existingPlan.walletAddress);

    const idempotency = maybeReplayIdempotentResponse(
      c,
      "repay",
      existingPlan.walletAddress
    );
    if (idempotency.handled) {
      return idempotency.response;
    }

    const plan = await c.var.ctx.gateway.repayInstallment(params.data.planId, payload.data.amountAlgo);
    await c.var.ctx.readModel.sync();
    const response = {
      success: true,
      plan
    };
    maybeSaveIdempotentResponse(c, idempotency.key, 200, response);
    return c.json(response);
  });

  app.get("/v1/liquidity/state", async (c) => {
    await c.var.ctx.readModel.sync();
    return c.json({
      liquidity: c.var.ctx.readModel.getLiquidity()
    });
  });

  app.post("/v1/lender/deposit", async (c) => {
    const body = await c.req.json();
    const payload = z
      .object({
        walletAddress: z.string().min(8),
        amountAlgo: z.number().positive()
      })
      .safeParse(body);
    if (!payload.success) {
      throw new ValidationError("Invalid deposit payload");
    }

    const walletFromToken = resolveWalletFromAuth(c);
    assertWalletMatch(c, walletFromToken, payload.data.walletAddress);

    const liquidity = await c.var.ctx.gateway.depositLiquidity(payload.data.walletAddress, payload.data.amountAlgo);
    await c.var.ctx.readModel.sync();
    return c.json({
      success: true,
      liquidity
    });
  });

  app.post("/v1/lender/withdraw", async (c) => {
    const body = await c.req.json();
    const payload = z
      .object({
        walletAddress: z.string().min(8),
        amountAlgo: z.number().positive()
      })
      .safeParse(body);
    if (!payload.success) {
      throw new ValidationError("Invalid withdraw payload");
    }

    const walletFromToken = resolveWalletFromAuth(c);
    assertWalletMatch(c, walletFromToken, payload.data.walletAddress);

    const liquidity = await c.var.ctx.gateway.withdrawLiquidity(payload.data.walletAddress, payload.data.amountAlgo);
    await c.var.ctx.readModel.sync();
    return c.json({
      success: true,
      liquidity
    });
  });

  app.post("/v1/admin/params", async (c) => {
    const body = await c.req.json();
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
      .safeParse(body);
    if (!payload.success) {
      throw new ValidationError("Invalid admin payload");
    }

    const next = payload.data as Partial<{ reserveRatio: number; paused: boolean; aprTable: ProtocolAprTable }>;
    const params = c.var.ctx.gateway.updateProtocolParams(next);
    await c.var.ctx.readModel.sync();
    return c.json({
      success: true,
      params
    });
  });

  app.post("/v1/admin/settle-risk/:planId", async (c) => {
    const params = z
      .object({
        planId: z.string().min(8)
      })
      .safeParse(c.req.param());
    if (!params.success) {
      throw new ValidationError("Invalid plan id");
    }

    const plan = await c.var.ctx.gateway.settleRisk(params.data.planId);
    await c.var.ctx.readModel.sync();
    return c.json({
      success: true,
      plan
    });
  });

  app.post("/v1/admin/keeper/run", async (c) => {
    const output = await c.var.ctx.riskKeeper.runOnce();
    return c.json({
      success: true,
      ...output
    });
  });
};

export const buildServer = (ctx: AppContext): HonoApp => {
  const app = new Hono<{ Variables: { ctx: AppContext } }>();

  // Set context in variables
  app.use("*", async (c, next) => {
    c.set("ctx", ctx);
    return next();
  });

  // CORS middleware
  app.use("*", cors({
    origin: (origin) => {
      if (!origin) {
        return "*";
      }

      if (ctx.config.corsOrigins.includes("*") || ctx.config.corsOrigins.includes(origin)) {
        return origin;
      }

      return null;
    }
  }));

  adminGuard(app, ctx.config.adminApiKey);
  rateLimitGuard(app);
  createRoutes(app);

  // Health check endpoint
  app.get("/health", async (c) => {
    // Test database connection if available (PostgreSQL or Supabase)
    const hasDatabase = ctx.config.databaseUrl || 
                       (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
    
    if (hasDatabase) {
      try {
        // Test database with a simple query
        if (ctx.repository && ctx.repository.healthCheck) {
          await ctx.repository.healthCheck();
        } else if (ctx.readModel) {
          await ctx.readModel.sync();
        }
        return c.json({
          status: "ok",
          database: "connected"
        });
      } catch (error) {
        logger.error("Health check failed - database connection error", { error });
        return c.json({
          status: "degraded",
          database: "disconnected"
        });
      }
    }
    return c.json({
      status: "ok",
      database: "not_configured"
    });
  });

  // Error handler
  app.onError((error, c) => {
    // Handle insufficient liquidity errors (hide internal details)
    if (error instanceof InsufficientPoolLiquidityError) {
      logger.error("Liquidity shortfall during checkout commit", {
        code: error.code,
        detail: error.detail,
        url: c.req.url,
        method: c.req.method
      });
      return c.json({
        error: {
          code: "INTERNAL_ERROR",
          message: USER_SAFE_ERROR_MESSAGE,
          details: null
        }
      }, 500);
    }

    // Handle all AppError subclasses (ValidationError, NotFoundError, BlockchainError, etc.)
    if (error instanceof AppError) {
      logger.error(error.message, {
        code: error.code,
        statusCode: error.statusCode,
        detail: error.detail,
        url: c.req.url,
        method: c.req.method
      });
      return c.json({
        error: {
          code: error.code,
          message: error.message,
          details: error.detail ?? null
        }
      }, error.statusCode as any);
    }

    // Handle unexpected errors
    logger.error("Unhandled exception", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      url: c.req.url,
      method: c.req.method
    });
    return c.json({
      error: {
        code: "INTERNAL_ERROR",
        message: USER_SAFE_ERROR_MESSAGE,
        details: null
      }
    }, 500);
  });

  return app;
};
