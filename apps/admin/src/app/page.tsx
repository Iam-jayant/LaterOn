"use client";

import { useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

// Whitelist of admin wallet addresses (Requirements 6.1, 6.2)
const ADMIN_WHITELIST = [
  process.env.NEXT_PUBLIC_ADMIN_WALLET_1 ?? "",
  process.env.NEXT_PUBLIC_ADMIN_WALLET_2 ?? "",
].filter(Boolean);

interface RiskTransition {
  planId: string;
  oldStatus: string;
  newStatus: string;
  walletAddress: string;
}

interface RiskKeeperResult {
  success: boolean;
  processed: number;
  transitions: RiskTransition[];
  errors?: Array<{ planId: string; error: string }>;
}

export default function AdminPage() {
  const [walletAddress, setWalletAddress] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<RiskKeeperResult | null>(null);
  const [error, setError] = useState("");

  // Basic authentication check (Requirement 6.2)
  const handleAuthenticate = () => {
    const trimmedAddress = walletAddress.trim();
    
    if (!trimmedAddress) {
      setError("Please enter a wallet address");
      return;
    }

    if (ADMIN_WHITELIST.length === 0 || ADMIN_WHITELIST.includes(trimmedAddress)) {
      setIsAuthenticated(true);
      setError("");
    } else {
      setError("Wallet address not authorized");
    }
  };

  // Run risk keeper (Requirements 6.3, 6.4, 6.5, 6.6, 6.7, 6.8)
  const runRiskKeeper = async (): Promise<void> => {
    setIsRunning(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(`${apiBase}/api/admin/risk-keeper/run`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to run risk keeper");
        return;
      }

      setResult(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to run risk keeper: ${errorMessage}`);
    } finally {
      setIsRunning(false);
    }
  };

  // Authentication screen
  if (!isAuthenticated) {
    return (
      <main>
        <section className="card">
          <h1>LaterOn Admin</h1>
          <p style={{ marginTop: 8, color: "#46544a" }}>
            Admin panel for manual risk keeper operations.
          </p>
        </section>

        <section className="card">
          <h2>Authentication Required</h2>
          <label>
            Admin Wallet Address
            <input
              type="text"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              placeholder="Enter your admin wallet address"
              style={{ fontFamily: "monospace" }}
            />
          </label>
          <button type="button" onClick={handleAuthenticate}>
            Authenticate
          </button>
          {error && <p style={{ color: "#d32f2f", marginTop: 8 }}>{error}</p>}
        </section>
      </main>
    );
  }

  // Admin panel
  return (
    <main>
      <section className="card">
        <h1>LaterOn Admin</h1>
        <p style={{ marginTop: 8, color: "#46544a" }}>
          Manual risk keeper operations console.
        </p>
        <p style={{ marginTop: 4, fontSize: 14, color: "#46544a" }}>
          Authenticated as: <code style={{ fontFamily: "monospace" }}>{walletAddress}</code>
        </p>
      </section>

      <section className="card">
        <h2>Risk Keeper</h2>
        <p style={{ marginTop: 8, marginBottom: 16, color: "#46544a", fontSize: 14 }}>
          Manually trigger risk settlement for overdue payment plans. Plans overdue by 7+ days transition to LATE, 
          plans overdue by 15+ days transition to DEFAULTED.
        </p>
        
        <button 
          type="button" 
          onClick={() => void runRiskKeeper()}
          disabled={isRunning}
          style={{ opacity: isRunning ? 0.6 : 1 }}
        >
          {isRunning ? "Running..." : "Run Risk Keeper"}
        </button>

        {error && (
          <div style={{ 
            marginTop: 16, 
            padding: 12, 
            background: "#ffebee", 
            border: "1px solid #ef5350",
            borderRadius: 8,
            color: "#c62828"
          }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {result && (
          <div style={{ marginTop: 16 }}>
            <div style={{ 
              padding: 12, 
              background: "#e8f5e9", 
              border: "1px solid #66bb6a",
              borderRadius: 8,
              marginBottom: 16
            }}>
              <strong>Risk Keeper Completed</strong>
              <p style={{ margin: "8px 0 0 0", color: "#2e7d32" }}>
                Processed {result.processed} plan{result.processed !== 1 ? "s" : ""}
              </p>
            </div>

            {result.transitions.length > 0 && (
              <div>
                <h3 style={{ marginTop: 0, marginBottom: 12 }}>Status Transitions ({result.transitions.length})</h3>
                <div style={{ 
                  border: "1px solid var(--line)", 
                  borderRadius: 8,
                  overflow: "hidden"
                }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#f5f5f5", textAlign: "left" }}>
                        <th style={{ padding: 12, borderBottom: "1px solid var(--line)" }}>Plan ID</th>
                        <th style={{ padding: 12, borderBottom: "1px solid var(--line)" }}>Wallet</th>
                        <th style={{ padding: 12, borderBottom: "1px solid var(--line)" }}>Old Status</th>
                        <th style={{ padding: 12, borderBottom: "1px solid var(--line)" }}>New Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.transitions.map((transition, idx) => (
                        <tr key={idx} style={{ borderBottom: idx < result.transitions.length - 1 ? "1px solid var(--line)" : "none" }}>
                          <td style={{ padding: 12, fontFamily: "monospace", fontSize: 13 }}>{transition.planId}</td>
                          <td style={{ padding: 12, fontFamily: "monospace", fontSize: 13 }}>
                            {transition.walletAddress.slice(0, 6)}...{transition.walletAddress.slice(-4)}
                          </td>
                          <td style={{ padding: 12 }}>
                            <span style={{ 
                              padding: "4px 8px", 
                              borderRadius: 4, 
                              background: "#fff3e0",
                              fontSize: 12,
                              fontWeight: 500
                            }}>
                              {transition.oldStatus}
                            </span>
                          </td>
                          <td style={{ padding: 12 }}>
                            <span style={{ 
                              padding: "4px 8px", 
                              borderRadius: 4, 
                              background: transition.newStatus === "DEFAULTED" ? "#ffebee" : "#fff3e0",
                              fontSize: 12,
                              fontWeight: 500
                            }}>
                              {transition.newStatus}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {result.transitions.length === 0 && (
              <p style={{ color: "#46544a", fontStyle: "italic" }}>
                No status transitions were needed. All plans are current.
              </p>
            )}

            {result.errors && result.errors.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h3 style={{ marginTop: 0, marginBottom: 12, color: "#d32f2f" }}>
                  Failed Settlements ({result.errors.length})
                </h3>
                <div style={{ 
                  border: "1px solid #ef5350", 
                  borderRadius: 8,
                  background: "#ffebee",
                  padding: 12
                }}>
                  {result.errors.map((err, idx) => (
                    <div key={idx} style={{ marginBottom: idx < (result.errors?.length ?? 0) - 1 ? 8 : 0 }}>
                      <strong style={{ fontFamily: "monospace", fontSize: 13 }}>{err.planId}:</strong>{" "}
                      <span style={{ color: "#c62828" }}>{err.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
