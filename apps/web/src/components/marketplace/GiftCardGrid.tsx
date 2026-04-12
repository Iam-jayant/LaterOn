"use client";

import React from "react";
import SkeletonLoader from "../ui/SkeletonLoader";

// ============================================================================
// Type Definitions
// ============================================================================

export interface GiftCardProduct {
  productId: number;
  productName: string;
  brandName: string;
  countryCode: string;
  logoUrl: string;
  denominations: number[];
  denominationType: "FIXED" | "RANGE";
}

interface GiftCardGridProps {
  products: GiftCardProduct[];
  isLoading: boolean;
  error: string | null;
  selectedProduct: GiftCardProduct | null;
  selectedDenomination: number | null;
  onCardSelect: (product: GiftCardProduct, denomination: number) => void;
  expandedProductId: number | null;
  onCardClick: (productId: number) => void;
}

// ============================================================================
// GiftCardGrid Component
// ============================================================================

/**
 * Responsive grid component for displaying gift cards.
 * 
 * Features:
 * - Responsive grid layout (1 col mobile, 2-3 tablet, 3-4 desktop)
 * - Displays brand logo, name, and denominations
 * - Handles card selection with visual feedback
 * - Shows loading state with skeleton loaders
 * - Displays error messages
 * 
 * Requirements: 2.1, 2.4, 14.1
 */
export function GiftCardGrid({
  products,
  isLoading,
  error,
  selectedProduct,
  selectedDenomination,
  onCardSelect,
  expandedProductId,
  onCardClick
}: GiftCardGridProps) {
  // Loading State with Skeleton Loaders (Requirement 2.4)
  if (isLoading) {
    return (
      <>
        <div
          className="gift-card-grid"
          style={{
            display: "grid",
            gap: "16px",
            marginTop: "24px"
          }}
        >
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <SkeletonLoader key={i} variant="card" height="240px" />
          ))}
        </div>

        <style jsx>{`
          .gift-card-grid {
            grid-template-columns: 1fr;
          }

          @media (min-width: 640px) {
            .gift-card-grid {
              grid-template-columns: repeat(2, 1fr);
            }
          }

          @media (min-width: 900px) {
            .gift-card-grid {
              grid-template-columns: repeat(3, 1fr);
            }
          }

          @media (min-width: 1200px) {
            .gift-card-grid {
              grid-template-columns: repeat(4, 1fr);
            }
          }
        `}</style>
      </>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="error" style={{ marginTop: 20 }}>
        {error}
      </div>
    );
  }

  // Empty State
  if (products.length === 0) {
    return (
      <p style={{ marginTop: 20, textAlign: "center", color: "var(--muted)" }}>
        No gift cards available at the moment.
      </p>
    );
  }

  // Gift Card Grid (Requirement 2.1, 2.4, 14.1)
  return (
    <>
      <div
        className="gift-card-grid"
        style={{
          display: "grid",
          gap: "16px",
          marginTop: "24px"
        }}
      >
        {products.map((product) => (
          <div
            key={product.productId}
            className="gift-card"
            style={{
              border: "1px solid var(--border)",
              borderRadius: "16px",
              padding: "20px",
              backgroundColor: "var(--background)",
              transition: "box-shadow 0.2s"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {/* Brand Logo and Name */}
            <div 
              style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "12px", 
                marginBottom: "16px"
              }}
            >
              <img
                src={product.logoUrl}
                alt={product.brandName}
                style={{
                  width: "48px",
                  height: "48px",
                  objectFit: "contain",
                  borderRadius: "8px"
                }}
              />
              <div>
                <h3 style={{ margin: 0, fontSize: "18px", fontFamily: "var(--font-heading)" }}>{product.brandName}</h3>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--muted)", fontFamily: "var(--font-sans)" }}>
                  {product.productName}
                </p>
              </div>
            </div>

            {/* Denominations - Always visible */}
            <div style={{ marginTop: "16px" }}>
              <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "8px" }}>
                Select amount:
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {product.denominations.slice(0, 3).map((denomination) => (
                  <button
                    key={denomination}
                    type="button"
                    className="secondary denomination-button"
                    style={{
                      padding: "12px 16px",
                      fontSize: "14px",
                      minWidth: "44px",
                      minHeight: "44px",
                      fontFamily: "var(--font-sans)",
                      backgroundColor:
                        selectedProduct?.productId === product.productId &&
                        selectedDenomination === denomination
                          ? "var(--accent)"
                          : "transparent"
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCardSelect(product, denomination);
                    }}
                  >
                    ₹{denomination}
                  </button>
                ))}
                {product.denominations.length > 3 && (
                  <button
                    type="button"
                    className="secondary denomination-button"
                    style={{
                      padding: "12px 16px",
                      fontSize: "12px",
                      minWidth: "44px",
                      minHeight: "44px",
                      fontFamily: "var(--font-sans)",
                      color: "var(--muted)"
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCardClick(product.productId);
                    }}
                  >
                    +{product.denominations.length - 3} more
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        /* Responsive Grid Layout - Requirement 14.1 */
        .gift-card-grid {
          /* Mobile: 1 column */
          grid-template-columns: 1fr;
        }

        /* Tablet: 2-3 columns */
        @media (min-width: 640px) {
          .gift-card-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (min-width: 900px) {
          .gift-card-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        /* Desktop: 3-4 columns */
        @media (min-width: 1200px) {
          .gift-card-grid {
            grid-template-columns: repeat(4, 1fr);
          }
        }

        /* Touch target accessibility - Requirement 14.3 */
        .denomination-button {
          touch-action: manipulation;
        }
      `}</style>
    </>
  );
}
