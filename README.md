# LaterOn

**Mint now. Settle later.**

LaterOn is an Algorand-based Buy Now Pay Later (BNPL) protocol that enables users to make purchases with partial upfront payment and repay the balance in installments while building on-chain trust through repayment behavior.

## 🏗️ Project Structure

This monorepo contains the complete LaterOn v1 implementation:

- **`apps/web`** - Borrower web application with modern landing page (Next.js 13+)
- **`apps/admin`** - Protocol administration dashboard (Next.js)
- **`apps/api`** - Backend API for checkout, quotes, repayments, risk management, and liquidity (Fastify + TypeScript)
- **`packages/sdk`** - Shared domain types and utilities for repayment/risk calculations
- **`packages/contracts`** - Algorand smart contracts (Python/AlgoKit)
- **`.kiro/specs`** - Technical specifications and implementation plans

## ✨ Key Features

### v1 Core Implementation
- **ALGO-only settlement** for checkout, lender liquidity, and repayments
- **INR display context** via off-chain signed quote snapshots
- **On-chain risk detection** with authoritative state transitions (`settle_risk`)
- **Liquidity management** with graceful handling of insufficient pool funds
- **Modern landing page** with neutral theme, interactive calculator, and responsive design

### Security & Authentication
- **Wallet authentication** via challenge/verify flow (`POST /v1/auth/challenge`, `POST /v1/auth/verify`)
- **Protected API routes** with bearer token authentication (`AUTH_REQUIRED=true`)
- **Merchant API security** with API key validation (`x-merchant-key`, `MERCHANT_AUTH_REQUIRED=true`)
- **Idempotency enforcement** for checkout and repayment operations (`x-idempotency-key`, `REQUIRE_IDEMPOTENCY=true`)
- **Rate limiting** with configurable per-minute request throttling (`RATE_LIMIT_PER_MINUTE`)

### Algorand TestNet Integration
- **Real contract relay** when chain mode is enabled (`CHAIN_ENABLED=true`)
- **Deployed contracts**: BNPL App (758208746), Pool App (758208757)
- **AlgoNode integration** via `https://testnet-api.algonode.cloud`
- **Health monitoring** at `GET /health` endpoint with chain readiness status
- **Development mode** with local simulation when chain is disabled

## 🚀 Quick Start

### Prerequisites

- **Node.js** 22+
- **pnpm** 10+
- **Python** 3.11+
- **AlgoKit CLI** 3.x
- **Docker Desktop** (for local Algorand localnet)

### Installation

```bash
# Install dependencies
pnpm install
```

### Running Applications

#### API Server
```bash
# Copy environment template
cp apps/api/.env.example apps/api/.env

# Start API server
pnpm --filter @lateron/api dev
```

#### Web Application (Borrower)
```bash
# Copy environment template (if needed)
cp apps/web/.env.example apps/web/.env.local

# Start web app
pnpm --filter @lateron/web dev
```

#### Admin Dashboard
```bash
pnpm --filter @lateron/admin dev
```

### Environment Configuration

Key environment variables for `apps/api/.env`:

```bash
# Chain Configuration
CHAIN_ENABLED=true
BNPL_APP_ID=758208746
POOL_APP_ID=758208757
ALGOD_ADDRESS=https://testnet-api.algonode.cloud
RELAYER_MNEMONIC=your_mnemonic_here

# Security
AUTH_REQUIRED=true
MERCHANT_AUTH_REQUIRED=true
REQUIRE_IDEMPOTENCY=true
RATE_LIMIT_PER_MINUTE=60

# Database (optional)
POSTGRES_ENABLED=false
```

## 🧪 Smart Contract Development

### Python Environment Setup
```bash
cd packages/contracts
poetry install
poetry run pytest
```

### Compile Contracts
```bash
cd packages/contracts
poetry run python compile_contracts.py
```

### Deploy to TestNet

**With environment variable:**
```bash
cd packages/contracts
DEPLOYER_MNEMONIC="your mnemonic here" poetry run python deploy_testnet.py \
  --expected-address CYPMTG3YHOOQSOFZRIAKJNP2TB2Z7WW3OYCTMYL33MKZQQ5HCRALVZTCEA
```

**Interactive mode:**
```bash
cd packages/contracts
poetry run python deploy_testnet.py \
  --interactive-mnemonic \
  --expected-address CYPMTG3YHOOQSOFZRIAKJNP2TB2Z7WW3OYCTMYL33MKZQQ5HCRALVZTCEA
```

**With private key:**
```bash
cd packages/contracts
DEPLOYER_PRIVATE_KEY="<base64-private-key>" poetry run python deploy_testnet.py \
  --expected-address CYPMTG3YHOOQSOFZRIAKJNP2TB2Z7WW3OYCTMYL33MKZQQ5HCRALVZTCEA
```

## 📚 Documentation

- **Specifications**: See `.kiro/specs/` for detailed technical specifications
- **API Health**: `GET /health` endpoint for system status
- **Landing Page**: Modern UI with neutral theme, interactive calculator, and responsive design

## 🛠️ Technology Stack

- **Frontend**: Next.js 13+ (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Fastify, TypeScript, Node.js
- **Blockchain**: Algorand (TestNet), AlgoKit, Python
- **Database**: PostgreSQL (optional read-model mirroring)
- **Package Manager**: pnpm (monorepo with workspaces)

## 📄 License

See [LICENSE](LICENSE) file for details.

## 🤝 Contributing

This is a production-oriented implementation. For contributions, please ensure:
- TypeScript compilation passes (`tsc --noEmit`)
- Code follows existing patterns and conventions
- All environment variables are documented
