# LaterOn

Mint now. Settle later.

LaterOn is an Algorand-based BNPL protocol where users pay partly upfront and repay the rest in installments while building on-chain trust through repayment behavior.

## v1 Implementation Status

This repository now contains a production-oriented monorepo baseline for the ALGO-only v1 scope:

- `apps/web`: borrower + landing UX (Next.js)
- `apps/admin`: protocol admin surface (Next.js)
- `apps/api`: checkout, quote, repayment, risk keeper, liquidity APIs (TypeScript/Fastify), and optional Postgres read-model mirroring
- `packages/sdk`: shared domain types and repayment/risk utilities
- `packages/contracts`: Algorand contract + rules scaffolding (Python)

## Core v1 Decisions

- ALGO-only settlement for checkout, lender liquidity, and repayments
- INR shown as display/conversion context only (off-chain signed quote snapshots)
- Risk detection may happen off-chain, but authoritative state transitions are materialized on-chain (`settle_risk`)
- If pool liquidity is insufficient, checkout returns a generic internal error message to user while logging structured diagnostics

## API Security Baseline (Implemented)

- Wallet auth challenge/verify endpoints:
  - `POST /v1/auth/challenge`
  - `POST /v1/auth/verify`
- Protected borrower/lender API routes require bearer token when `AUTH_REQUIRED=true`
- Merchant-facing checkout/quote routes enforce `x-merchant-key` when `MERCHANT_AUTH_REQUIRED=true`
- Checkout and repayment routes enforce idempotency via `x-idempotency-key` when `REQUIRE_IDEMPOTENCY=true`
- Global per-minute request throttling is active via `RATE_LIMIT_PER_MINUTE`

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 10+
- Python 3.11+
- AlgoKit CLI 3.x (upgrade recommended; current machine may still be on 2.x)
- Docker Desktop running (required for local Algorand localnet workflows)

### Install

```bash
pnpm install
```

### Run API

```bash
pnpm --filter @lateron/api dev
```

Copy API env template before running:

```bash
cp apps/api/.env.example apps/api/.env
```

### Run borrower web app

```bash
pnpm --filter @lateron/web dev
```

### Run admin app

```bash
pnpm --filter @lateron/admin dev
```

## Test

```bash
pnpm test
```

Contract-side Python tests:

```bash
cd packages/contracts
poetry install
poetry run pytest
```
