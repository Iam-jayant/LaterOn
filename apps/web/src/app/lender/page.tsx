"use client";

import { useState, useEffect } from "react";
import { useWallet } from "../../hooks/useWallet";
import { WalletModal } from "../../components/wallet-modal";
import { buildAuthHeaders, createIdempotencyKey } from "../../lib/auth";
import { signAndSubmit, decodeUnsignedTransactions } from "../../lib/transaction-signer";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

interface PoolStats {
  totalDepositsAlgo: number;
  totalLentAlgo: number;
  availableLiquidityAlgo: number;
}

interface PrepareDepositResponse {
  unsignedTxn: string;
  amountAlgo: number;
  poolAddress: string;
}

interface ConfirmDepositResponse {
  success: boolean;
  deposit: {
    lenderAddress: string;
    amountAlgo: number;
    txId: string;
  };
}

export default function LenderPage() {
  const { address: walletAddress } = useWallet();
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [amountAlgo, setAmountAlgo] = useState("");
  const [poolStats, setPoolStats] = useState<PoolStats | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDepositing, setIsDepositing] = useState(false);

  // Fetch pool statistics on load when wallet is connected (Requirement 7.1)
  useEffect(() => {
    if (walletAddress) {
      void loadPoolStats();
    }
  }, [walletAddress]);

  const loadPoolStats = async (): Promise<void> => {
    setMessage("");
    setIsLoading(true);
    
    try {
      const response = await fetch(`${apiBase}/api/lender/stats`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message ?? "Failed to load pool statistics");
      }
      
      const data = (await response.json()) as PoolStats;
      setPoolStats(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load pool statistics");
    } finally {
      setIsLoading(false);
    }
  };

  const deposit = async (): Promise<void> => {
    if (!walletAddress) {
      setMessage("Please connect your wallet first");
      return;
    }
    
    // Validate amount is positive (Requirement 7.2)
    const amount = parseFloat(amountAlgo);
    if (isNaN(amount) || amount <= 0) {
      setMessage("Please enter a valid positive amount");
      return;
    }
    
    setMessage("");
    setIsDepositing(true);
    
    try {
      // Step 1: Call /api/lender/deposit/prepare to get unsigned transaction (Requirement 7.3)
      const authHeaders = await buildAuthHeaders(walletAddress);
      const prepareResponse = await fetch(`${apiBase}/api/lender/deposit/prepare`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders,
          "x-idempotency-key": createIdempotencyKey("deposit-prepare")
        },
        body: JSON.stringify({ 
          lenderAddress: walletAddress,
          amountAlgo: amount
        })
      });
      
      if (!prepareResponse.ok) {
        const errorData = await prepareResponse.json();
        throw new Error(errorData.message ?? "Failed to prepare deposit transaction");
      }
      
      const prepareData = (await prepareResponse.json()) as PrepareDepositResponse;
      
      // Step 2: Decode unsigned transaction
      const unsignedTxns = decodeUnsignedTransactions([prepareData.unsignedTxn]);
      
      // Step 3: Sign transaction using connected wallet (Lute/Pera/Defly) (Requirement 7.4)
      setMessage("Waiting for wallet signature...");
      const result = await signAndSubmit(unsignedTxns[0], {
        onSigning: () => setMessage("Waiting for wallet signature..."),
        onSubmitting: () => setMessage("Submitting transaction to Algorand TestNet..."),
        onConfirming: () => setMessage("Waiting for confirmation...")
      });
      
      // Step 4: Call /api/lender/deposit/confirm with transaction ID (Requirement 7.5)
      const confirmResponse = await fetch(`${apiBase}/api/lender/deposit/confirm`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders,
          "x-idempotency-key": createIdempotencyKey("deposit-confirm")
        },
        body: JSON.stringify({
          lenderAddress: walletAddress,
          amountAlgo: amount,
          txId: result.txId
        })
      });
      
      if (!confirmResponse.ok) {
        const errorData = await confirmResponse.json();
        throw new Error(errorData.message ?? "Failed to confirm deposit");
      }
      
      await confirmResponse.json();
      
      // Step 5: Display success message and refresh pool statistics (Requirement 7.6)
      setMessage(`✓ Deposit successful! ${amount} ALGO deposited. Transaction ID: ${result.txId.slice(0, 10)}...`);
      
      // Step 6: Refresh pool statistics (Requirement 7.6)
      await loadPoolStats();
      
      // Clear amount input
      setAmountAlgo("");
      
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Deposit failed");
    } finally {
      setIsDepositing(false);
    }
  };

  return (
    <main className="shell">
      <header className="site-header">
        <div className="brand">
          LaterOn
          <small>Lender Portal</small>
        </div>
      </header>

      {!walletAddress ? (
        <section className="card">
          <div className="eyebrow">Wallet Required</div>
          <h2 style={{ marginTop: 10 }}>Connect wallet to continue</h2>
          <p style={{ marginTop: 6 }}>
            You need to connect your Algorand wallet to manage liquidity pool deposits.
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
        <>
          {/* Display pool statistics: total deposits, total lent, available liquidity (Requirement 7.1) */}
          <section className="card">
            <div className="eyebrow">Pool Statistics</div>
            <h2 style={{ marginTop: 10 }}>Liquidity Pool Overview</h2>
            
            {isLoading ? (
              <p style={{ marginTop: 14 }}>Loading pool statistics...</p>
            ) : poolStats ? (
              <div className="stats" style={{ marginTop: 14 }}>
                <div className="stat">
                  <small>Total Deposits</small>
                  <strong>{poolStats.totalDepositsAlgo.toFixed(4)} ALGO</strong>
                </div>
                <div className="stat">
                  <small>Total Lent</small>
                  <strong>{poolStats.totalLentAlgo.toFixed(4)} ALGO</strong>
                </div>
                <div className="stat">
                  <small>Available Liquidity</small>
                  <strong>{poolStats.availableLiquidityAlgo.toFixed(4)} ALGO</strong>
                </div>
              </div>
            ) : (
              <p style={{ marginTop: 14 }}>Unable to load pool statistics</p>
            )}
            
            <button 
              type="button" 
              className="secondary"
              onClick={() => void loadPoolStats()}
              disabled={isLoading}
              style={{ marginTop: 14 }}
            >
              {isLoading ? "Loading..." : "Refresh Statistics"}
            </button>
          </section>

          {/* Deposit form with amount input and validation (Requirement 7.2) */}
          <section className="card">
            <div className="eyebrow">Deposit</div>
            <h2 style={{ marginTop: 10 }}>Add liquidity to the pool</h2>
            
            <div style={{ marginTop: 14 }}>
              <label htmlFor="wallet-address" style={{ display: "block", marginBottom: 6, fontSize: "14px" }}>
                Your Wallet Address
              </label>
              <input 
                id="wallet-address"
                value={walletAddress} 
                disabled 
                style={{ width: "100%", padding: 10, backgroundColor: "#f5f5f5" }} 
              />
            </div>
            
            <div style={{ marginTop: 14 }}>
              <label htmlFor="deposit-amount" style={{ display: "block", marginBottom: 6, fontSize: "14px" }}>
                Deposit Amount (ALGO)
              </label>
              <input
                id="deposit-amount"
                type="number"
                min="0.1"
                step="0.1"
                placeholder="Enter amount in ALGO"
                value={amountAlgo}
                onChange={(event) => setAmountAlgo(event.target.value)}
                disabled={isDepositing}
                style={{ width: "100%", padding: 10 }}
              />
            </div>

            {/* Implement "Deposit" button calling /api/lender/deposit/prepare (Requirement 7.4) */}
            <button 
              type="button" 
              onClick={() => void deposit()}
              disabled={isDepositing || !amountAlgo}
              style={{ marginTop: 14, width: "100%" }}
            >
              {isDepositing ? "Processing..." : "Deposit ALGO"}
            </button>

            {/* Show warning that withdrawals are not supported in MVP (Requirement 7.7) */}
            <div style={{ 
              marginTop: 14, 
              padding: 12, 
              backgroundColor: "#fff3cd", 
              border: "1px solid #ffc107",
              borderRadius: 4 
            }}>
              <p style={{ margin: 0, fontSize: "14px", color: "#856404" }}>
                ⚠️ <strong>Note:</strong> Withdrawals are not supported in this MVP version. 
                Only deposit funds you are comfortable locking in the pool.
              </p>
            </div>

            {/* Display success message and refresh pool statistics (Requirement 7.6) */}
            {message ? (
              <p 
                className={message.includes("✓") ? "success" : "error"} 
                style={{ marginTop: 14 }}
              >
                {message}
              </p>
            ) : null}
          </section>
        </>
      )}

      <WalletModal 
        isOpen={isWalletModalOpen} 
        onClose={() => setIsWalletModalOpen(false)} 
      />
    </main>
  );
}
