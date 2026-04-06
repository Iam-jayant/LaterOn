"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "../../hooks/useWallet";
import { WalletModal } from "../../components/wallet-modal";
import { SigningModal, type SigningStatus } from "../../components/signing-modal";
import { buildAuthHeaders, createIdempotencyKey, resolveMerchantKey } from "../../lib/auth";
import { signAndSubmit, decodeUnsignedTransactions } from "../../lib/transaction-signer";

interface QuoteResponse {
  quoteId: string;
  orderAmountInr: number;
  orderAmountAlgo: number;
  upfrontAmountAlgo: number;
  financedAmountAlgo: number;
  installmentAmountAlgo: number;
  tenureMonths: number;
}

interface CommitResponse {
  unsignedTxns: string[];
  planId: string;
  quote: QuoteResponse;
  message?: string; // For error responses
}

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function CheckoutPage() {
  const router = useRouter();
  const { address: walletAddress } = useWallet();
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [merchantId, setMerchantId] = useState("merchant_demo");
  const [orderAmountInr, setOrderAmountInr] = useState(1500);
  const [tenureMonths, setTenureMonths] = useState(3);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  
  // Signing modal state
  const [isSigningModalOpen, setIsSigningModalOpen] = useState(false);
  const [signingStatus, setSigningStatus] = useState<SigningStatus>("signing");
  const [txId, setTxId] = useState<string | undefined>(undefined);
  const [signingError, setSigningError] = useState<string | undefined>(undefined);

  // Fetch quote on page load if wallet is connected (Requirement 3.1)
  useEffect(() => {
    if (walletAddress && !quote && !busy) {
      void requestQuote();
    }
  }, [walletAddress]);

  const requestQuote = async (): Promise<void> => {
    if (!walletAddress) {
      setMessage("Please connect your wallet first");
      return;
    }
    
    setBusy(true);
    setMessage("");
    try {
      const authHeaders = await buildAuthHeaders(walletAddress);
      const response = await fetch(`${apiBase}/v1/quotes`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders,
          "x-merchant-key": resolveMerchantKey(merchantId)
        },
        body: JSON.stringify({
          walletAddress,
          merchantId,
          orderAmountInr,
          tenureMonths
        })
      });

      const data = await response.json();
      if (!response.ok) {
        setQuote(null);
        setMessage(data.message ?? "Unable to fetch quote");
        return;
      }

      setQuote(data);
      setMessage(""); // Clear any previous messages
    } catch (error) {
      setQuote(null);
      setMessage("Unable to reach API.");
      console.error(error);
    } finally {
      setBusy(false);
    }
  };

  const commitCheckout = async (): Promise<void> => {
    if (!walletAddress) {
      setMessage("Please connect your wallet first");
      return;
    }
    
    if (!quote) {
      setMessage("Please get a quote first");
      return;
    }
    
    setBusy(true);
    setMessage("");
    
    try {
      // Step 1: Call /api/checkout/commit to get unsigned transactions (Requirement 3.3)
      const authHeaders = await buildAuthHeaders(walletAddress);
      const commitResponse = await fetch(`${apiBase}/api/checkout/commit`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders,
          "x-merchant-key": resolveMerchantKey(merchantId),
          "x-idempotency-key": createIdempotencyKey("checkout")
        },
        body: JSON.stringify({
          quoteId: quote.quoteId
        })
      });

      const commitData: CommitResponse = await commitResponse.json();
      if (!commitResponse.ok) {
        setMessage(commitData.message ?? "Failed to prepare checkout transaction");
        return;
      }

      // Step 2: Decode unsigned transactions
      const unsignedTxns = decodeUnsignedTransactions(commitData.unsignedTxns);

      // Step 3: Sign and submit transaction group using connected wallet (Requirements 3.7, 3.8)
      setIsSigningModalOpen(true);
      setSigningStatus("signing");
      setSigningError(undefined);
      setTxId(undefined);

      const result = await signAndSubmit(unsignedTxns, {
        onSigning: () => setSigningStatus("signing"),
        onSubmitting: () => setSigningStatus("submitting"),
        onConfirming: () => setSigningStatus("confirming"),
      });

      // Step 4: Transaction confirmed, update modal (Requirement 3.9)
      setSigningStatus("success");
      setTxId(result.txId);

      // Step 5: Call /api/checkout/confirm to save plan to database (Requirement 3.10)
      const confirmResponse = await fetch(`${apiBase}/api/checkout/confirm`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          planId: commitData.planId,
          txId: result.txId,
        })
      });

      const confirmData = await confirmResponse.json();
      if (!confirmResponse.ok) {
        throw new Error(confirmData.message ?? "Failed to confirm checkout");
      }

      // Step 6: Navigate to dashboard with success message (Requirement 3.11)
      setTimeout(() => {
        router.push(`/dashboard?success=true&planId=${commitData.planId}`);
      }, 2000);

    } catch (error) {
      // Handle errors gracefully
      const errorMessage = error instanceof Error ? error.message : "Transaction failed";
      setSigningStatus("error");
      setSigningError(errorMessage);
      setMessage(errorMessage);
      console.error("Checkout error:", error);
    } finally {
      setBusy(false);
    }
  };

  const handleSigningModalClose = () => {
    setIsSigningModalOpen(false);
    setSigningStatus("signing");
    setTxId(undefined);
    setSigningError(undefined);
  };

  return (
    <main className="shell">
      <header className="site-header">
        <div className="brand">
          LaterOn
          <small>Checkout</small>
        </div>
      </header>

      {!walletAddress ? (
        <section className="card">
          <div className="eyebrow">Wallet Required</div>
          <h2 style={{ marginTop: 10 }}>Connect wallet to continue</h2>
          <p style={{ marginTop: 6 }}>
            You need to connect your Algorand wallet to create a checkout plan.
          </p>
          <button 
            type="button" 
            onClick={() => setIsWalletModalOpen(true)}
            style={{ marginTop: 14 }}
          >
            Connect Wallet
          </button>
        </section>
      ) : (
        <section className="card">
          <div className="eyebrow">Pay LaterOn</div>
          <h2 style={{ marginTop: 10 }}>Create an ALGO checkout plan</h2>
          <p style={{ marginTop: 6 }}>ALGO-only in v1. INR values are display context for repayment clarity.</p>

          <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
            <label>
              Wallet Address
              <input 
                value={walletAddress} 
                disabled 
                style={{ width: "100%", marginTop: 6, padding: 10, backgroundColor: "#f5f5f5" }} 
              />
            </label>
            <label>
              Merchant Id
              <input value={merchantId} onChange={(event) => setMerchantId(event.target.value)} style={{ width: "100%", marginTop: 6, padding: 10 }} />
            </label>
            <label>
              Order Amount (INR)
              <input
                type="number"
                min={500}
                max={20000}
                value={orderAmountInr}
                onChange={(event) => setOrderAmountInr(Number(event.target.value))}
                style={{ width: "100%", marginTop: 6, padding: 10 }}
              />
            </label>
            <label>
              Tenure
              <select value={tenureMonths} onChange={(event) => setTenureMonths(Number(event.target.value))} style={{ width: "100%", marginTop: 6, padding: 10 }}>
                <option value={3}>Pay in 3</option>
                <option value={6}>Pay in 6</option>
                <option value={9}>Pay in 9</option>
                <option value={12}>Pay in 12</option>
              </select>
            </label>
          </div>

          {/* Display quote details (Requirement 3.2) */}
          {quote && (
            <div style={{ 
              marginTop: 18, 
              padding: 16, 
              backgroundColor: "#f0f9ff", 
              borderRadius: 8,
              border: "1px solid #bae6fd"
            }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Quote Details</h3>
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Order Amount:</span>
                  <span style={{ fontWeight: 500 }}>{quote.orderAmountAlgo.toFixed(3)} ALGO</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Down Payment:</span>
                  <span style={{ fontWeight: 500 }}>{quote.upfrontAmountAlgo.toFixed(3)} ALGO</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Financed Amount:</span>
                  <span style={{ fontWeight: 500 }}>{quote.financedAmountAlgo.toFixed(3)} ALGO</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid #bae6fd" }}>
                  <span>Monthly Installment:</span>
                  <span style={{ fontWeight: 600, color: "#0369a1" }}>{quote.installmentAmountAlgo.toFixed(3)} ALGO</span>
                </div>
              </div>
            </div>
          )}

          <div className="actions">
            <button type="button" onClick={() => void requestQuote()} disabled={busy}>
              {quote ? "Refresh Quote" : "Get Quote"}
            </button>
            <button type="button" className="primary" onClick={() => void commitCheckout()} disabled={busy || !quote}>
              Confirm Purchase
            </button>
          </div>

          {message ? <p className="error" style={{ marginTop: 10 }}>{message}</p> : null}
        </section>
      )}

      <WalletModal 
        isOpen={isWalletModalOpen} 
        onClose={() => setIsWalletModalOpen(false)} 
      />

      <SigningModal
        isOpen={isSigningModalOpen}
        status={signingStatus}
        txId={txId}
        error={signingError}
        onClose={handleSigningModalClose}
      />
    </main>
  );
}
