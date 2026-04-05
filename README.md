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

### Gift Card Marketplace (Reloadly Integration)
- **Digital gift cards** from popular Indian brands (Amazon, Flipkart, Zomato, Swiggy, Myntra, Croma)
- **BNPL for gift cards** with 3-month installment plans
- **Instant fulfillment** with gift card codes and PINs delivered immediately after payment
- **Real-time currency conversion** using CoinGecko API for ALGO/INR exchange rates
- **Lending pool integration** for seamless merchant disbursement (R2PHG2AE5A53VASF6QVEMFXYM5KFLNTHKYQHZLMEO54L3NCKRFPY2BDP2A)
- **Search and filtering** for easy gift card discovery
- **Dashboard integration** to view purchased gift cards and payment schedules

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

# Reloadly API Configuration (Gift Card Marketplace)
RELOADLY_CLIENT_ID=TxLI0dH46VVYIbNPx0wj2JoBDzQhKm11
RELOADLY_CLIENT_SECRET=8rTpsH2X8P-7K7KW5lh9mdHDTOGBlR-blUyFc9OJlqjmU1bS59SULIsRXXmTnPD
RELOADLY_BASE_URL=https://giftcards-sandbox.reloadly.com
RELOADLY_AUTH_URL=https://auth.reloadly.com
RELOADLY_TOKEN_CACHE_TTL_SECONDS=3600

# CoinGecko API Configuration (Exchange Rates)
COINGECKO_BASE_URL=https://api.coingecko.com/api/v3
COINGECKO_RATE_CACHE_TTL_SECONDS=300
COINGECKO_FALLBACK_RATE=0.0022

# Marketplace Configuration
MARKETPLACE_MERCHANT_ID=reloadly
MARKETPLACE_TENURE_MONTHS=3
LENDING_POOL_ADDRESS=R2PHG2AE5A53VASF6QVEMFXYM5KFLNTHKYQHZLMEO54L3NCKRFPY2BDP2A
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

## 🎁 Gift Card Marketplace

The marketplace feature integrates Reloadly's gift card API with LaterOn's BNPL protocol, allowing users to purchase digital gift cards using installment payments.

### Reloadly Integration

**Authentication:**
- OAuth 2.0 client credentials flow
- Automatic token caching with TTL management
- Sandbox environment for testing

**Supported Brands:**
- Amazon India
- Flipkart
- Zomato
- Swiggy
- Myntra
- Croma

**API Endpoints:**
- `GET /api/marketplace/catalog` - Fetch available gift cards
- `POST /api/marketplace/quote` - Create BNPL quote with ALGO conversion
- `POST /api/marketplace/checkout` - Execute purchase with atomic transaction
- `GET /api/marketplace/gift-card/:planId` - Retrieve gift card details

### CoinGecko Integration

**Exchange Rate Service:**
- Real-time ALGO/INR exchange rates
- 5-minute rate caching for performance
- Fallback to default rate (0.0022 ALGO/INR) if API unavailable
- Automatic currency conversion for payment amounts

**API Endpoint:**
- `GET https://api.coingecko.com/api/v3/simple/price?ids=algorand&vs_currencies=inr`

### Lending Pool Setup

**TestNet Pool Address:**
```
R2PHG2AE5A53VASF6QVEMFXYM5KFLNTHKYQHZLMEO54L3NCKRFPY2BDP2A
```

**Pool Responsibilities:**
- Receives user installment payments
- Disburses merchant payments for gift card purchases
- Maintains liquidity for instant fulfillment
- Requires sufficient ALGO balance for demo operations

**Transaction Flow:**
1. User pays first installment to lending pool
2. Pool disburses full amount to merchant (Reloadly)
3. BNPL plan created on-chain with 3-month tenure
4. Gift card code and PIN delivered instantly

**Funding the Pool:**
```bash
# Send ALGO to pool address using Algorand wallet or CLI
goal clerk send \
  --from YOUR_ADDRESS \
  --to R2PHG2AE5A53VASF6QVEMFXYM5KFLNTHKYQHZLMEO54L3NCKRFPY2BDP2A \
  --amount 10000000 \
  --note "Pool funding"
```

### User Flow

1. **Browse Marketplace** - User lands on `/marketplace` after authentication
2. **Search & Filter** - Find gift cards using search bar in navbar
3. **Select Gift Card** - Choose brand and denomination (₹500, ₹1000, etc.)
4. **Pay in 3** - View installment breakdown with ALGO/INR amounts
5. **Connect Wallet** - Approve atomic transaction with Peria wallet
6. **Instant Delivery** - Receive gift card code and PIN immediately
7. **Track Payments** - View remaining installments on dashboard

### Security Considerations

- Gift card codes and PINs are never logged
- Idempotency keys prevent duplicate purchases
- Atomic transactions ensure payment and disbursement happen together
- Authorization checks prevent unauthorized gift card access
- Rate limiting protects against API abuse

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
