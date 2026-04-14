"use client";

import type { PlanRecord, UserProfile } from "@lateron/sdk";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "../../hooks/useWallet";
import { WalletModal } from "../../components/wallet-modal";
import { buildAuthHeaders, createIdempotencyKey } from "../../lib/auth";
import { signAndSubmit, decodeUnsignedTransactions } from "../../lib/transaction-signer";
import { apiClient } from "../../lib/api";

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

interface DataAccessLogEntry {
  operation: string;
  accessedBy: string;
  accessedAt: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { address: walletAddress, disconnect } = useWallet();
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [tier, setTier] = useState<string>("NEW");
  const [laterOnScore, setLaterOnScore] = useState<number>(500);
  const [scoreAsaId, setScoreAsaId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [processingPlanId, setProcessingPlanId] = useState<string | null>(null);
  const [viewingGiftCardPlanId, setViewingGiftCardPlanId] = useState<string | null>(null);
  const [giftCardDetails, setGiftCardDetails] = useState<GiftCardDetailsResponse["giftCard"] | null>(null);
  const [giftCardLoading, setGiftCardLoading] = useState(false);
  const [giftCardError, setGiftCardError] = useState<string | null>(null);
  
  // Off-Chain section state
  const [dataAccessLogs, setDataAccessLogs] = useState<DataAccessLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch plans on load when wallet is connected (Requirement 4.1)
  useEffect(() => {
    if (walletAddress) {
      void loadPlans();
      void loadDataAccessLogs();
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
      // Mock score ASA ID for now (can be fetched from user profile when backend is ready)
      setScoreAsaId(data.user.laterOnScore ? 123456789 : null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load plans");
    } finally {
      setIsLoading(false);
    }
  };

  const loadDataAccessLogs = async (): Promise<void> => {
    if (!walletAddress) return;
    
    setLogsLoading(true);
    setLogsError(null);
    
    try {
      const authHeaders = await buildAuthHeaders(walletAddress);
      const authToken = authHeaders.authorization?.replace("Bearer ", "") ?? "";
      const logs = await apiClient.getDataAccessLog(authToken);
      setDataAccessLogs(logs);
    } catch (error) {
      setLogsError(error instanceof Error ? error.message : "Failed to load data access logs");
    } finally {
      setLogsLoading(false);
    }
  };

  const handleDeleteUserData = async (): Promise<void> => {
    if (!walletAddress) return;
    
    setIsDeleting(true);
    setMessage("");
    
    try {
      const authHeaders = await buildAuthHeaders(walletAddress);
      const authToken = authHeaders.authorization?.replace("Bearer ", "") ?? "";
      await apiClient.deleteUserData(authToken);
      
      // Disconnect wallet and navigate to landing
      await disconnect();
      router.push("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete user data");
      setIsDeleting(false);
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

      {/* On-Chain Section (Task 9.1) */}
      {walletAddress && (
        <section className="card" style={{ marginTop: 20 }}>
          <div className="eyebrow">On-Chain (Algorand - Immutable)</div>
          <h2 style={{ marginTop: 10 }}>Blockchain Records</h2>
          <p style={{ marginTop: 6, fontSize: "14px", color: "#666" }}>
            Immutable records stored on the Algorand blockchain
          </p>

          {/* Score ASA Display */}
          <div style={{ marginTop: 16, padding: 16, backgroundColor: "#f5f6f0", borderRadius: 8 }}>
            <h3 style={{ fontSize: "16px", marginBottom: 8 }}>Score ASA (Algorand Standard Asset)</h3>
            {scoreAsaId ? (
              <div>
                <p style={{ marginBottom: 4 }}>
                  <strong>Asset ID:</strong> {scoreAsaId}
                </p>
                <p style={{ marginBottom: 4 }}>
                  <strong>Current Score:</strong> {laterOnScore}
                </p>
                <p style={{ marginBottom: 4 }}>
                  <strong>Tier:</strong> {tier}
                </p>
                <a
                  href={`https://testnet.algoexplorer.io/asset/${scoreAsaId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#6b7a00", textDecoration: "underline", fontSize: "14px" }}
                >
                  View on AlgoExplorer →
                </a>
              </div>
            ) : (
              <p style={{ fontSize: "14px", color: "#666" }}>No Score ASA minted yet</p>
            )}
          </div>

          {/* BNPL Payment Plans */}
          <div style={{ marginTop: 16, padding: 16, backgroundColor: "#f5f6f0", borderRadius: 8 }}>
            <h3 style={{ fontSize: "16px", marginBottom: 8 }}>BNPL Payment Plans</h3>
            {plans.length > 0 ? (
              <div style={{ fontSize: "14px" }}>
                {plans.map((plan) => (
                  <div key={plan.planId} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #ddd" }}>
                    <p style={{ marginBottom: 4 }}>
                      <strong>Plan ID:</strong> {plan.planId}
                    </p>
                    <p style={{ marginBottom: 4 }}>
                      <strong>Status:</strong> {plan.status}
                    </p>
                    <p style={{ marginBottom: 4 }}>
                      <strong>Created:</strong> {new Date(plan.createdAtUnix * 1000).toLocaleString()}
                    </p>
                    <p style={{ fontSize: "12px", color: "#666" }}>
                      On-chain transaction IDs available in plan details
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: "14px", color: "#666" }}>No payment plans yet</p>
            )}
          </div>

          {/* Consent Transaction (mocked for MVP) */}
          <div style={{ marginTop: 16, padding: 16, backgroundColor: "#f5f6f0", borderRadius: 8 }}>
            <h3 style={{ fontSize: "16px", marginBottom: 8 }}>Consent Transaction</h3>
            <p style={{ marginBottom: 4, fontSize: "14px" }}>
              <strong>Purpose:</strong> Credit Scoring & Wallet Analysis
            </p>
            <p style={{ marginBottom: 4, fontSize: "14px", color: "#666" }}>
              Transaction ID: (Available after onboarding flow)
            </p>
          </div>
        </section>
      )}

      {/* Off-Chain Section (Task 9.2) */}
      {walletAddress && (
        <section className="card" style={{ marginTop: 20 }}>
          <div className="eyebrow">Off-Chain (Encrypted - DPDP)</div>
          <h2 style={{ marginTop: 10 }}>Personal Data & Privacy</h2>
          <p style={{ marginTop: 6, fontSize: "14px", color: "#666" }}>
            Your personal information protected under DPDP Act 2023
          </p>

          {/* User Profile (editable - placeholder for now) */}
          <div style={{ marginTop: 16, padding: 16, backgroundColor: "#f5f6f0", borderRadius: 8 }}>
            <h3 style={{ fontSize: "16px", marginBottom: 8 }}>Profile Information</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: "14px", fontWeight: "bold" }}>
                Name
              </label>
              <input
                type="text"
                placeholder="Not set"
                disabled
                style={{ width: "100%", padding: 8, backgroundColor: "#fff", border: "1px solid #ddd", borderRadius: 4 }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: "14px", fontWeight: "bold" }}>
                Email
              </label>
              <input
                type="email"
                placeholder="Not set"
                disabled
                style={{ width: "100%", padding: 8, backgroundColor: "#fff", border: "1px solid #ddd", borderRadius: 4 }}
              />
            </div>
            <p style={{ fontSize: "12px", color: "#666" }}>
              Profile editing will be available after onboarding flow implementation
            </p>
          </div>

          {/* Data Access Log */}
          <div style={{ marginTop: 16, padding: 16, backgroundColor: "#f5f6f0", borderRadius: 8 }}>
            <h3 style={{ fontSize: "16px", marginBottom: 8 }}>Data Access Log</h3>
            {logsLoading ? (
              <p style={{ fontSize: "14px", color: "#666" }}>Loading access logs...</p>
            ) : logsError ? (
              <p style={{ fontSize: "14px", color: "#cc0000" }}>{logsError}</p>
            ) : dataAccessLogs.length > 0 ? (
              <table style={{ width: "100%", fontSize: "14px", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #ddd" }}>
                    <th style={{ textAlign: "left", padding: "8px 4px" }}>Operation</th>
                    <th style={{ textAlign: "left", padding: "8px 4px" }}>Accessed By</th>
                    <th style={{ textAlign: "left", padding: "8px 4px" }}>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {dataAccessLogs.map((log, index) => (
                    <tr key={index} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "8px 4px" }}>{log.operation}</td>
                      <td style={{ padding: "8px 4px" }}>{log.accessedBy}</td>
                      <td style={{ padding: "8px 4px" }}>
                        {new Date(log.accessedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ fontSize: "14px", color: "#666" }}>No data access logs yet</p>
            )}
          </div>

          {/* Data Deletion */}
          <div style={{ marginTop: 16, padding: 16, backgroundColor: "#fff3cd", borderRadius: 8, border: "1px solid #ffc107" }}>
            <h3 style={{ fontSize: "16px", marginBottom: 8, color: "#856404" }}>Right to Erasure</h3>
            <p style={{ fontSize: "14px", marginBottom: 12, color: "#856404" }}>
              You have the right to request deletion of your personal data under DPDP Act 2023.
              This action will permanently delete your account and all associated data.
            </p>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
              style={{
                backgroundColor: "#cc0000",
                color: "#fff",
                border: "none",
                padding: "10px 16px",
                borderRadius: 4,
                cursor: isDeleting ? "not-allowed" : "pointer",
                opacity: isDeleting ? 0.6 : 1
              }}
            >
              {isDeleting ? "Deleting..." : "Request Data Deletion"}
            </button>
          </div>
        </section>
      )}

      <WalletModal 
        isOpen={isWalletModalOpen} 
        onClose={() => setIsWalletModalOpen(false)} 
      />

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
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
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div 
            className="card"
            style={{
              maxWidth: "500px",
              width: "90%",
              backgroundColor: "#fff"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: "#cc0000" }}>Confirm Data Deletion</h2>
            <p style={{ marginTop: 12, fontSize: "14px" }}>
              Are you sure you want to delete all your data? This action cannot be undone.
            </p>
            <p style={{ marginTop: 8, fontSize: "14px", fontWeight: "bold" }}>
              This will:
            </p>
            <ul style={{ marginTop: 8, fontSize: "14px", paddingLeft: 20 }}>
              <li>Delete your user profile</li>
              <li>Mark all payment plans as DELETED</li>
              <li>Remove all consent records</li>
              <li>Delete all data access logs</li>
              <li>Disconnect your wallet</li>
            </ul>
            <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  void handleDeleteUserData();
                }}
                disabled={isDeleting}
                style={{
                  flex: 1,
                  backgroundColor: "#cc0000",
                  color: "#fff",
                  border: "none"
                }}
              >
                {isDeleting ? "Deleting..." : "Delete My Data"}
              </button>
            </div>
          </div>
        </div>
      )}

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
