"use client";

import React from "react";
import type { GiftCardProduct } from "./GiftCardGrid";

interface AmountSelectionModalProps {
  isOpen: boolean;
  product: GiftCardProduct;
  onSelect: (denomination: number) => void;
  onClose: () => void;
}

/**
 * Modal for selecting gift card denomination amount.
 * Displays all available denominations in a grid layout.
 */
export function AmountSelectionModal({
  isOpen,
  product,
  onSelect,
  onClose
}: AmountSelectionModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Product Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
          <img
            src={product.logoUrl}
            alt={product.brandName}
            style={{
              width: "56px",
              height: "56px",
              objectFit: "contain",
              borderRadius: "8px"
            }}
          />
          <div>
            <h2 style={{ margin: 0, fontSize: "20px", fontFamily: "var(--font-heading)" }}>
              {product.brandName}
            </h2>
            <p style={{ margin: 0, fontSize: "14px", color: "var(--muted)", fontFamily: "var(--font-sans)" }}>
              {product.productName}
            </p>
          </div>
        </div>

        {/* Amount Selection */}
        <div>
          <p style={{ fontSize: "14px", fontWeight: 600, marginBottom: "16px", fontFamily: "var(--font-sans)" }}>
            Select Amount:
          </p>
          <div className="denomination-grid">
            {product.denominations.map((denomination) => (
              <button
                key={denomination}
                type="button"
                className="denomination-option"
                onClick={() => onSelect(denomination)}
              >
                ₹{denomination}
              </button>
            ))}
          </div>
        </div>

        {/* Cancel Button */}
        <button onClick={onClose} className="modal-cancel-button">
          Cancel
        </button>

        <style jsx>{`
          .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            backdrop-filter: blur(4px);
            padding: 16px;
          }

          .modal-content {
            background: var(--background);
            border-radius: 16px;
            padding: 32px;
            max-width: 500px;
            width: 100%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          }

          @media (max-width: 640px) {
            .modal-overlay {
              padding: 0;
              align-items: flex-end;
            }

            .modal-content {
              border-radius: 16px 16px 0 0;
              max-height: 95vh;
              padding: 24px 20px;
              width: 100%;
            }
          }

          .denomination-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-bottom: 24px;
          }

          @media (max-width: 640px) {
            .denomination-grid {
              grid-template-columns: repeat(2, 1fr);
            }
          }

          .denomination-option {
            background: var(--background);
            color: var(--foreground);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 16px;
            font-size: 16px;
            font-weight: 600;
            font-family: var(--font-sans);
            cursor: pointer;
            transition: all 0.2s;
            min-height: 44px;
            touch-action: manipulation;
          }

          .denomination-option:hover {
            background: var(--accent);
            border-color: var(--accent);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          }

          .modal-cancel-button {
            background: transparent;
            color: var(--muted);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 12px 32px;
            font-size: 16px;
            font-weight: 500;
            font-family: var(--font-sans);
            cursor: pointer;
            transition: background 0.2s;
            width: 100%;
            min-height: 44px;
            touch-action: manipulation;
          }

          .modal-cancel-button:hover {
            background: var(--muted);
          }
        `}</style>
      </div>
    </div>
  );
}
