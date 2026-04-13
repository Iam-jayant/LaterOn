import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger.js";

/**
 * Supabase client for database operations
 * Uses service role key for full database access (bypasses RLS)
 */
export class SupabaseClientWrapper {
  private client: SupabaseClient | null = null;

  constructor(
    private readonly supabaseUrl: string,
    private readonly supabaseServiceKey: string
  ) {}

  async init(): Promise<void> {
    try {
      this.client = createClient(this.supabaseUrl, this.supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      // Test connection
      const { error } = await this.client.from("users").select("count").limit(1);
      if (error) {
        logger.error("Supabase connection test failed", { error });
        throw error;
      }

      logger.info("Supabase client initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize Supabase client", { error });
      throw error;
    }
  }

  getClient(): SupabaseClient {
    if (!this.client) {
      throw new Error("Supabase client not initialized. Call init() first.");
    }
    return this.client;
  }

  async close(): Promise<void> {
    // Supabase JS client doesn't need explicit closing
    this.client = null;
  }
}
