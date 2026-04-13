"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "../../hooks/useWallet";
import { Navbar } from "../../components/landing/Navbar";
import { GiftCardGrid, type GiftCardProduct } from "../../components/marketplace/GiftCardGrid";
import { GiftCardCheckoutModal } from "../../components/marketplace/GiftCardCheckoutModal";
import { AmountSelectionModal } from "../../components/marketplace/AmountSelectionModal";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

// ============================================================================
// Type Definitions
// ============================================================================

interface CatalogResponse {
  products: GiftCardProduct[];
}

// ============================================================================
// Category Mapping
// ============================================================================

const BRAND_CATEGORIES: Record<string, string[]> = {
  'Entertainment': ['Netflix', 'Amazon Prime', 'Spotify', 'Apple Music', 'Disney', 'Hotstar', 'YouTube', 'Prime Video'],
  'Gaming': ['Steam', 'PlayStation', 'Xbox', 'Nintendo', 'Google Play', 'Roblox', 'Epic Games', 'Razer'],
  'Shopping': ['Amazon', 'Flipkart', 'Myntra', 'Ajio', 'Nykaa', 'Tata CLiQ', 'Shoppers Stop', 'Lifestyle'],
  'Food & Dining': ['Swiggy', 'Zomato', 'Dominos', 'Pizza Hut', 'KFC', 'McDonald', 'Starbucks', 'Dunkin'],
  'Fashion': ['H&M', 'Zara', 'Nike', 'Adidas', 'Puma', 'Levi', 'Reebok', 'Woodland'],
  'Travel': ['MakeMyTrip', 'Goibibo', 'Cleartrip', 'Yatra', 'Uber', 'Ola', 'Airbnb'],
  'Electronics': ['Croma', 'Reliance Digital', 'Vijay Sales', 'Samsung', 'Apple', 'OnePlus'],
  'Beauty & Wellness': ['Nykaa', 'Purplle', 'Sephora', 'The Body Shop', 'Lakme', 'MAC'],
};

const FEATURED_BRANDS = ['Amazon', 'Flipkart', 'Netflix', 'Swiggy', 'Zomato', 'Myntra', 'Spotify', 'Google Play'];

// ============================================================================
// Helper Functions
// ============================================================================

function categorizeBrand(brandName: string): string {
  for (const [category, brands] of Object.entries(BRAND_CATEGORIES)) {
    if (brands.some(brand => brandName.toLowerCase().includes(brand.toLowerCase()))) {
      return category;
    }
  }
  return 'Other';
}

function isFeaturedBrand(brandName: string): boolean {
  return FEATURED_BRANDS.some(brand => brandName.toLowerCase().includes(brand.toLowerCase()));
}

// ============================================================================
// MarketplacePage Component
// ============================================================================

/**
 * Marketplace page displaying gift cards in a responsive grid.
 * 
 * Features:
 * - Fetches catalog from API on mount
 * - Featured/Popular section at top
 * - Category-based grouping
 * - Search filtering by brand name (case-insensitive)
 * - Enhanced Navbar with search and profile dropdown
 * 
 * Requirements: 1.1, 2.1, 2.4, 2.5, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 12.1, 13.1, 13.2, 13.3, 13.4, 13.5
 */
export default function MarketplacePage() {
  const router = useRouter();
  const { address: walletAddress, disconnect } = useWallet();
  const [catalog, setCatalog] = useState<GiftCardProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<GiftCardProduct | null>(null);
  const [selectedDenomination, setSelectedDenomination] = useState<number | null>(null);
  const [isAmountModalOpen, setIsAmountModalOpen] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProductId, setExpandedProductId] = useState<number | null>(null);

  // Fetch catalog on mount (Requirement 2.1)
  useEffect(() => {
    void loadCatalog();
  }, []);

  // Categorize and filter catalog
  const { featuredProducts, categorizedProducts, filteredCatalog } = useMemo(() => {
    let products = catalog;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      products = products.filter(product => 
        product.brandName.toLowerCase().includes(query)
      );
    }

    // Separate featured products
    const featured = products.filter(p => isFeaturedBrand(p.brandName));
    const remaining = products.filter(p => !isFeaturedBrand(p.brandName));

    // Group remaining by category
    const categorized: Record<string, GiftCardProduct[]> = {};
    remaining.forEach(product => {
      const category = categorizeBrand(product.brandName);
      if (!categorized[category]) {
        categorized[category] = [];
      }
      categorized[category].push(product);
    });

    return {
      featuredProducts: featured,
      categorizedProducts: categorized,
      filteredCatalog: products
    };
  }, [catalog, searchQuery]);

  const loadCatalog = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('Fetching catalog from:', `${apiBase}/api/marketplace/catalog`);
      const response = await fetch(`${apiBase}/api/marketplace/catalog`);
      
      console.log('Catalog response status:', response.status);
      
      if (!response.ok) {
        let errorMessage = "Gift cards temporarily unavailable. Please try again later.";
        
        try {
          const errorData = await response.json() as { error?: { message?: string; code?: string } };
          console.error('Catalog error response:', errorData);
          if (errorData.error?.message) {
            errorMessage = errorData.error.message;
          }
        } catch (parseError) {
          console.error('Failed to parse error response:', parseError);
          // Try to get text response
          try {
            const errorText = await response.text();
            console.error('Error response text:', errorText);
          } catch {
            // Ignore
          }
        }
        
        throw new Error(errorMessage);
      }

      const data = (await response.json()) as CatalogResponse;
      console.log('Catalog loaded successfully:', data.products.length, 'products');
      setCatalog(data.products);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Gift cards temporarily unavailable. Please try again later.";
      console.error("Failed to load catalog:", err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCardExpand = (productId: number): void => {
    const product = catalog.find(p => p.productId === productId);
    if (product) {
      setSelectedProduct(product);
      setIsAmountModalOpen(true);
    }
  };

  const handleCardClick = (product: GiftCardProduct, denomination: number): void => {
    setSelectedProduct(product);
    setSelectedDenomination(denomination);
    setIsCheckoutModalOpen(true);
  };

  const handleAmountSelect = (denomination: number): void => {
    setSelectedDenomination(denomination);
    setIsAmountModalOpen(false);
    setIsCheckoutModalOpen(true);
  };

  const handleCheckoutSuccess = (): void => {
    setSelectedProduct(null);
    setSelectedDenomination(null);
  };

  const handleDisconnect = async (): Promise<void> => {
    try {
      await disconnect();
      router.push('/');
    } catch (err) {
      console.error('Failed to disconnect wallet:', err);
    }
  };

  const handleSearch = (query: string): void => {
    setSearchQuery(query);
  };

  return (
    <main className="shell">
      <Navbar 
        showSearch={true}
        showProfile={true}
        walletAddress={walletAddress}
        onSearch={handleSearch}
        onDisconnect={handleDisconnect}
      />

      <section className="card" style={{ marginTop: '100px' }}>
        <div className="eyebrow">Browse Gift Cards</div>
        <h2 style={{ marginTop: 10 }}>Buy now, pay in 3 installments</h2>
        <p style={{ marginTop: 6 }}>
          Choose from popular brands and split your payment into 3 easy installments
        </p>

        {/* Loading State */}
        {isLoading && (
          <GiftCardGrid
            products={[]}
            isLoading={true}
            error={null}
            selectedProduct={selectedProduct}
            selectedDenomination={selectedDenomination}
            onCardSelect={handleCardClick}
            expandedProductId={expandedProductId}
            onCardClick={handleCardExpand}
          />
        )}

        {/* Error State */}
        {!isLoading && error && (
          <div className="error" style={{ marginTop: 20 }}>
            {error}
          </div>
        )}

        {/* No Results */}
        {!isLoading && !error && searchQuery && filteredCatalog.length === 0 && (
          <p style={{ marginTop: 20, textAlign: "center", color: "var(--muted)" }}>
            No gift cards found matching "{searchQuery}"
          </p>
        )}

        {/* Featured Section */}
        {!isLoading && !error && featuredProducts.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <h3 style={{ 
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: '20px',
              fontWeight: 600,
              color: '#0A0C12',
              marginBottom: 16
            }}>
              ⭐ Featured & Popular
            </h3>
            <GiftCardGrid
              products={featuredProducts}
              isLoading={false}
              error={null}
              selectedProduct={selectedProduct}
              selectedDenomination={selectedDenomination}
              onCardSelect={handleCardClick}
              expandedProductId={expandedProductId}
              onCardClick={handleCardExpand}
            />
          </div>
        )}

        {/* Category Sections */}
        {!isLoading && !error && Object.entries(categorizedProducts).map(([category, products]) => (
          products.length > 0 && (
            <div key={category} style={{ marginTop: 40 }}>
              <h3 style={{ 
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: '20px',
                fontWeight: 600,
                color: '#0A0C12',
                marginBottom: 16,
                paddingBottom: 8,
                borderBottom: '2px solid rgba(10,12,18,0.07)'
              }}>
                {category}
              </h3>
              <GiftCardGrid
                products={products}
                isLoading={false}
                error={null}
                selectedProduct={selectedProduct}
                selectedDenomination={selectedDenomination}
                onCardSelect={handleCardClick}
                expandedProductId={expandedProductId}
                onCardClick={handleCardExpand}
              />
            </div>
          )
        ))}
      </section>

      {/* Amount Selection Modal */}
      {selectedProduct && (
        <AmountSelectionModal
          isOpen={isAmountModalOpen}
          product={selectedProduct}
          onSelect={handleAmountSelect}
          onClose={() => {
            setIsAmountModalOpen(false);
            setSelectedProduct(null);
          }}
        />
      )}

      {/* Checkout Modal */}
      {selectedProduct && selectedDenomination && (
        <GiftCardCheckoutModal
          isOpen={isCheckoutModalOpen}
          productName={selectedProduct.productName}
          brandName={selectedProduct.brandName}
          denomination={selectedDenomination}
          productId={selectedProduct.productId}
          onClose={() => {
            setIsCheckoutModalOpen(false);
            setSelectedProduct(null);
            setSelectedDenomination(null);
          }}
          onSuccess={handleCheckoutSuccess}
        />
      )}
    </main>
  );
}
