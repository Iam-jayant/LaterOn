import type { ApiConfig } from "../config";
import { logger } from "../lib/logger";
import { nowUnix } from "../lib/time";

interface CoinGeckoPriceResponse {
  algorand: {
    inr: number;
  };
}

interface RateCache {
  rate: number;
  expiresAtUnix: number;
}

export class CoinGeckoService {
  private rateCache: RateCache | null = null;

  public constructor(private readonly config: ApiConfig) {}

  /**
   * Fetch the current ALGO to INR exchange rate from CoinGecko API.
   * Returns cached rate if available and not expired.
   * Falls back to configured default rate if API is unavailable.
   */
  public async getAlgoToInrRate(): Promise<number> {
    // Return cached rate if still valid
    if (this.rateCache && this.rateCache.expiresAtUnix > nowUnix()) {
      logger.debug("Using cached ALGO/INR rate", { rate: this.rateCache.rate });
      return this.rateCache.rate;
    }

    try {
      logger.info("Fetching ALGO/INR rate from CoinGecko");

      const response = await fetch(
        `${this.config.coinGeckoBaseUrl}/simple/price?ids=algorand&vs_currencies=inr`
      );

      if (!response.ok) {
        logger.warn("CoinGecko API request failed, using fallback rate", {
          status: response.status,
          fallbackRate: this.config.coinGeckoFallbackRate
        });
        return this.config.coinGeckoFallbackRate;
      }

      const data = (await response.json()) as CoinGeckoPriceResponse;
      const rate = data.algorand.inr;

      if (!rate || typeof rate !== "number" || rate <= 0) {
        logger.warn("Invalid rate from CoinGecko, using fallback rate", {
          receivedRate: rate,
          fallbackRate: this.config.coinGeckoFallbackRate
        });
        return this.config.coinGeckoFallbackRate;
      }

      // Cache the rate
      const expiresAtUnix = nowUnix() + this.config.coinGeckoRateCacheTtlSeconds;
      this.rateCache = {
        rate,
        expiresAtUnix
      };

      logger.info("ALGO/INR rate fetched successfully", {
        rate,
        cacheExpiresIn: this.config.coinGeckoRateCacheTtlSeconds
      });

      return rate;
    } catch (error) {
      logger.error("CoinGecko API error, using fallback rate", {
        error,
        fallbackRate: this.config.coinGeckoFallbackRate
      });
      return this.config.coinGeckoFallbackRate;
    }
  }

  /**
   * Convert INR amount to ALGO using the current exchange rate.
   * @param inr Amount in INR
   * @returns Equivalent amount in ALGO
   */
  public async convertInrToAlgo(inr: number): Promise<number> {
    const rate = await this.getAlgoToInrRate();
    const algo = inr / rate;
    
    logger.debug("Converted INR to ALGO", { inr, rate, algo });
    return algo;
  }

  /**
   * Convert ALGO amount to INR using the current exchange rate.
   * @param algo Amount in ALGO
   * @returns Equivalent amount in INR
   */
  public async convertAlgoToInr(algo: number): Promise<number> {
    const rate = await this.getAlgoToInrRate();
    const inr = algo * rate;
    
    logger.debug("Converted ALGO to INR", { algo, rate, inr });
    return inr;
  }
}
