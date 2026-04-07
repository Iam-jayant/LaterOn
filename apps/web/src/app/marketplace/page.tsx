"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "../../hooks/useWallet";
import { Navbar } from "../../components/landing/Navbar";
import { GiftCardGrid, type GiftCardProduct } from "../../components/marketplace/GiftCardGrid";
import { GiftCardCheckoutModal } from "../../components/marketplace/GiftCardCheckoutModal";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

// ============================================================================
// Type Definitions
// ============================================================================

interface CatalogResponse {
  products: GiftCardProduct[];
}

// ============================================================================
// MarketplacePage Component
// ============================================================================

/**
 * Marketplace page displaying gift cards in a responsive grid.
 * 
 * Features:
 * - Fetches catalog from API on mount
 * - Uses GiftCardGrid component for display
 * - Opens GiftCardCheckoutModal for purchases
 * - Handles API errors with user-friendly messages
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
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProductId, setExpandedProductId] = useState<number | null>(null);

  // Fetch catalog on mount (Requirement 2.1)
  useEffect(() => {
    void loadCatalog();
  }, []);

  // Filter catalog by search query (Requirements 4.3, 13.1, 13.2, 13.3)
  const filteredCatalog = useMemo(() => {
    if (!searchQuery.trim()) {
      return catalog;
    }
    
    const query = searchQuery.toLowerCase();
    return catalog.filter(product => 
      product.brandName.toLowerCase().includes(query)
    );
  }, [catalog, searchQuery]);

  const loadCatalog = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiBase}/api/marketplace/catalog`);
      
      if (!response.ok) {
        // Try to parse error response, but handle cases where it's not JSON
        let errorMessage = "Gift cards temporarily unavailable. Please try again later.";
        
        try {
          const errorData = await response.json() as { error?: { message?: string; code?: string } };
          if (errorData.error?.message) {
            errorMessage = errorData.error.message;
          }
        } catch {
          // If JSON parsing fails, use default message
        }
        
        throw new Error(errorMessage);
      }

      const data = (await response.json()) as CatalogResponse;
      setCatalog(data.products);
    } catch (err) {
      // Handle API errors with user-friendly messages (Requirement 12.1)
      const errorMessage = err instanceof Error ? err.message : "Gift cards temporarily unavailable. Please try again later.";
      setError(errorMessage);
      
      // Log error for debugging (Requirement 12.5)
      console.error("Failed to load catalog:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCardExpand = (productId: number): void => {
    setExpandedProductId(productId === expandedProductId ? null : productId);
  };

  const handleCardClick = (product: GiftCardProduct, denomination: number): void => {
    setSelectedProduct(product);
    setSelectedDenomination(denomination);
    setIsCheckoutModalOpen(true);
  };

  const handleCheckoutSuccess = (): void => {
    // Reset selection after successful purchase
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
      {/* Enhanced Navbar with Search and Profile - Requirements 4.1, 4.2, 4.4, 4.5, 13.5 */}
      <Navbar 
        showSearch={true}
        showProfile={true}
        walletAddress={walletAddress}
        onSearch={handleSearch}
        onDisconnect={handleDisconnect}
      />

      {/* Main Content */}
      <section className="card" style={{ marginTop: '100px' }}>
        <div className="eyebrow">Browse Gift Cards</div>
        <h2 style={{ marginTop: 10 }}>Buy now, pay in 3 installments</h2>
        <p style={{ marginTop: 6 }}>
          Choose from popular brands and split your payment into 3 easy installments
        </p>

        {/* Gift Card Grid Component (Requirement 2.1, 2.4) */}
        <GiftCardGrid
          products={filteredCatalog}
          isLoading={isLoading}
          error={error}
          selectedProduct={selectedProduct}
          selectedDenomination={selectedDenomination}
          onCardSelect={handleCardClick}
          expandedProductId={expandedProductId}
          onCardClick={handleCardExpand}
        />

        {/* No Results Message - Requirement 13.4 */}
        {!isLoading && !error && searchQuery && filteredCatalog.length === 0 && (
          <p style={{ marginTop: 20, textAlign: "center", color: "var(--muted)" }}>
            No gift cards found matching "{searchQuery}"
          </p>
        )}

      </section>

      {/* Checkout Modal (Requirement 5.2, 5.3, 5.7, 6.1, 6.5, 6.6, 7.3, 7.4) */}
      {selectedProduct && selectedDenomination && (
        <GiftCardCheckoutModal
          isOpen={isCheckoutModalOpen}
          productName={selectedProduct.productName}
          brandName={selectedProduct.brandName}
          denomination={selectedDenomination}
          productId={selectedProduct.productId}
          onClose={() => setIsCheckoutModalOpen(false)}
          onSuccess={handleCheckoutSuccess}
        />
      )}
    </main>
  );
}
