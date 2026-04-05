import type { ApiConfig } from "../config";
import { logger } from "../lib/logger";
import { nowUnix } from "../lib/time";
import {
  parseReloadlyCatalog,
  parseReloadlyFulfillment,
  type ParsedReloadlyProduct,
  type ParsedReloadlyFulfillment,
  type RawReloadlyCatalogResponse,
  type RawReloadlyFulfillmentResponse
} from "../lib/reloadly-types";

export interface ReloadlyPurchaseRequest {
  productId: number;
  countryCode: string;
  quantity: number;
  unitPrice: number;
  customIdentifier: string;
}

interface ReloadlyAuthResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface TokenCache {
  accessToken: string;
  expiresAtUnix: number;
}

export class ReloadlyService {
  private tokenCache: TokenCache | null = null;

  public constructor(private readonly config: ApiConfig) {}

  /**
   * Authenticate with Reloadly API using OAuth 2.0 client credentials flow.
   * Caches the access token until expiration.
   */
  public async authenticate(): Promise<void> {
    try {
      logger.info("Authenticating with Reloadly API");

      const response = await fetch(`${this.config.reloadlyAuthUrl}/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          client_id: this.config.reloadlyClientId,
          client_secret: this.config.reloadlyClientSecret,
          grant_type: "client_credentials",
          audience: this.config.reloadlyBaseUrl
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("Reloadly authentication failed", {
          status: response.status,
          error: errorText
        });
        throw new Error(`Reloadly authentication failed: ${response.status}`);
      }

      const data = (await response.json()) as ReloadlyAuthResponse;
      const expiresAtUnix = nowUnix() + data.expires_in - 60; // Subtract 60s buffer

      this.tokenCache = {
        accessToken: data.access_token,
        expiresAtUnix
      };

      logger.info("Reloadly authentication successful", {
        expiresIn: data.expires_in
      });
    } catch (error) {
      logger.error("Reloadly authentication error", { error });
      throw error;
    }
  }

  /**
   * Fetch gift card products from Reloadly API for a specific country.
   * Automatically authenticates if no valid token is cached.
   * Parses and validates the response using parseReloadlyCatalog.
   */
  public async getProducts(countryCode: string): Promise<ParsedReloadlyProduct[]> {
    await this.ensureAuthenticated();

    try {
      logger.info("Fetching Reloadly products", { countryCode });

      const response = await fetch(
        `${this.config.reloadlyBaseUrl}/products?countryCode=${countryCode}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.tokenCache!.accessToken}`,
            "Content-Type": "application/json"
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("Reloadly products fetch failed", {
          status: response.status,
          error: errorText
        });
        throw new Error(`Failed to fetch gift card catalog. Please try again later.`);
      }

      // Parse response text to detect malformed JSON
      const responseText = await response.text();
      let rawData: RawReloadlyCatalogResponse;
      
      try {
        rawData = JSON.parse(responseText) as RawReloadlyCatalogResponse;
      } catch (jsonError) {
        logger.error("Reloadly products response is malformed JSON", {
          error: jsonError instanceof Error ? jsonError.message : String(jsonError),
          responsePreview: responseText.substring(0, 200)
        });
        throw new Error("Received invalid response from gift card service. Please try again later.");
      }

      // Parse and validate catalog using parser
      try {
        const products = parseReloadlyCatalog(rawData);
        logger.info("Reloadly products fetched and parsed successfully", {
          count: products.length
        });
        return products;
      } catch (parseError) {
        logger.error("Failed to parse Reloadly catalog response", {
          error: parseError instanceof Error ? parseError.message : String(parseError),
          rawDataPreview: JSON.stringify(rawData).substring(0, 200)
        });
        throw new Error("Gift card catalog data is invalid. Please try again later.");
      }
    } catch (error) {
      // Re-throw if already a user-friendly error
      if (error instanceof Error && error.message.includes("Please try again later")) {
        throw error;
      }
      
      logger.error("Reloadly products fetch error", { error });
      throw new Error("Unable to fetch gift card catalog. Please try again later.");
    }
  }

  /**
   * Purchase a gift card from Reloadly API.
   * Automatically authenticates if no valid token is cached.
   * Parses and validates the response using parseReloadlyFulfillment.
   */
  public async purchaseGiftCard(
    request: ReloadlyPurchaseRequest
  ): Promise<ParsedReloadlyFulfillment> {
    await this.ensureAuthenticated();

    try {
      logger.info("Purchasing gift card from Reloadly", {
        productId: request.productId,
        unitPrice: request.unitPrice,
        customIdentifier: request.customIdentifier
      });

      const response = await fetch(`${this.config.reloadlyBaseUrl}/orders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.tokenCache!.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("Reloadly gift card purchase failed", {
          status: response.status,
          error: errorText,
          productId: request.productId
        });
        throw new Error(`Failed to purchase gift card. Please try again later.`);
      }

      // Parse response text to detect malformed JSON
      const responseText = await response.text();
      let rawData: RawReloadlyFulfillmentResponse;
      
      try {
        rawData = JSON.parse(responseText) as RawReloadlyFulfillmentResponse;
      } catch (jsonError) {
        logger.error("Reloadly fulfillment response is malformed JSON", {
          error: jsonError instanceof Error ? jsonError.message : String(jsonError),
          responsePreview: responseText.substring(0, 200),
          productId: request.productId
        });
        throw new Error("Received invalid response from gift card service. Please contact support.");
      }

      // Parse and validate fulfillment using parser
      try {
        const fulfillment = parseReloadlyFulfillment(rawData);
        
        logger.info("Reloadly gift card purchased and parsed successfully", {
          transactionId: fulfillment.transactionId,
          productName: fulfillment.productName,
          hasCode: fulfillment.code.length > 0,
          hasPin: fulfillment.pin.length > 0
        });
        
        return fulfillment;
      } catch (parseError) {
        const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
        
        logger.error("Failed to parse Reloadly fulfillment response", {
          error: errorMessage,
          productId: request.productId,
          rawDataPreview: JSON.stringify(rawData).substring(0, 200)
        });
        
        // Provide specific error messages based on parsing failure
        if (errorMessage.includes("cardNumber") || errorMessage.includes("code")) {
          throw new Error("Gift card code is missing from the response. Please contact support.");
        }
        if (errorMessage.includes("pinCode") || errorMessage.includes("PIN")) {
          throw new Error("Gift card PIN is missing from the response. Please contact support.");
        }
        if (errorMessage.includes("transactionId")) {
          throw new Error("Transaction ID is missing from the response. Please contact support.");
        }
        
        throw new Error("Gift card data is invalid. Please contact support.");
      }
    } catch (error) {
      // Re-throw if already a user-friendly error
      if (error instanceof Error && (error.message.includes("Please try again later") || error.message.includes("Please contact support"))) {
        throw error;
      }
      
      logger.error("Reloadly gift card purchase error", { 
        error,
        productId: request.productId
      });
      throw new Error("Unable to purchase gift card. Please try again later.");
    }
  }

  /**
   * Check if the service has a valid cached authentication token.
   */
  public isAuthenticated(): boolean {
    if (!this.tokenCache) {
      return false;
    }
    return this.tokenCache.expiresAtUnix > nowUnix();
  }

  /**
   * Ensure the service is authenticated before making API calls.
   * Automatically re-authenticates if the token is expired or missing.
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.isAuthenticated()) {
      await this.authenticate();
    }
  }
}
