/**
 * Reloadly API Type Definitions and Parsers
 * 
 * This module provides TypeScript interfaces and parser functions for Reloadly API responses.
 * All parsers validate required fields and support round-trip conversion (parse → format → parse).
 */

// ============================================================================
// Raw API Response Types (as received from Reloadly)
// ============================================================================

export interface RawReloadlyProduct {
  productId: number;
  productName: string;
  countryCode?: string; // Optional - not always present in response
  denominationType: "FIXED" | "RANGE";
  fixedRecipientDenominations?: number[];
  minRecipientDenomination?: number;
  maxRecipientDenomination?: number;
  logoUrls: string[];
  brand: {
    brandId: number;
    brandName: string;
  };
}

export interface RawReloadlyCatalogResponse {
  content: RawReloadlyProduct[];
  pageable?: {
    pageNumber: number;
    pageSize: number;
  };
  totalElements?: number;
  totalPages?: number;
}

export interface RawReloadlyFulfillmentResponse {
  transactionId: number;
  amount: number;
  discount?: number;
  currencyCode?: string;
  product: {
    productId: number;
    productName: string;
    countryCode?: string;
    quantity?: number;
    unitPrice?: number;
  };
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  cardNumber: string;
  pinCode: string;
  transactionCreatedTime: string;
  smsFee?: number;
  deliveryCode?: string;
}

// ============================================================================
// Parsed/Structured Types (internal representation)
// ============================================================================

export interface ParsedReloadlyProduct {
  productId: number;
  productName: string;
  brandName: string;
  countryCode: string;
  logoUrl: string;
  denominations: number[];
  denominationType: "FIXED" | "RANGE";
}

export interface ParsedReloadlyFulfillment {
  transactionId: number;
  amount: number;
  productId: number;
  productName: string;
  code: string;
  pin: string;
  transactionCreatedTime: string;
}

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Parse a raw Reloadly product into structured format.
 * Extracts brand name, primary logo URL, and available denominations.
 * 
 * @param raw - Raw product from Reloadly API
 * @returns Parsed product with normalized fields
 * @throws Error if required fields are missing
 */
export function parseReloadlyProduct(raw: RawReloadlyProduct): ParsedReloadlyProduct {
  // Validate required fields
  if (!raw.productId || typeof raw.productId !== "number") {
    throw new Error("Missing or invalid productId");
  }
  if (!raw.productName || typeof raw.productName !== "string") {
    throw new Error("Missing or invalid productName");
  }
  if (!raw.brand?.brandName || typeof raw.brand.brandName !== "string") {
    throw new Error("Missing or invalid brand.brandName");
  }
  // countryCode is optional - default to "IN" if not present (since we're filtering by country in the API call)
  const countryCode = raw.countryCode && typeof raw.countryCode === "string" ? raw.countryCode : "IN";
  
  if (!raw.logoUrls || !Array.isArray(raw.logoUrls) || raw.logoUrls.length === 0) {
    throw new Error("Missing or empty logoUrls");
  }
  if (!raw.denominationType || (raw.denominationType !== "FIXED" && raw.denominationType !== "RANGE")) {
    throw new Error("Missing or invalid denominationType");
  }

  // Extract denominations based on type
  let denominations: number[];
  if (raw.denominationType === "FIXED") {
    if (!raw.fixedRecipientDenominations || !Array.isArray(raw.fixedRecipientDenominations)) {
      throw new Error("Missing fixedRecipientDenominations for FIXED type");
    }
    denominations = raw.fixedRecipientDenominations;
  } else {
    // RANGE type
    if (typeof raw.minRecipientDenomination !== "number" || typeof raw.maxRecipientDenomination !== "number") {
      throw new Error("Missing min/max denominations for RANGE type");
    }
    denominations = [raw.minRecipientDenomination, raw.maxRecipientDenomination];
  }

  return {
    productId: raw.productId,
    productName: raw.productName,
    brandName: raw.brand.brandName,
    countryCode,
    logoUrl: raw.logoUrls[0], // Use first logo URL
    denominations,
    denominationType: raw.denominationType
  };
}

/**
 * Parse a raw Reloadly catalog response into an array of structured products.
 * 
 * @param raw - Raw catalog response from Reloadly API
 * @returns Array of parsed products
 * @throws Error if content is missing or invalid
 */
export function parseReloadlyCatalog(raw: RawReloadlyCatalogResponse): ParsedReloadlyProduct[] {
  if (!raw.content || !Array.isArray(raw.content)) {
    throw new Error("Missing or invalid content array in catalog response");
  }

  return raw.content.map((product, index) => {
    try {
      return parseReloadlyProduct(product);
    } catch (error) {
      throw new Error(`Failed to parse product at index ${index}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

/**
 * Parse a raw Reloadly fulfillment response into structured format.
 * Validates that required fields (code, PIN) are present and non-empty.
 * 
 * @param raw - Raw fulfillment response from Reloadly API
 * @returns Parsed fulfillment with validated code and PIN
 * @throws Error if required fields are missing or empty
 */
export function parseReloadlyFulfillment(raw: RawReloadlyFulfillmentResponse): ParsedReloadlyFulfillment {
  // Validate required fields
  if (!raw.transactionId || typeof raw.transactionId !== "number") {
    throw new Error("Missing or invalid transactionId");
  }
  if (typeof raw.amount !== "number") {
    throw new Error("Missing or invalid amount");
  }
  if (!raw.product?.productId || typeof raw.product.productId !== "number") {
    throw new Error("Missing or invalid product.productId");
  }
  if (!raw.product?.productName || typeof raw.product.productName !== "string") {
    throw new Error("Missing or invalid product.productName");
  }
  if (!raw.transactionCreatedTime || typeof raw.transactionCreatedTime !== "string") {
    throw new Error("Missing or invalid transactionCreatedTime");
  }

  // Validate code (cardNumber) - REQUIRED and non-empty
  if (!raw.cardNumber || typeof raw.cardNumber !== "string" || raw.cardNumber.trim() === "") {
    throw new Error("Missing or empty cardNumber (code)");
  }

  // Validate PIN (pinCode) - REQUIRED and non-empty
  if (!raw.pinCode || typeof raw.pinCode !== "string" || raw.pinCode.trim() === "") {
    throw new Error("Missing or empty pinCode (PIN)");
  }

  return {
    transactionId: raw.transactionId,
    amount: raw.amount,
    productId: raw.product.productId,
    productName: raw.product.productName,
    code: raw.cardNumber.trim(),
    pin: raw.pinCode.trim(),
    transactionCreatedTime: raw.transactionCreatedTime
  };
}

// ============================================================================
// Formatter Functions (for round-trip property)
// ============================================================================

/**
 * Format a parsed product back into raw API format.
 * Used for round-trip testing: parse → format → parse should produce equivalent object.
 * 
 * @param parsed - Parsed product
 * @returns Raw product in Reloadly API format
 */
export function formatReloadlyProduct(parsed: ParsedReloadlyProduct): RawReloadlyProduct {
  const raw: RawReloadlyProduct = {
    productId: parsed.productId,
    productName: parsed.productName,
    countryCode: parsed.countryCode,
    denominationType: parsed.denominationType,
    logoUrls: [parsed.logoUrl],
    brand: {
      brandId: 0, // Not preserved in parsed format
      brandName: parsed.brandName
    }
  };

  if (parsed.denominationType === "FIXED") {
    raw.fixedRecipientDenominations = parsed.denominations;
  } else {
    // RANGE type
    raw.minRecipientDenomination = parsed.denominations[0];
    raw.maxRecipientDenomination = parsed.denominations[1];
  }

  return raw;
}

/**
 * Format a parsed catalog back into raw API format.
 * 
 * @param parsed - Array of parsed products
 * @returns Raw catalog response in Reloadly API format
 */
export function formatReloadlyCatalog(parsed: ParsedReloadlyProduct[]): RawReloadlyCatalogResponse {
  return {
    content: parsed.map(formatReloadlyProduct)
  };
}

/**
 * Format a parsed fulfillment back into raw API format.
 * Used for round-trip testing: parse → format → parse should produce equivalent object.
 * 
 * @param parsed - Parsed fulfillment
 * @returns Raw fulfillment response in Reloadly API format
 */
export function formatReloadlyFulfillment(parsed: ParsedReloadlyFulfillment): RawReloadlyFulfillmentResponse {
  return {
    transactionId: parsed.transactionId,
    amount: parsed.amount,
    product: {
      productId: parsed.productId,
      productName: parsed.productName
    },
    cardNumber: parsed.code,
    pinCode: parsed.pin,
    transactionCreatedTime: parsed.transactionCreatedTime
  };
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Check if a parsed fulfillment has valid code and PIN.
 * 
 * @param fulfillment - Parsed fulfillment to validate
 * @returns true if code and PIN are non-empty strings
 */
export function hasValidCodeAndPin(fulfillment: ParsedReloadlyFulfillment): boolean {
  return (
    typeof fulfillment.code === "string" &&
    fulfillment.code.trim().length > 0 &&
    typeof fulfillment.pin === "string" &&
    fulfillment.pin.trim().length > 0
  );
}

/**
 * Validate that a product has at least one denomination.
 * 
 * @param product - Parsed product to validate
 * @returns true if product has at least one denomination
 */
export function hasValidDenominations(product: ParsedReloadlyProduct): boolean {
  return Array.isArray(product.denominations) && product.denominations.length > 0;
}
