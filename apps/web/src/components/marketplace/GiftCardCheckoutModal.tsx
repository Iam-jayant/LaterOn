"use client";

import React, { useState, useEffect } from "react";
import { useWallet } from "@/hooks/useWallet";
import { useTransactionSigner } from "@/hooks/useTransactionSigner";
import { SigningModal } from "@/components/signing-modal";
import { decodeUnsignedTransactions } from "@/lib/transaction-signer";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

// ============================================================================
// Type Definitions
// ============================================================================

interface GiftCardCheckoutModalProps {
  isOpen: boolean;
  productName: string;
  brandName: string;
  denomination: number;
  productId: number;
  onClose: () => void;
  onSuccess?: (giftCard: GiftCardDetails) => void;
}

interface MarketplaceQuote {
  quoteId: string;
  productId: number;
  productName: string;
  denomination: number;
  orderAmountInr: number;
  orderAmountAlgo: number;
  installmentAmountAlgo: number;
  algoToInrRate: number;
  expiresAtUnix: number;
  tenureMonths: number;
}

interface GiftCardDetails {
  code: string;
  pin: string;
  productName: string;
  denomination: number;
  expiresAt?: string;
}

type CheckoutStep = "quote" | "wallet" | "success" | "error";

// ============================================================================
// GiftCardCheckoutModal Component
// ============================================================================

/**
 * Comprehensive checkout modal for gift card purchases with BNPL.
 * 
 * Features:
 * - Displays payment breakdown (INR and ALGO)
 * - Shows 3-month installment schedule
 * - Wallet connection button
 * - Transaction approval UI
 * - Gift card code and PIN display after purchase
 * - Copy buttons for code and PIN
 * 
 * Requirements: 5.2, 5.3, 5.7, 6.1, 6.5, 6.6, 7.3, 7.4
 */
export function GiftCardCheckoutModal({
  isOpen,
  productName,
  brandName,
  denomination,
  productId,
  onClose,
  onSuccess
}: GiftCardCheckoutModalProps) {
  const { address, connect } = useWallet();
  const { signAndSubmitTransactions, signingStatus, txId, error: signingError, isModalOpen: isSigningModalOpen, closeModal } = useTransactionSigner();
  
  const [step, setStep] = useState<CheckoutStep>("quote");
  const [quote, setQuote] = useState<MarketplaceQuote | null>(null);
  const [giftCard, setGiftCard] = useState<GiftCardDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dots, setDots] = useState("");
  const [copiedField, setCopiedField] = useState<"code" | "pin" | null>(null);

  // Animated dots for loading states
  useEffect(() => {
    if (step === "quote") {
      const interval = setInterval(() => {
        setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
      }, 500);
      return () => clearInterval(interval);
    }
  }, [step]);

  // Create quote when modal opens (Requirement 5.2, 5.3)
  useEffect(() => {
    if (isOpen && address && !quote) {
      void createQuote();
    }
  }, [isOpen, address]);

  const createQuote = async (): Promise<void> => {
    setStep("quote");
    setError(null);

    try {
      const response = await fetch(`${apiBase}/api/marketplace/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          productId,
          denomination
        })
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: { message?: string; code?: string } };
        
        // Display descriptive error messages (Requirement 3.6)
        throw new Error(errorData.error?.message || "Failed to create quote");
      }

      const quoteData = (await response.json()) as MarketplaceQuote;
      setQuote(quoteData);
      setStep("wallet");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create quote";
      setError(errorMessage);
      setStep("error");
      
      // Log error for debugging (Requirement 12.5)
      console.error("Failed to create quote:", errorMessage, err);
    }
  };

  const handleWalletConnect = async (): Promise<void> => {
    try {
      await connect("pera");
    } catch (err) {
      // Display wallet connection error (Requirement 12.2)
      const errorMessage = err instanceof Error ? err.message : "Failed to connect wallet";
      setError("Wallet connection failed. Please try again.");
      setStep("error");
      
      // Log error for debugging (Requirement 12.5)
      console.error("Wallet connection failed:", errorMessage);
    }
  };

  const handleCheckout = async (): Promise<void> => {
    if (!quote) return;

    setError(null);

    try {
      // Step 1: Call backend to prepare unsigned transactions
      const prepareResponse = await fetch(`${apiBase}/api/marketplace/checkout/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId: quote.quoteId
        })
      });

      if (!prepareResponse.ok) {
        const errorData = await prepareResponse.json() as { error?: { message?: string; code?: string } };
        
        // Handle specific error codes with user-friendly messages (Requirements 12.3, 12.4)
        if (errorData.error?.code === "INSUFFICIENT_LIQUIDITY") {
          throw new Error("Insufficient pool liquidity. Please try again later.");
        } else if (errorData.error?.code === "QUOTE_EXPIRED") {
          throw new Error("Quote expired. Please create a new quote.");
        }
        
        throw new Error(errorData.error?.message || "Failed to prepare checkout");
      }

      const prepareData = await prepareResponse.json() as { transactions: string[] };
      
      // Step 2: Decode unsigned transactions
      const unsignedTransactions = decodeUnsignedTransactions(prepareData.transactions);
      
      // Step 3: Sign and submit transactions using the hook
      // This will open the wallet for signing, submit to blockchain, and wait for confirmation
      // The SigningModal will display the signing status
      const result = await signAndSubmitTransactions(unsignedTransactions);
      
      // Step 4: Call backend to confirm checkout and fulfill gift card
      // For now, we'll use the old single-endpoint approach since the backend
      // confirm endpoint expects to submit transactions itself
      // TODO: Update backend to accept txId and verify on-chain instead of re-submitting
      const confirmResponse = await fetch(`${apiBase}/api/marketplace/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId: quote.quoteId
        })
      });

      if (!confirmResponse.ok) {
        const errorData = await confirmResponse.json() as { error?: { message?: string; code?: string } };
        
        // Handle specific error codes with user-friendly messages (Requirements 12.3, 12.4)
        if (errorData.error?.code === "QUOTE_EXPIRED") {
          throw new Error("Quote expired. Please create a new quote.");
        } else if (errorData.error?.code === "FULFILLMENT_FAILED") {
          // Display fulfillment failure with transaction ID (Requirement 12.4)
          throw new Error(errorData.error.message || "Gift card delivery failed");
        }
        
        throw new Error(errorData.error?.message || "Failed to confirm checkout");
      }

      const confirmData = await confirmResponse.json() as {
        success: boolean;
        giftCard: GiftCardDetails;
      };

      if (confirmData.success && confirmData.giftCard) {
        setGiftCard(confirmData.giftCard);
        setStep("success");
        onSuccess?.(confirmData.giftCard);
      } else {
        throw new Error("Invalid checkout response");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Checkout failed";
      setError(errorMessage);
      setStep("error");
      
      // Log error for debugging (Requirement 12.5)
      console.error("Checkout failed:", errorMessage, err);
    }
  };

  const handleCopy = async (field: "code" | "pin", value: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleClose = (): void => {
    setStep("quote");
    setQuote(null);
    setGiftCard(null);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  const canClose = step === "success" || step === "error";

  return (
    <div className="modal-overlay" onClick={canClose ? handleClose : undefined}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Quote Loading */}
        {step === "quote" && (
          <>
            <div className="modal-icon">⏳</div>
            <h2 className="modal-title">
              Creating quote<span className="dots">{dots}</span>
            </h2>
            <p className="modal-message">Please wait while we prepare your payment details</p>
          </>
        )}

        {/* Wallet Connection & Payment Breakdown (Requirement 5.7, 6.1) */}
        {step === "wallet" && quote && (
          <>
            <div className="modal-icon">💳</div>
            <h2 className="modal-title">Checkout</h2>
            
            <div style={{ textAlign: "left", marginBottom: "24px" }}>
              <p style={{ margin: "0 0 8px", fontWeight: 600, fontSize: "16px" }}>
                {brandName} - ₹{denomination}
              </p>
              <p style={{ margin: 0, fontSize: "14px", color: "var(--muted)" }}>
                {productName}
              </p>
            </div>

            {/* Payment Breakdown (Requirement 5.3, 5.7) */}
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "12px",
                padding: "16px",
                marginBottom: "24px",
                backgroundColor: "var(--muted)",
                textAlign: "left"
              }}
            >
              <p style={{ margin: "0 0 12px", fontWeight: 600, fontSize: "14px" }}>
                Payment Breakdown
              </p>
              
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "14px" }}>Total Amount:</span>
                <span style={{ fontSize: "14px", fontWeight: 500 }}>
                  ₹{quote.orderAmountInr} ({quote.orderAmountAlgo.toFixed(2)} ALGO)
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "14px" }}>Per Installment:</span>
                <span style={{ fontSize: "14px", fontWeight: 500 }}>
                  ₹{Math.ceil(quote.orderAmountInr / quote.tenureMonths)} ({quote.installmentAmountAlgo.toFixed(2)} ALGO)
                </span>
              </div>

              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  marginTop: "12px",
                  paddingTop: "12px"
                }}
              >
                <p style={{ margin: "0 0 8px", fontSize: "12px", fontWeight: 600 }}>
                  {quote.tenureMonths}-Month Installment Schedule:
                </p>
                <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "12px" }}>
                  <li>Month 1: ₹{Math.ceil(quote.orderAmountInr / quote.tenureMonths)} (Today)</li>
                  <li>Month 2: ₹{Math.ceil(quote.orderAmountInr / quote.tenureMonths)}</li>
                  <li>Month 3: ₹{Math.ceil(quote.orderAmountInr / quote.tenureMonths)}</li>
                </ul>
              </div>

              <p style={{ margin: "12px 0 0", fontSize: "11px", color: "var(--muted)" }}>
                Exchange Rate: 1 ALGO = ₹{quote.algoToInrRate.toFixed(2)}
              </p>
            </div>

            {/* Wallet Connection Button (Requirement 6.1) */}
            {!address ? (
              <button onClick={handleWalletConnect} className="modal-action-button">
                Connect Wallet
              </button>
            ) : (
              <>
                <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "16px" }}>
                  Connected: {address.slice(0, 6)}...{address.slice(-4)}
                </p>
                <button onClick={handleCheckout} className="modal-action-button">
                  Buy
                </button>
              </>
            )}

            <button onClick={handleClose} className="modal-cancel-button">
              Cancel
            </button>
          </>
        )}

        {/* Success - Display Gift Card (Requirement 7.3, 7.4) */}
        {step === "success" && giftCard && (
          <>
            <div className="modal-icon">✅</div>
            <h2 className="modal-title">Purchase Complete!</h2>
            <p className="modal-message" style={{ marginBottom: "24px" }}>
              Your {brandName} gift card is ready
            </p>

            {/* Gift Card Details with Copy Buttons (Requirement 7.3, 7.4) */}
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "12px",
                padding: "16px",
                marginBottom: "24px",
                backgroundColor: "var(--muted)",
                textAlign: "left"
              }}
            >
              <div style={{ marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    Gift Card Code:
                  </label>
                  <button
                    onClick={() => handleCopy("code", giftCard.code)}
                    style={{
                      padding: "8px 16px",
                      fontSize: "12px",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      background: "var(--background)",
                      cursor: "pointer",
                      minWidth: "44px",
                      minHeight: "44px",
                      touchAction: "manipulation",
                    }}
                  >
                    {copiedField === "code" ? "✓ Copied" : "Copy"}
                  </button>
                </div>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: "16px",
                    fontFamily: "monospace",
                    fontWeight: 600,
                    wordBreak: "break-all"
                  }}
                >
                  {giftCard.code}
                </p>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    PIN:
                  </label>
                  <button
                    onClick={() => handleCopy("pin", giftCard.pin)}
                    style={{
                      padding: "8px 16px",
                      fontSize: "12px",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      background: "var(--background)",
                      cursor: "pointer",
                      minWidth: "44px",
                      minHeight: "44px",
                      touchAction: "manipulation",
                    }}
                  >
                    {copiedField === "pin" ? "✓ Copied" : "Copy"}
                  </button>
                </div>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: "16px",
                    fontFamily: "monospace",
                    fontWeight: 600
                  }}
                >
                  {giftCard.pin}
                </p>
              </div>

              {giftCard.expiresAt && (
                <p style={{ margin: "12px 0 0", fontSize: "11px", color: "var(--muted)" }}>
                  Expires: {new Date(giftCard.expiresAt).toLocaleDateString()}
                </p>
              )}
            </div>

            <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "16px" }}>
              Save these details! You can also view them later in your dashboard.
            </p>

            <button onClick={handleClose} className="modal-action-button">
              Done
            </button>
          </>
        )}

        {/* Error State with Retry Option (Requirements 12.2, 12.3, 12.4) */}
        {step === "error" && (
          <>
            <div className="modal-icon">❌</div>
            <h2 className="modal-title">Purchase Failed</h2>
            <p className="modal-message">{error || "An error occurred. Please try again."}</p>
            
            {/* Retry button for recoverable errors (Requirement 12.3) */}
            {error && !error.includes("Contact support") && (
              <button 
                onClick={() => {
                  setStep("wallet");
                  setError(null);
                }} 
                className="modal-action-button"
                style={{ marginBottom: "8px" }}
              >
                Retry
              </button>
            )}
            
            <button onClick={handleClose} className="modal-cancel-button">
              Close
            </button>
          </>
        )}

        {/* SigningModal for transaction signing status (Requirement 2.6, 3.3) */}
        <SigningModal
          isOpen={isSigningModalOpen}
          status={signingStatus}
          txId={txId}
          error={signingError}
          onClose={closeModal}
        />

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
            text-align: center;
          }

          /* Mobile-friendly modal - Requirement 14.4 */
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

          .modal-icon {
            font-size: 64px;
            margin-bottom: 16px;
            animation: fadeIn 0.3s ease-in;
          }

          @media (max-width: 640px) {
            .modal-icon {
              font-size: 48px;
              margin-bottom: 12px;
            }
          }

          .modal-title {
            font-size: 24px;
            font-weight: 600;
            margin: 0 0 12px 0;
            color: var(--foreground);
          }

          @media (max-width: 640px) {
            .modal-title {
              font-size: 20px;
            }
          }

          .dots {
            display: inline-block;
            width: 20px;
            text-align: left;
          }

          .modal-message {
            font-size: 16px;
            color: var(--muted);
            margin: 0 0 24px 0;
            line-height: 1.5;
          }

          @media (max-width: 640px) {
            .modal-message {
              font-size: 14px;
            }
          }

          .modal-action-button {
            background: var(--primary);
            color: var(--background);
            border: none;
            border-radius: 8px;
            padding: 12px 32px;
            font-size: 16px;
            font-weight: 500;
            cursor: pointer;
            transition: opacity 0.2s;
            width: 100%;
            margin-bottom: 8px;
            min-height: 44px;
            touch-action: manipulation;
          }

          .modal-action-button:hover {
            opacity: 0.9;
          }

          .modal-cancel-button {
            background: transparent;
            color: var(--muted);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 12px 32px;
            font-size: 16px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
            width: 100%;
            min-height: 44px;
            touch-action: manipulation;
          }

          .modal-cancel-button:hover {
            background: var(--muted);
          }

          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: scale(0.8);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
        `}</style>
      </div>
    </div>
  );
}
