"use client";

import React, { useState, useEffect } from "react";
import { useWallet } from "@/hooks/useWallet";
import { useTransactionSigner } from "@/hooks/useTransactionSigner";
import { SigningModal } from "@/components/signing-modal";
import { WalletModal } from "@/components/wallet-modal";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

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

type CheckoutStep = "quote" | "wallet" | "processing" | "success" | "error";

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
  const { signingStatus, txId, error: signingError, isModalOpen: isSigningModalOpen, closeModal } = useTransactionSigner();
  
  const [step, setStep] = useState<CheckoutStep>("quote");
  const [quote, setQuote] = useState<MarketplaceQuote | null>(null);
  const [giftCard, setGiftCard] = useState<GiftCardDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dots, setDots] = useState("");
  const [copiedField, setCopiedField] = useState<"code" | "pin" | null>(null);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  useEffect(() => {
    if (step === "quote" || step === "processing") {
      const interval = setInterval(() => {
        setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
      }, 500);
      return () => clearInterval(interval);
    }
  }, [step]);

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
        throw new Error(errorData.error?.message || "Failed to create quote");
      }

      const quoteData = (await response.json()) as MarketplaceQuote;
      setQuote(quoteData);
      setStep("wallet");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create quote";
      setError(errorMessage);
      setStep("error");
      console.error("Failed to create quote:", errorMessage, err);
    }
  };

  const handleWalletConnect = (): void => {
    setIsWalletModalOpen(true);
  };

  const handleCheckout = async (): Promise<void> => {
    if (!quote) return;

    setError(null);

    try {
      console.log("Starting checkout with quoteId:", quote.quoteId);
      
      // Step 1: Prepare checkout - get unsigned transactions from backend
      console.log("Step 1: Preparing checkout...");
      const prepareResponse = await fetch(`${apiBase}/api/marketplace/checkout/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId: quote.quoteId
        })
      });

      if (!prepareResponse.ok) {
        const errorData = await prepareResponse.json() as { error?: { message?: string; code?: string } };
        console.error("Prepare checkout error:", errorData);
        
        if (errorData.error?.code === "INSUFFICIENT_LIQUIDITY") {
          throw new Error("Insufficient pool liquidity. Please try again later.");
        } else if (errorData.error?.code === "QUOTE_EXPIRED") {
          throw new Error("Quote expired. Please create a new quote.");
        }
        
        throw new Error(errorData.error?.message || "Failed to prepare checkout. Please try again.");
      }

      const prepareData = await prepareResponse.json() as { transactions: string[] };
      console.log("Prepare response:", prepareData);

      // Check if transactions were built
      if (!prepareData.transactions || prepareData.transactions.length === 0) {
        throw new Error("No transactions returned from backend. Blockchain service may not be configured.");
      }

      // Step 2: Decode unsigned transactions
      console.log("Step 2: Decoding unsigned transactions...");
      console.log("Raw transactions from backend:", prepareData.transactions);
      
      const { decodeUnsignedTransactions } = await import("@/lib/transaction-signer");
      const unsignedTxns = decodeUnsignedTransactions(prepareData.transactions);
      
      console.log("Decoded transactions:", unsignedTxns.length, "transactions");
      console.log("Transaction objects:", unsignedTxns.map((txn, i) => ({
        index: i,
        type: (txn as any).type,
        from: (txn as any).from,
        sender: (txn as any).sender,
        genesisID: txn.genesisID,
        genesisHash: txn.genesisHash
      })));
      
      // Step 3: Sign transactions with wallet (without submitting)
      console.log("Step 3: Signing transactions with wallet...");
      const { walletService } = await import("@/lib/wallet");
      const signedTxnBlobs = await walletService.signTransaction(unsignedTxns);
      
      // Convert signed blobs to base64
      const signedTransactions = signedTxnBlobs.map(blob => 
        Buffer.from(blob).toString('base64')
      );
      
      console.log("Transactions signed successfully");

      // Step 4: Confirm checkout - submit signed transactions and get gift card
      console.log("Step 4: Confirming checkout and fulfilling gift card...");
      setStep("processing");
      
      const confirmResponse = await fetch(`${apiBase}/api/marketplace/checkout/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId: quote.quoteId,
          signedTransactions
        })
      });

      if (!confirmResponse.ok) {
        const errorData = await confirmResponse.json() as { error?: { message?: string; code?: string } };
        console.error("Confirm checkout error:", errorData);
        
        if (errorData.error?.code === "INSUFFICIENT_BALANCE") {
          throw new Error(errorData.error.message || "Insufficient ALGO balance. Please fund your wallet.");
        }
        
        if (errorData.error?.code === "FULFILLMENT_FAILED") {
          throw new Error(errorData.error.message || "Gift card delivery failed");
        }
        
        throw new Error(errorData.error?.message || "Failed to confirm checkout. Please try again.");
      }

      const confirmData = await confirmResponse.json() as {
        success: boolean;
        giftCard: GiftCardDetails;
      };

      console.log("Confirm response:", confirmData);

      if (confirmData.success && confirmData.giftCard) {
        console.log("Gift card received successfully");
        setGiftCard(confirmData.giftCard);
        setStep("success");
        onSuccess?.(confirmData.giftCard);
      } else {
        console.error("Invalid confirm response structure:", confirmData);
        throw new Error("Invalid checkout response");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Checkout failed";
      console.error("Checkout failed with error:", errorMessage, err);
      setError(errorMessage);
      setStep("error");
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
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)',
        padding: '16px'
      }}
      onClick={canClose ? handleClose : undefined}
    >
      <div 
        style={{
          background: 'var(--background)',
          borderRadius: '16px',
          padding: '32px',
          maxWidth: '500px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          textAlign: 'center'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Quote Loading */}
        {step === "quote" && (
          <>
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>⏳</div>
            <h2 style={{ 
              fontSize: '24px', 
              fontWeight: 600, 
              margin: '0 0 12px 0', 
              color: 'var(--foreground)',
              fontFamily: 'var(--font-heading)' 
            }}>
              Creating quote<span style={{ display: 'inline-block', width: '20px', textAlign: 'left' }}>{dots}</span>
            </h2>
            <p style={{ 
              fontSize: '16px', 
              color: 'var(--muted)', 
              margin: '0 0 24px 0', 
              lineHeight: 1.5,
              fontFamily: 'var(--font-sans)' 
            }}>
              Please wait while we prepare your payment details
            </p>
          </>
        )}

        {step === "wallet" && quote && (
          <>
            {/* Professional Shopping Bag Icon */}
            <div style={{ 
              width: '64px',
              height: '64px',
              margin: '0 auto 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(107,122,0,0.1)',
              borderRadius: '50%'
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6b7a00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 0 1-8 0"/>
              </svg>
            </div>
            <h2 style={{ 
              fontSize: '24px', 
              fontWeight: 600, 
              margin: '0 0 12px 0', 
              color: 'var(--foreground)',
              fontFamily: 'var(--font-heading)' 
            }}>
              Checkout
            </h2>
            
            <div style={{ textAlign: "left", marginBottom: "24px" }}>
              <p style={{ margin: "0 0 8px", fontWeight: 600, fontSize: "16px", fontFamily: "var(--font-heading)" }}>
                {brandName} - ₹{denomination}
              </p>
              <p style={{ margin: 0, fontSize: "14px", color: "var(--muted)", fontFamily: "var(--font-sans)" }}>
                {productName}
              </p>
            </div>

            <div
              style={{
                border: "1px solid rgba(107,122,0,0.2)",
                borderRadius: "12px",
                padding: "16px",
                marginBottom: "24px",
                backgroundColor: "rgba(107,122,0,0.08)",
                textAlign: "left"
              }}
            >
              <p style={{ margin: "0 0 12px", fontWeight: 600, fontSize: "14px", fontFamily: "var(--font-heading)", color: "var(--foreground)" }}>
                Payment Breakdown
              </p>
              
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "14px", fontFamily: "var(--font-sans)", color: "var(--foreground)" }}>Total Amount:</span>
                <span style={{ fontSize: "14px", fontWeight: 500, fontFamily: "var(--font-sans)", color: "var(--foreground)" }}>
                  ₹{quote.orderAmountInr} ({quote.orderAmountAlgo.toFixed(2)} ALGO)
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "14px", fontFamily: "var(--font-sans)", color: "var(--foreground)" }}>Per Installment:</span>
                <span style={{ fontSize: "14px", fontWeight: 500, fontFamily: "var(--font-sans)", color: "var(--foreground)" }}>
                  ₹{Math.ceil(quote.orderAmountInr / quote.tenureMonths)} ({quote.installmentAmountAlgo.toFixed(2)} ALGO)
                </span>
              </div>

              <div
                style={{
                  borderTop: "1px solid rgba(107,122,0,0.15)",
                  marginTop: "12px",
                  paddingTop: "12px"
                }}
              >
                <p style={{ margin: "0 0 8px", fontSize: "12px", fontWeight: 600, fontFamily: "var(--font-heading)", color: "var(--foreground)" }}>
                  {quote.tenureMonths}-Month Installment Schedule:
                </p>
                <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "12px", fontFamily: "var(--font-sans)", color: "var(--foreground)", opacity: 0.8 }}>
                  <li>Month 1: ₹{Math.ceil(quote.orderAmountInr / quote.tenureMonths)} (Today)</li>
                  <li>Month 2: ₹{Math.ceil(quote.orderAmountInr / quote.tenureMonths)}</li>
                  <li>Month 3: ₹{Math.ceil(quote.orderAmountInr / quote.tenureMonths)}</li>
                </ul>
              </div>

              <p style={{ margin: "12px 0 0", fontSize: "11px", color: "var(--foreground)", opacity: 0.7, fontFamily: "var(--font-sans)" }}>
                Exchange Rate: 1 ALGO = ₹{quote.algoToInrRate.toFixed(2)}
              </p>
            </div>

            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "12px",
                padding: "16px",
                marginBottom: "24px",
                backgroundColor: "var(--background)",
                textAlign: "left"
              }}
            >
              <p style={{ margin: "0 0 12px", fontWeight: 600, fontSize: "14px", fontFamily: "var(--font-heading)", color: "var(--foreground)" }}>
                What happens when you checkout:
              </p>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <div style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: '#6b7a00',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    fontWeight: 600,
                    flexShrink: 0,
                    fontFamily: 'var(--font-sans)'
                  }}>
                    1
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: "13px", fontWeight: 500, fontFamily: "var(--font-sans)", color: "var(--foreground)" }}>
                      You pay first installment
                    </p>
                    <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--foreground)", opacity: 0.7, fontFamily: "var(--font-sans)" }}>
                      {quote.installmentAmountAlgo.toFixed(2)} ALGO from your wallet
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <div style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: '#6b7a00',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    fontWeight: 600,
                    flexShrink: 0,
                    fontFamily: 'var(--font-sans)'
                  }}>
                    2
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: "13px", fontWeight: 500, fontFamily: "var(--font-sans)", color: "var(--foreground)" }}>
                      Pool pays remaining amount
                    </p>
                    <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--foreground)", opacity: 0.7, fontFamily: "var(--font-sans)" }}>
                      {(quote.orderAmountAlgo - quote.installmentAmountAlgo).toFixed(2)} ALGO from lending pool
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <div style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: '#6b7a00',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    fontWeight: 600,
                    flexShrink: 0,
                    fontFamily: 'var(--font-sans)'
                  }}>
                    3
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: "13px", fontWeight: 500, fontFamily: "var(--font-sans)", color: "var(--foreground)" }}>
                      Merchant receives full payment
                    </p>
                    <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--foreground)", opacity: 0.7, fontFamily: "var(--font-sans)" }}>
                      {quote.orderAmountAlgo.toFixed(2)} ALGO sent to merchant
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <div style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: '#D7E377',
                    color: '#0A0C12',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                    flexShrink: 0
                  }}>
                    🎁
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: "13px", fontWeight: 500, fontFamily: "var(--font-sans)", color: "var(--foreground)" }}>
                      You receive gift card instantly
                    </p>
                    <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--foreground)", opacity: 0.7, fontFamily: "var(--font-sans)" }}>
                      Code and PIN delivered after confirmation
                    </p>
                  </div>
                </div>
              </div>

              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  marginTop: "12px",
                  paddingTop: "12px"
                }}
              >
                <p style={{ margin: 0, fontSize: "11px", color: "var(--foreground)", opacity: 0.7, fontFamily: "var(--font-sans)" }}>
                  ⚡ All transactions happen atomically in a single blockchain operation
                </p>
              </div>
            </div>

            {!address ? (
              <button 
                onClick={handleWalletConnect} 
                style={{
                  background: 'var(--primary)',
                  color: 'var(--background)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px 32px',
                  fontSize: '16px',
                  fontWeight: 500,
                  fontFamily: 'var(--font-sans)',
                  cursor: 'pointer',
                  width: '100%',
                  marginBottom: '8px',
                  minHeight: '44px'
                }}
              >
                Connect Wallet
              </button>
            ) : (
              <>
                <p style={{ fontSize: "13px", color: "var(--foreground)", opacity: 0.7, marginBottom: "16px", fontFamily: "var(--font-sans)" }}>
                  Connected: {address.slice(0, 6)}...{address.slice(-4)}
                </p>
                <button 
                  onClick={handleCheckout} 
                  style={{
                    background: 'var(--primary)',
                    color: 'var(--background)',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '12px 32px',
                    fontSize: '16px',
                    fontWeight: 500,
                    fontFamily: 'var(--font-sans)',
                    cursor: 'pointer',
                    width: '100%',
                    marginBottom: '8px',
                    minHeight: '44px'
                  }}
                >
                  Buy Now - Pay in 3
                </button>
              </>
            )}

            <button 
              onClick={handleClose} 
              style={{
                background: 'transparent',
                color: 'var(--muted)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '12px 32px',
                fontSize: '16px',
                fontWeight: 500,
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
                width: '100%',
                minHeight: '44px'
              }}
            >
              Cancel
            </button>
          </>
        )}

        {/* Processing State */}
        {step === "processing" && (
          <>
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>⏳</div>
            <h2 style={{ 
              fontSize: '24px', 
              fontWeight: 600, 
              margin: '0 0 12px 0', 
              color: 'var(--foreground)',
              fontFamily: 'var(--font-heading)' 
            }}>
              Processing payment<span style={{ display: 'inline-block', width: '20px', textAlign: 'left' }}>{dots}</span>
            </h2>
            <p style={{ 
              fontSize: '16px', 
              color: 'var(--muted)', 
              margin: '0 0 24px 0', 
              lineHeight: 1.5,
              fontFamily: 'var(--font-sans)' 
            }}>
              Please wait while we process your purchase and deliver your gift card
            </p>
          </>
        )}

        {step === "success" && giftCard && (
          <>
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>✅</div>
            <h2 style={{ 
              fontSize: '24px', 
              fontWeight: 600, 
              margin: '0 0 12px 0', 
              color: 'var(--foreground)',
              fontFamily: 'var(--font-heading)' 
            }}>
              Purchase Complete!
            </h2>
            <p style={{ 
              fontSize: '16px', 
              color: 'var(--muted)', 
              margin: '0 0 24px 0', 
              lineHeight: 1.5,
              fontFamily: 'var(--font-sans)' 
            }}>
              Your {brandName} gift card is ready
            </p>

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
                  <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px", fontFamily: "var(--font-heading)" }}>
                    Gift Card Code:
                  </label>
                  <button
                    onClick={() => handleCopy("code", giftCard.code)}
                    style={{
                      padding: "8px 16px",
                      fontSize: "12px",
                      fontFamily: "var(--font-sans)",
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
                  <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px", fontFamily: "var(--font-heading)" }}>
                    PIN:
                  </label>
                  <button
                    onClick={() => handleCopy("pin", giftCard.pin)}
                    style={{
                      padding: "8px 16px",
                      fontSize: "12px",
                      fontFamily: "var(--font-sans)",
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
                <p style={{ margin: "12px 0 0", fontSize: "11px", color: "var(--muted)", fontFamily: "var(--font-sans)" }}>
                  Expires: {new Date(giftCard.expiresAt).toLocaleDateString()}
                </p>
              )}
            </div>

            <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "16px", fontFamily: "var(--font-sans)" }}>
              Save these details! You can also view them later in your dashboard.
            </p>

            <button 
              onClick={handleClose} 
              style={{
                background: 'var(--primary)',
                color: 'var(--background)',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 32px',
                fontSize: '16px',
                fontWeight: 500,
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
                width: '100%',
                minHeight: '44px'
              }}
            >
              Done
            </button>
          </>
        )}

        {step === "error" && (
          <>
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>❌</div>
            <h2 style={{ 
              fontSize: '24px', 
              fontWeight: 600, 
              margin: '0 0 12px 0', 
              color: 'var(--foreground)',
              fontFamily: 'var(--font-heading)' 
            }}>
              Purchase Failed
            </h2>
            <p style={{ 
              fontSize: '16px', 
              color: 'var(--muted)', 
              margin: '0 0 24px 0', 
              lineHeight: 1.5,
              fontFamily: 'var(--font-sans)' 
            }}>
              {error || "An error occurred. Please try again."}
            </p>
            
            {error && !error.includes("Contact support") && (
              <button 
                onClick={() => {
                  setStep("wallet");
                  setError(null);
                }} 
                style={{
                  background: 'var(--primary)',
                  color: 'var(--background)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px 32px',
                  fontSize: '16px',
                  fontWeight: 500,
                  fontFamily: 'var(--font-sans)',
                  cursor: 'pointer',
                  width: '100%',
                  marginBottom: '8px',
                  minHeight: '44px'
                }}
              >
                Retry
              </button>
            )}
            
            <button 
              onClick={handleClose} 
              style={{
                background: 'transparent',
                color: 'var(--muted)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '12px 32px',
                fontSize: '16px',
                fontWeight: 500,
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
                width: '100%',
                minHeight: '44px'
              }}
            >
              Close
            </button>
          </>
        )}

        <SigningModal
          isOpen={isSigningModalOpen}
          status={signingStatus}
          txId={txId}
          error={signingError}
          onClose={closeModal}
        />

        <WalletModal
          isOpen={isWalletModalOpen}
          onClose={() => setIsWalletModalOpen(false)}
        />
      </div>
    </div>
  );
}
