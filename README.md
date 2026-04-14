# LaterOn - Decentralized BNPL Platform

<div align="center">

![LaterOn Logo](apps/web/public/images/logo.png)

**Buy Now, Pay Later on the Blockchain**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Algorand](https://img.shields.io/badge/Algorand-TestNet-00D1B2)](https://testnet.algoexplorer.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.0-black)](https://nextjs.org/)

[Features](#features) • [Architecture](#architecture) • [Getting Started](#getting-started) • [Documentation](#documentation)

</div>

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Smart Contracts](#smart-contracts)
- [API Documentation](#api-documentation)
- [Environment Variables](#environment-variables)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## 🌟 Overview

**LaterOn** is a decentralized Buy Now, Pay Later (BNPL) platform built on the Algorand blockchain. It enables users to purchase gift cards and other products with flexible installment payments, while maintaining transparency and security through blockchain technology.

### Key Highlights

- 🔐 **Decentralized**: Built on Algorand blockchain for transparency and security
- 💳 **Flexible Payments**: Split purchases into 3 monthly installments
- 🎁 **Instant Delivery**: Gift cards delivered immediately after first payment
- 📊 **Credit Scoring**: On-chain credit score system using Algorand ASAs
- 🔒 **DPDP Compliant**: Follows India's Digital Personal Data Protection Act 2023
- ⚡ **Fast**: Transactions confirm in ~4 seconds on Algorand

---

## ✨ Features

### For Users

- **🛍️ Marketplace**: Browse and purchase gift cards from popular brands
- **💰 BNPL Checkout**: Pay 1/3 upfront, rest in 2 monthly installments
- **📱 Wallet Integration**: Connect with Pera Wallet, Defly, or other Algorand wallets
- **📊 Dashboard**: Track active plans, payment history, and credit score
- **🎯 Credit Score**: Earn better terms with on-time payments
- **🔔 Notifications**: Get reminders for upcoming payments

### For Merchants

- **💵 Instant Payment**: Receive full amount immediately
- **📈 Analytics**: Track sales and customer behavior
- **🔌 API Integration**: Easy integration with existing systems
- **🛡️ Risk-Free**: Platform handles all credit risk

### For Developers

- **🔧 Smart Contracts**: PyTeal-based contracts for BNPL logic
- **📚 SDK**: TypeScript SDK for easy integration
- **🔗 REST API**: Comprehensive API for all operations
- **📖 Documentation**: Detailed docs and examples

---

## 🏗️ Architecture

### System Overview

```
┌─────────────┐
│   User      │
│  (Wallet)   │
└──────┬──────┘
       │ 1. Pay 1st EMI
       ↓
┌─────────────┐
│  LaterOn    │
│   Pool      │
└──────┬──────┘
       │ 2. Pay Full Amount
       ↓
┌─────────────┐
│  Merchant   │
│  (Reloadly) │
└──────┬──────┘
       │ 3. Deliver Gift Card
       ↓
┌─────────────┐
│    User     │
└─────────────┘
```

### Transaction Flow

1. **User Payment**: User pays first installment (1/3) to pool
2. **Pool Payment**: Backend automatically pays full amount to merchant
3. **Gift Card Delivery**: Merchant delivers gift card to user
4. **Plan Creation**: BNPL plan created with 2 remaining installments
5. **Future Payments**: User pays remaining installments over 2 months

### Components

- **Frontend**: Next.js 15 with TypeScript
- **Backend API**: Hono.js REST API
- **Smart Contracts**: PyTeal contracts on Algorand
- **Database**: Supabase (PostgreSQL)
- **Blockchain**: Algorand TestNet
- **Gift Cards**: Reloadly API integration

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: Next.js 15.5
- **Language**: TypeScript 5.0
- **Styling**: Tailwind CSS
- **Wallet**: @txnlab/use-wallet
- **State**: React Hooks

### Backend
- **Framework**: Hono.js
- **Runtime**: Node.js 22
- **Language**: TypeScript 5.0
- **Database**: Supabase (PostgreSQL)
- **ORM**: Direct SQL queries

### Blockchain
- **Network**: Algorand TestNet
- **SDK**: algosdk 3.5
- **Contracts**: PyTeal
- **Indexer**: Algorand Indexer

### Infrastructure
- **Monorepo**: Turborepo
- **Package Manager**: pnpm
- **CI/CD**: GitHub Actions (optional)
- **Hosting**: Vercel (frontend), Railway (backend)

---

## 🚀 Getting Started

### Prerequisites

- Node.js 22+ and pnpm
- Algorand wallet (Pera Wallet recommended)
- Supabase account
- Reloadly API credentials (for gift cards)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/lateron.git
   cd lateron
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   ```bash
   # API
   cp apps/api/.env.example apps/api/.env
   # Edit apps/api/.env with your credentials

   # Web
   cp apps/web/.env.example apps/web/.env.local
   # Edit apps/web/.env.local with your credentials
   ```

4. **Set up database**
   ```bash
   # Database migrations run automatically on API startup
   # Or run manually:
   pnpm --filter @lateron/api db:migrate
   ```

5. **Start development servers**
   ```bash
   # Start all services
   pnpm dev

   # Or start individually:
   pnpm dev:api    # API server (port 4000)
   pnpm dev:web    # Web app (port 3000)
   ```

6. **Access the application**
   - Web App: http://localhost:3000
   - API: http://localhost:4000
   - API Docs: http://localhost:4000/docs

---

## 📁 Project Structure

```
lateron/
├── apps/
│   ├── api/                    # Backend API
│   │   ├── src/
│   │   │   ├── routes/        # API endpoints
│   │   │   ├── services/      # Business logic
│   │   │   ├── db/            # Database layer
│   │   │   └── lib/           # Utilities
│   │   ├── .env.example       # Environment template
│   │   └── package.json
│   │
│   ├── web/                    # Frontend application
│   │   ├── src/
│   │   │   ├── app/           # Next.js app router
│   │   │   ├── components/    # React components
│   │   │   ├── hooks/         # Custom hooks
│   │   │   └── lib/           # Utilities
│   │   └── package.json
│   │
│   └── admin/                  # Admin dashboard (optional)
│
├── packages/
│   ├── contracts/              # Smart contracts
│   │   ├── src/lateron/       # PyTeal contracts
│   │   └── artifacts/         # Compiled TEAL
│   │
│   └── sdk/                    # TypeScript SDK
│       └── src/               # SDK source
│
├── .gitignore
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

---

## 📜 Smart Contracts

### BNPL Contract

**App ID**: `758251644` (TestNet)

**Methods**:
- `create_plan`: Create new BNPL plan
- `repay_installment`: Record installment payment
- `settle_risk`: Handle late/defaulted payments
- `set_paused`: Emergency pause (admin only)

**Storage**:
- Global state: Protocol parameters
- Box storage: Individual plan data
- User boxes: Outstanding balances

### Pool Contract

**App ID**: `758251656` (TestNet)

**Methods**:
- `deposit`: Add liquidity to pool
- `lend_out`: Lend to borrowers
- `record_repayment`: Track repayments
- `set_paused`: Emergency pause (admin only)

---

## 🔌 API Documentation

### Base URL
```
Development: http://localhost:4000
Production: https://api.lateron.app
```

### Authentication
```bash
# Get auth challenge
POST /api/auth/challenge
{
  "walletAddress": "ALGORAND_ADDRESS"
}

# Submit signed challenge
POST /api/auth/verify
{
  "walletAddress": "ALGORAND_ADDRESS",
  "signature": "BASE64_SIGNATURE"
}
```

### Marketplace Endpoints

```bash
# Get gift card catalog
GET /api/marketplace/catalog

# Create quote
POST /api/marketplace/quote
{
  "walletAddress": "ADDRESS",
  "productId": 3695,
  "denomination": 20
}

# Prepare checkout
POST /api/marketplace/checkout/prepare
{
  "quoteId": "quote_xxx"
}

# Confirm checkout
POST /api/marketplace/checkout/confirm
{
  "quoteId": "quote_xxx",
  "signedTransactions": ["BASE64_TX"]
}
```

### User Endpoints

```bash
# Get user profile
GET /api/users/:walletAddress

# Get user plans
GET /api/users/:walletAddress/plans

# Get gift cards
GET /api/users/:walletAddress/gift-cards
```

---

## 🔐 Environment Variables

### Required Variables

See `.env.example` files in each app for complete list.

**Critical Variables**:
- `RELAYER_MNEMONIC`: Pool account mnemonic (25 words)
- `LENDING_POOL_ADDRESS`: Pool Algorand address
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase admin key
- `RELOADLY_CLIENT_ID`: Reloadly API client ID
- `RELOADLY_CLIENT_SECRET`: Reloadly API secret

---

## 💻 Development

### Running Tests
```bash
# Run all tests
pnpm test

# Run API tests
pnpm --filter @lateron/api test

# Run web tests
pnpm --filter @lateron/web test
```

### Building
```bash
# Build all apps
pnpm build

# Build specific app
pnpm --filter @lateron/api build
pnpm --filter @lateron/web build
```

### Linting
```bash
# Lint all code
pnpm lint

# Fix linting issues
pnpm lint:fix
```

### Database Migrations
```bash
# Run migrations
pnpm --filter @lateron/api db:migrate

# Create new migration
pnpm --filter @lateron/api db:migration:create <name>
```

---

## 🧪 Testing

### Test Coverage

- Unit tests for business logic
- Integration tests for API endpoints
- E2E tests for critical user flows
- Smart contract tests with PyTest

### Running Specific Tests

```bash
# API tests
cd apps/api
pnpm test

# Web tests
cd apps/web
pnpm test

# Contract tests
cd packages/contracts
pytest
```

---

## 🚢 Deployment

### Frontend (Vercel)

1. Connect GitHub repository to Vercel
2. Set environment variables
3. Deploy automatically on push to main

### Backend (Railway/Render)

1. Connect GitHub repository
2. Set environment variables
3. Configure build command: `pnpm --filter @lateron/api build`
4. Configure start command: `pnpm --filter @lateron/api start`

### Smart Contracts

```bash
cd packages/contracts
python -m lateron.deploy
```

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write/update tests
5. Submit a pull request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Algorand Foundation** for blockchain infrastructure
- **Reloadly** for gift card API
- **Supabase** for database hosting
- **Vercel** for frontend hosting

---

## 📞 Contact

- **Website**: https://lateron.app
- **Email**: support@lateron.app
- **Twitter**: [@LaterOnApp](https://twitter.com/LaterOnApp)
- **Discord**: [Join our community](https://discord.gg/lateron)

---

<div align="center">

**Built with ❤️ on Algorand**

[⬆ Back to Top](#lateron---decentralized-bnpl-platform)

</div>
