# Database Setup

This directory contains the PostgreSQL database schema and migration tools for the LaterOn Streamlined MVP.

## Files

- `schema.sql` - Complete database schema with tables and indexes
- `migrations.ts` - Migration runner with connection pooling
- `postgres-mirror.ts` - Existing read model mirror (legacy)

## Usage

### Initialize Database

```typescript
import { initializeDatabase } from "./db/migrations";

// Initialize with connection pooling (min: 2, max: 10)
const pool = await initializeDatabase({
  databaseUrl: process.env.DATABASE_URL!,
  minConnections: 2,
  maxConnections: 10
});

// Use pool in repositories
const repository = new PostgresRepository(pool);
```

### Manual Migration

```typescript
import { DatabaseMigrations } from "./db/migrations";

const migrations = new DatabaseMigrations({
  databaseUrl: process.env.DATABASE_URL!
});

// Test connection
const isConnected = await migrations.testConnection();
console.log("Database connected:", isConnected);

// Run migrations
await migrations.runMigrations();

// Get pool for application use
const pool = migrations.getPool();

// Close connections on shutdown
await migrations.close();
```

## Schema Overview

### Tables

1. **users** - Borrower profiles and credit history
   - Primary key: `wallet_address`
   - Indexes: `idx_users_wallet`

2. **payment_plans** - BNPL payment plan records
   - Primary key: `plan_id`
   - Indexes: `idx_plans_plan_id`, `idx_plans_borrower`, `idx_plans_status`

3. **lender_deposits** - Liquidity provider deposits
   - Primary key: `id` (serial)
   - Indexes: `idx_deposits_lender`, `idx_deposits_tx_id`

## Connection Pooling

The migration runner configures PostgreSQL connection pooling with:
- **Min connections**: 2 (default)
- **Max connections**: 10 (default)
- **Idle timeout**: 30 seconds
- **Connection timeout**: 5 seconds

These settings ensure efficient connection reuse while preventing connection exhaustion.

## Environment Variables

Required environment variable:
```bash
DATABASE_URL=postgresql://user:password@localhost:5432/lateron
```

## Integration with Existing Code

The new schema is designed to work alongside the existing `postgres-mirror.ts` read model. The migration runner can be integrated into the application startup in `index.ts`:

```typescript
import { initializeDatabase } from "./db/migrations";
import { loadConfig } from "./config";

const config = loadConfig();

if (config.databaseUrl) {
  const pool = await initializeDatabase({
    databaseUrl: config.databaseUrl,
    minConnections: 2,
    maxConnections: 10
  });
  
  // Pass pool to repositories in app context
}
```
