"use client";

import { useState, useEffect } from "react";
import algosdk from "algosdk";
import { useTransactionSigner } from "@/hooks/useTransactionSigner";
import { SigningModal } from "@/components/signing-modal";
import { getAlgodClient } from "@/lib/transaction-signer";

interface ASAOptInProps {
  walletAddress: string;
  asaId: number;
  onComplete: () => void;
  onSkip: () => void;
}

export function ASAOptIn({
  walletAddress,
  asaId,
  onComplete,
  onSkip,
}: ASAOptInProps) {
  const [balance, setBalance] = useState<number | null>(null);
  const [isCheckingBalance, setIsCheckingBalance] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    isModalOpen,
    signingStatus,
    txId,
    error: txError,
    signAndSubmitTransactions,
    closeModal,
  } = useTransactionSigner();

  const MIN_BALANCE = 0.1;

  // Check balance on mount
  useEffect(() => {
    checkBalance();
  }, [walletAddress]);

  const checkBalance = async () => {
    setIsCheckingBalance(true);
    setError(null);
    try {
      const algodClient = getAlgodClient();
      const accountInfo = await algodClient.accountInformation(walletAddress).do();
      const algoBalance = Number(accountInfo.amount) / 1_000_000; // Convert microAlgos to ALGO
      setBalance(algoBalance);
    } catch (err) {
      console.error("Failed to check balance:", err);
      setError("Failed to check wallet balance. Please try again.");
    } finally {
      setIsCheckingBalance(false);
    }
  };

  const handleOptIn = async () => {
    if (balance === null || balance < MIN_BALANCE) return;

    setIsProcessing(true);
    setError(null);

    try {
      const algodClient = getAlgodClient();
      const params = await algodClient.getTransactionParams().do();

      // Create ASA opt-in transaction (0 amount transfer to self)
      const optInTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: walletAddress,
        receiver: walletAddress,
        amount: 0,
        assetIndex: asaId,
        suggestedParams: params,
      });

      // Sign and submit
      await signAndSubmitTransactions(optInTxn);

      // Wait a moment for the transaction to be confirmed
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Call onComplete to trigger backend ASA transfer
      onComplete();
    } catch (err) {
      console.error("ASA opt-in failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to opt-in to Score ASA. Please try again."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  if (isCheckingBalance) {
    return (
      <div className="container">
        <div className="card">
          <div className="spinner" />
          <p>Checking wallet balance...</p>
        </div>
        <style jsx>{`
          .container {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }

          .card {
            background: white;
            border-radius: 16px;
            padding: 48px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          }

          .spinner {
            width: 48px;
            height: 48px;
            border: 4px solid #f0f0f0;
            border-top-color: #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 16px;
          }

          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }

          .card p {
            font-size: 16px;
            color: #666;
            margin: 0;
          }
        `}</style>
      </div>
    );
  }

  const hasSufficientBalance = balance !== null && balance >= MIN_BALANCE;

  return (
    <>
      <div className="container">
        <div className="card">
          <div className="icon">🏆</div>
          <h2 className="title">Receive Your Score Token</h2>

          {!hasSufficientBalance ? (
            <>
              <p className="message">
                To receive your LaterOn Score token (ASA), you need at least{" "}
                <strong>{MIN_BALANCE} ALGO</strong> in your wallet.
              </p>
              <div className="balance-info">
                <div className="balance-row">
                  <span>Current Balance:</span>
                  <span className="balance-value">
                    {balance?.toFixed(4) || "0"} ALGO
                  </span>
                </div>
                <div className="balance-row">
                  <span>Required:</span>
                  <span className="balance-value">{MIN_BALANCE} ALGO</span>
                </div>
              </div>
              <p className="note">
                This balance is required to hold the ASA in your wallet. Add
                funds and retry, or skip for now and claim your token later from
                the dashboard.
              </p>
              <div className="button-group">
                <button onClick={checkBalance} className="retry-button">
                  Retry
                </button>
                <button onClick={onSkip} className="skip-button">
                  Skip for Now
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="message">
                Your LaterOn Score token is ready! This token represents your
                credit score on the Algorand blockchain.
              </p>
              <div className="asa-info">
                <div className="asa-row">
                  <span>Asset ID:</span>
                  <span className="asa-value">{asaId}</span>
                </div>
                <div className="asa-row">
                  <span>Asset Name:</span>
                  <span className="asa-value">LaterOn Score (LTRSCR)</span>
                </div>
              </div>
              {error && <div className="error-message">{error}</div>}
              <div className="button-group">
                <button
                  onClick={handleOptIn}
                  disabled={isProcessing}
                  className="optin-button"
                >
                  {isProcessing ? "Processing..." : "Receive Token"}
                </button>
                <button
                  onClick={onSkip}
                  disabled={isProcessing}
                  className="skip-button"
                >
                  Skip for Now
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <SigningModal
        isOpen={isModalOpen}
        status={signingStatus}
        txId={txId}
        error={txError}
        onClose={closeModal}
      />

      <style jsx>{`
        .container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 24px;
        }

        .card {
          background: white;
          border-radius: 16px;
          padding: 48px;
          max-width: 500px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          text-align: center;
        }

        .icon {
          font-size: 64px;
          margin-bottom: 16px;
        }

        .title {
          font-size: 28px;
          font-weight: 600;
          margin: 0 0 16px 0;
          color: #1a1a1a;
        }

        .message {
          font-size: 16px;
          line-height: 1.6;
          color: #666;
          margin: 0 0 24px 0;
        }

        .balance-info,
        .asa-info {
          background: #f5f5f5;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 16px;
        }

        .balance-row,
        .asa-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 16px;
        }

        .balance-row:last-child,
        .asa-row:last-child {
          margin-bottom: 0;
        }

        .balance-value,
        .asa-value {
          font-weight: 600;
          color: #333;
        }

        .note {
          font-size: 14px;
          color: #999;
          line-height: 1.5;
          margin: 0 0 24px 0;
        }

        .error-message {
          background: #fee;
          color: #c33;
          padding: 12px;
          border-radius: 8px;
          font-size: 14px;
          margin-bottom: 16px;
        }

        .button-group {
          display: flex;
          gap: 12px;
        }

        .retry-button,
        .optin-button,
        .skip-button {
          flex: 1;
          padding: 14px 24px;
          font-size: 16px;
          font-weight: 500;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .retry-button,
        .optin-button {
          background: #0066cc;
          color: white;
        }

        .retry-button:hover,
        .optin-button:hover:not(:disabled) {
          background: #0052a3;
        }

        .optin-button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .skip-button {
          background: #f5f5f5;
          color: #666;
        }

        .skip-button:hover:not(:disabled) {
          background: #e0e0e0;
        }

        .skip-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </>
  );
}
