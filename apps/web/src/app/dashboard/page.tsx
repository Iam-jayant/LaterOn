"use client";

import type { PlanRecord, UserProfile } from "@lateron/sdk";
import { useState, useEffect } from "react";
import { useWallet } from "../../hooks/useWallet";
import { WalletModal } from "../../components/wallet-modal";
import { buildAuthHeaders, createIdempotencyKey } from "../../lib/auth";
import { signAndSubmit, decodeUnsignedTransactions } from "../../lib/transaction-signer";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

interface PlansResponse {
  plans: PlanRecord[];
  user: UserProfile;
}

interface PrepareRepaymentResponse {
  unsignedTxn: string;
  plan: PlanRecord;
  repaymentAmountAlgo: number;
}

interface ConfirmRepaymentResponse {
  success: boolean;
  plan: PlanRecord;
}

interface GiftCardDetailsResponse {
  giftCard: {
    code: string;
    pin: string;
    productName: string;
    denomination: number;
    expiresAt: string | null;
  };
}

export default function DashboardPage() {
  const { address: walletAddress } = useWallet();
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [tier, setTier] = useState<string>("NEW");
  const [laterOnScore, setLaterOnScore] = useState<number>(500);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [processingPlanId, setProcessingPlanId] = useState<string | null>(null);
  const [viewingGiftCardPlanId, setViewingGiftCardPlanId] = useState<string | null>(null);
  const [giftCardDetails, setGiftCardDetails] = useState<GiftCardDetailsResponse["giftCard"] | null>(null);
  const [giftCardLoading, setGiftCardLoading] = useState(false);
  const [giftCardError, setGiftCardError] = useState<string | null>(null);

  // Fetch plans on load when wallet is connected (Requirement 4.1)
  useEffect(() => {
    if (walletAddress) {
      void loadPlans();
    }
  }, [walletAddress]);

  const loadPlans = async (): Promise<void> => {
    if (!walletAddress) {
      setMessage("Please connect your wallet first");
      return;
    }
    
    setMessage("");
    setIsLoading(true);
    
    try {
      const authHeaders = await buildAuthHeaders(walletAddress);
      const response = await fetch(`${apiBase}/v1/plans?walletAddress=${encodeURIComponent(walletAddress)}`, {
        headers: {
          ...authHeaders
        }
      });
      const data = (await response.json()) as PlansResponse;
      if (!response.ok) {
        setMessage((data as { message?: string }).message ?? "Failed to load plans");
        return;
      }
      setPlans(data.plans);
      setTier(data.user.tier);
      setLaterOnScore(data.user.laterOnScore ?? 500);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load plans");
    } finally {
      setIsLoading(false);
    }
  };

  const repayInstallment = async (planId: string): Promise<void> => {
    if (!walletAddress) {
      setMessage("Please connect your wallet first");
      return;
    }
    
    setMessage("");
    setProcessingPlanId(planId);
    
    try {
      // Step 1: Call /api/repayment/prepare to get unsigned transaction (Requirement 4.5)
      const authHeaders = await buildAuthHeaders(walletAddress);
      const prepareResponse = await fetch(`${apiBase}/api/repayment/prepare`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders,
          "x-idempotency-key": createIdempotencyKey("repay-prepare")
        },
        body: JSON.stringify({ 
          planId,
          walletAddress 
        })
      });
      
      if (!prepareResponse.ok) {
        const errorData = await prepareResponse.json();
        throw new Error(errorData.message ?? "Failed to prepare repayment transaction");
      }
      
      const prepareData = (await prepareResponse.json()) as PrepareRepaymentResponse;
      
      // Step 2: Decode unsigned transaction
      const unsignedTxns = decodeUnsignedTransactions([prepareData.unsignedTxn]);
      
      // Step 3: Sign transaction using connected wallet (Lute/Pera/Defly) (Requirement 4.6)
      setMessage("Waiting for wallet signature...");
      const result = await signAndSubmit(unsignedTxns[0], {
        onSigning: () => setMessage("Waiting for wallet signature..."),
        onSubmitting: () => setMessage("Submitting transaction to Algorand TestNet..."),
        onConfirming: () => setMessage("Waiting for confirmation...")
      });
      
      // Step 4: Call /api/repayment/confirm with plan ID and transaction ID (Requirement 4.7)
      const confirmResponse = await fetch(`${apiBase}/api/repayment/confirm`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders,
          "x-idempotency-key": createIdempotencyKey("repay-confirm")
        },
        body: JSON.stringify({
          planId,
          txId: result.txId,
          repaymentAmountAlgo: prepareData.repaymentAmountAlgo
        })
      });
      
      if (!confirmResponse.ok) {
        const errorData = await confirmResponse.json();
        throw new Error(errorData.message ?? "Failed to confirm repayment");
      }
      
      const confirmData = (await confirmResponse.json()) as ConfirmRepaymentResponse;
      
      // Step 5: Display success message and refresh dashboard (Requirement 4.8)
      setMessage(`✓ Repayment successful! Transaction ID: ${result.txId.slice(0, 10)}...`);
      
      // Step 6: Refresh dashboard to show updated plan (Requirement 4.8)
      await loadPlans();
      
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Repayment failed");
    } finally {
      setProcessingPlanId(null);
    }
  };

  const viewGiftCard = async (planId: string): Promise<void> => {
    if (!walletAddress) {
      setGiftCardError("Please connect your wallet first");
      return;
    }
    
    setViewingGiftCardPlanId(planId);
    setGiftCardLoading(true);
    setGiftCardError(null);
    setGiftCardDetails(null);
    
    try {
      const authHeaders = await buildAuthHeaders(walletAddress);
      const response = await fetch(`${apiBase}/api/marketplace/gift-card/${encodeURIComponent(planId)}`, {
        headers: {
          ...authHeaders
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message ?? "Failed to load gift card details");
      }
      
      const data = (await response.json()) as GiftCardDetailsResponse;
      setGiftCardDetails(data.giftCard);
    } catch (error) {
      setGiftCardError(error instanceof Error ? error.message : "Failed to load gift card details");
    } finally {
      setGiftCardLoading(false);
    }
  };

  const closeGiftCardModal = (): void => {
    setViewingGiftCardPlanId(null);
    setGiftCardDetails(null);
    setGiftCardError(null);
  };

  const copyToClipboard = async (text: string, label: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`✓ ${label} copied to clipboard`);
      setTimeout(() => setMessage(""), 3000);
    } catch (error) {
      setMessage(`Failed to copy ${label}`);
    }
  };

  return (
    <main className="shell">
      <header className="site-header">
        <div className="brand">
          LaterOn
          <small>Borrower Dashboard</small>
        </div>
      </header>

      {!walletAddress ? (
        <section className="card">
          <div className="eyebrow">Wallet Required</div>
          <h2 style={{ marginTop: 10 }}>Connect wallet to continue</h2>
          <p style={{ marginTop: 6 }}>
            You need to connect your Algorand wallet to view your payment plans.
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
          <div className="eyebrow">Plans</div>
          <h2 style={{ marginTop: 10 }}>Track repayments and trust tier</h2>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <input 
              value={walletAddress} 
              disabled 
              style={{ flex: 1, padding: 10, backgroundColor: "#f5f5f5" }} 
            />
            <button 
              type="button" 
              onClick={() => void loadPlans()}
              disabled={isLoading}
            >
              {isLoading ? "Loading..." : "Refresh"}
            </button>
          </div>
          <p style={{ marginTop: 10 }}>
            Current Tier: <span className="badge">{tier}</span>
            {" | "}
            LaterOn Score: <span className="badge">{laterOnScore}</span>
          </p>

          {/* Display plan list with status, remaining amount, next due date, installments paid (Requirement 4.2) */}
          <table className="table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Plan ID</th>
                <th>Product</th>
                <th>Status</th>
                <th>Remaining ALGO</th>
                <th>Next Due</th>
                <th>Installments Paid</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => {
                const isOverdue = plan.status === "LATE" || plan.status === "DEFAULTED";
                const isGiftCard = !!plan.giftCardDetails;
                
                return (
                  <tr key={plan.planId} style={isOverdue ? { backgroundColor: "#fff3cd" } : undefined}>
                    <td>{plan.planId.slice(0, 10)}...</td>
                    <td>
                      {isGiftCard ? (
                        <div>
                          <strong>{plan.giftCardDetails!.productName}</strong>
                          <br />
                          <small>₹{plan.giftCardDetails!.denomination}</small>
                        </div>
                      ) : (
                        <span>Standard Plan</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${plan.status === "COMPLETED" ? "success" : isOverdue ? "warning" : ""}`}>
                        {plan.status}
                      </span>
                    </td>
                    <td>{plan.remainingAmountAlgo.toFixed(4)} ALGO</td>
                    <td>
                      {isOverdue ? (
                        <span style={{ color: "#856404", fontWeight: "bold" }}>
                          {new Date(plan.nextDueAtUnix * 1000).toLocaleDateString()} (Overdue)
                        </span>
                      ) : (
                        new Date(plan.nextDueAtUnix * 1000).toLocaleDateString()
                      )}
                    </td>
                    <td>{plan.installmentsPaid} / {plan.tenureMonths}</td>
                    <td>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {/* Disable "Pay Installment" button for COMPLETED plans (Requirement 4.10) */}
                        <button
                          type="button"
                          className="secondary"
                          disabled={
                            plan.status === "COMPLETED" || 
                            plan.status === "DEFAULTED" ||
                            processingPlanId === plan.planId
                          }
                          onClick={() => void repayInstallment(plan.planId)}
                        >
                          {processingPlanId === plan.planId ? "Processing..." : "Pay Installment"}
                        </button>
                        {isGiftCard && plan.installmentsPaid > 0 && (
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => void viewGiftCard(plan.planId)}
                          >
                            View Gift Card
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {plans.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "20px" }}>
                    No active plans yet. Visit checkout to create your first plan.
                  </td>
                </tr>
              ) : null}
              {isLoading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "20px" }}>
                    Loading plans...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          
          {/* Display success message after repayment (Requirement 4.8) */}
          {message ? (
            <p className={message.includes("✓") ? "success" : "error"} style={{ marginTop: 12 }}>
              {message}
            </p>
          ) : null}
        </section>
      )}

      <WalletModal 
        isOpen={isWalletModalOpen} 
        onClose={() => setIsWalletModalOpen(false)} 
      />

      {/* Gift Card Details Modal */}
      {viewingGiftCardPlanId && (
        <div 
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
          }}
          onClick={closeGiftCardModal}
        >
          <div 
            className="card"
            style={{
              maxWidth: "500px",
              width: "90%",
              maxHeight: "90vh",
              overflow: "auto"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2>Gift Card Details</h2>
              <button
                type="button"
                onClick={closeGiftCardModal}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "24px",
                  cursor: "pointer",
                  padding: "0 8px"
                }}
              >
                ×
              </button>
            </div>

            {giftCardLoading && (
              <p style={{ marginTop: 16, textAlign: "center" }}>Loading gift card details...</p>
            )}

            {giftCardError && (
              <p className="error" style={{ marginTop: 16 }}>
                {giftCardError}
              </p>
            )}

            {giftCardDetails && (
              <div style={{ marginTop: 16 }}>
                <div style={{ marginBottom: 16 }}>
                  <strong>{giftCardDetails.productName}</strong>
                  <br />
                  <span>₹{giftCardDetails.denomination}</span>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", marginBottom: 4, fontWeight: "bold" }}>
                    Gift Card Code
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      value={giftCardDetails.code}
                      readOnly
                      style={{ flex: 1, padding: 10, backgroundColor: "#f5f5f5" }}
                    />
                    <button
                      type="button"
                      onClick={() => void copyToClipboard(giftCardDetails.code, "Code")}
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", marginBottom: 4, fontWeight: "bold" }}>
                    PIN
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      value={giftCardDetails.pin}
                      readOnly
                      style={{ flex: 1, padding: 10, backgroundColor: "#f5f5f5" }}
                    />
                    <button
                      type="button"
                      onClick={() => void copyToClipboard(giftCardDetails.pin, "PIN")}
                    >
                      Copy
                    </button>
                  </div>
                </div>

                {giftCardDetails.expiresAt && (
                  <p style={{ fontSize: "14px", color: "#666" }}>
                    Expires: {new Date(giftCardDetails.expiresAt).toLocaleDateString()}
                  </p>
                )}

                <button
                  type="button"
                  onClick={closeGiftCardModal}
                  style={{ marginTop: 16, width: "100%" }}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
