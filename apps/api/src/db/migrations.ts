import { Pool, PoolConfig } from "pg";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Database migration runner for LaterOn Streamlined MVP
 * 
 * Handles:
 * - Connection pooling configuration (min: 2, max: 10)
 * - Schema initialization from schema.sql
 * - Migration execution with error handling
 */

export interface MigrationConfig {
  databaseUrl: string;
  minConnections?: number;
  maxConnections?: number;
}

export class DatabaseMigrations {
  private pool: Pool;

  constructor(config: MigrationConfig) {
    const poolConfig: PoolConfig = {
      connectionString: config.databaseUrl,
      min: config.minConnections ?? 2,
      max: config.maxConnections ?? 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

    this.pool = new Pool(poolConfig);
  }

  /**
   * Run all migrations to setup database schema
   * Creates tables and indexes from schema.sql and additional migrations
   */
  async runMigrations(): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      console.log("[Migrations] Starting database migrations...");
      
      // Read schema.sql file
      const schemaPath = join(__dirname, "schema.sql");
      const schemaSql = readFileSync(schemaPath, "utf-8");
      
      // Execute schema creation
      await client.query("BEGIN");
      await client.query(schemaSql);
      
      // Run additional migrations
      await this.runAdditionalMigrations(client);
      
      await client.query("COMMIT");
      
      console.log("[Migrations] Database schema created successfully");
      
      // Verify tables exist
      await this.verifySchema(client);
      
      console.log("[Migrations] All migrations completed successfully");
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("[Migrations] Migration failed:", error);
      throw new Error(`Database migration failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      client.release();
    }
  }

  /**
   * Run additional migration files
   */
  private async runAdditionalMigrations(client: any): Promise<void> {
    const migrations = [
      "003_dpdp_consent_score_asa.sql",
      "004_add_user_profile_columns.sql"
    ];

    for (const migrationFile of migrations) {
      try {
        const migrationPath = join(__dirname, "migrations", migrationFile);
        const migrationSql = readFileSync(migrationPath, "utf-8");
        await client.query(migrationSql);
        console.log(`[Migrations] Applied migration: ${migrationFile}`);
      } catch (error) {
        console.error(`[Migrations] Failed to apply migration ${migrationFile}:`, error);
        throw error;
      }
    }
  }

  /**
   * Verify that all required tables exist
   */
  private async verifySchema(client: any): Promise<void> {
    const requiredTables = [
      "users", 
      "payment_plans", 
      "lender_deposits", 
      "gift_cards",
      "consent_records",
      "data_access_log"
    ];
    
    for (const tableName of requiredTables) {
      const result = await client.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )`,
        [tableName]
      );
      
      if (!result.rows[0].exists) {
        throw new Error(`Required table '${tableName}' does not exist`);
      }
    }
    
    console.log("[Migrations] Schema verification passed");
  }

  /**
   * Get the connection pool for use by repositories
   */
  getPool(): Pool {
    return this.pool;
  }

  /**
   * Close all database connections
   */
  async close(): Promise<void> {
    await this.pool.end();
    console.log("[Migrations] Database connections closed");
  }

  /**
   * Test database connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      await client.query("SELECT 1");
      client.release();
      return true;
    } catch (error) {
      console.error("[Migrations] Database connection test failed:", error);
      return false;
    }
  }
}

/**
 * Initialize database with migrations
 * Returns configured pool for use by application
 */
export async function initializeDatabase(config: MigrationConfig): Promise<Pool> {
  const migrations = new DatabaseMigrations(config);
  
  // Test connection first
  const isConnected = await migrations.testConnection();
  if (!isConnected) {
    throw new Error("Failed to connect to database");
  }
  
  // Run migrations
  await migrations.runMigrations();
  
  return migrations.getPool();
}
