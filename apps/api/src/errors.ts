export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly detail?: unknown;

  public constructor(message: string, code: string, statusCode: number, detail?: unknown) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.detail = detail;
  }
}

export class ValidationError extends AppError {
  public constructor(message: string, detail?: unknown) {
    super(message, "VALIDATION_ERROR", 400, detail);
  }
}

export class NotFoundError extends AppError {
  public constructor(message: string, detail?: unknown) {
    super(message, "NOT_FOUND", 404, detail);
  }
}

export class UnauthorizedError extends AppError {
  public constructor(message = "Unauthorized", detail?: unknown) {
    super(message, "UNAUTHORIZED", 401, detail);
  }
}

export class ForbiddenError extends AppError {
  public constructor(message = "Forbidden", detail?: unknown) {
    super(message, "FORBIDDEN", 403, detail);
  }
}

export class TooManyRequestsError extends AppError {
  public constructor(message = "Too many requests", detail?: unknown) {
    super(message, "RATE_LIMITED", 429, detail);
  }
}

export class InsufficientPoolLiquidityError extends AppError {
  public constructor(detail?: unknown) {
    super("Pool does not have enough ALGO liquidity", "LIQUIDITY_INSUFFICIENT", 500, detail);
  }
}

export class BlockchainError extends AppError {
  public constructor(message: string, detail?: unknown) {
    super(message, "BLOCKCHAIN_ERROR", 502, detail);
  }
}
