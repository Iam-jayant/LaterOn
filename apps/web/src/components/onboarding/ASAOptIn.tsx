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
            background: #FFFFFF;
          }

          .card {
            background: #FFFFFF;
            border: 1px solid rgba(10,12,18,0.07);
            border-radius: 20px;
            padding: 48px;
            text-align: center;
            box-shadow: 0 4px 16px rgba(10,12,18,0.06);
          }

          .spinner {
            width: 48px;
            height: 48px;
            border: 4px solid rgba(10,12,18,0.1);
            border-top-color: #6b7a00;
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
            font-family: 'Inter', sans-serif;
            font-size: 16px;
            color: rgba(10,12,18,0.6);
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
          <div className="icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L13.09 8.26L20 9L13.09 9.74L12 16L10.91 9.74L4 9L10.91 8.26L12 2Z" fill="#6b7a00"/>
              <path d="M12 16L13.09 22.26L20 23L13.09 23.74L12 30L10.91 23.74L4 23L10.91 22.26L12 16Z" fill="#D7E377"/>
            </svg>
          </div>
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
          background: #FFFFFF;
          padding: 24px;
        }

        .card {
          background: #FFFFFF;
          border: 1px solid rgba(10,12,18,0.07);
          border-radius: 20px;
          padding: 48px;
          max-width: 500px;
          width: 100%;
          box-shadow: 0 4px 16px rgba(10,12,18,0.06);
          text-align: center;
        }

        .icon {
          display: flex;
          justify-content: center;
          margin-bottom: 16px;
        }

        .title {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 28px;
          font-weight: 700;
          margin: 0 0 16px 0;
          color: #0A0C12;
          letter-spacing: -0.5px;
        }

        .message {
          font-family: 'Inter', sans-serif;
          font-size: 16px;
          line-height: 1.6;
          color: rgba(10,12,18,0.65);
          margin: 0 0 24px 0;
        }

        .balance-info,
        .asa-info {
          background: rgba(10,12,18,0.02);
          border: 1px solid rgba(10,12,18,0.06);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 16px;
        }

        .balance-row,
        .asa-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 12px;
          font-family: 'Inter', sans-serif;
          font-size: 15px;
        }

        .balance-row:last-child,
        .asa-row:last-child {
          margin-bottom: 0;
        }

        .balance-value,
        .asa-value {
          font-weight: 600;
          color: #0A0C12;
        }

        .note {
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          color: rgba(10,12,18,0.6);
          line-height: 1.5;
          margin: 0 0 24px 0;
        }

        .error-message {
          background: rgba(204,0,0,0.05);
          color: #cc0000;
          border: 1px solid rgba(204,0,0,0.1);
          padding: 16px;
          border-radius: 12px;
          font-family: 'Inter', sans-serif;
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
          font-family: 'Inter', sans-serif;
          font-size: 15px;
          font-weight: 600;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.22s;
        }

        .retry-button,
        .optin-button {
          background: #D7E377;
          color: #0A0C12;
          box-shadow: 0 4px 20px rgba(107,122,0,0.25);
        }

        .retry-button:hover,
        .optin-button:hover:not(:disabled) {
          background: #e4ee8c;
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(107,122,0,0.32);
        }

        .optin-button:disabled {
          background: rgba(10,12,18,0.1);
          color: rgba(10,12,18,0.4);
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .skip-button {
          background: rgba(10,12,18,0.04);
          color: rgba(10,12,18,0.65);
          border: 1px solid rgba(10,12,18,0.1);
        }

        .skip-button:hover:not(:disabled) {
          background: rgba(10,12,18,0.08);
          color: #0A0C12;
        }

        .skip-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @media (max-width: 640px) {
          .container {
            padding: 20px;
          }

          .card {
            padding: 32px 24px;
          }

          .title {
            font-size: 24px;
          }

          .button-group {
            flex-direction: column;
          }
        }
      `}</style>
    </>
  );
}
