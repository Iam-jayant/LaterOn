"use client";

import { useState } from "react";
import algosdk from "algosdk";
import { useTransactionSigner } from "@/hooks/useTransactionSigner";
import { SigningModal } from "@/components/signing-modal";
import { getAlgodClient } from "@/lib/transaction-signer";
import { PRIMARY, TEXT, SUCCESS, BACKGROUND } from "@/lib/colors";

interface ConsentModalProps {
  walletAddress: string;
  onConsent: (txnId: string) => Promise<void>;
  onDecline: () => void;
}

export function ConsentModal({
  walletAddress,
  onConsent,
  onDecline,
}: ConsentModalProps) {
  const [isChecked, setIsChecked] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [completedTxId, setCompletedTxId] = useState<string | null>(null);
  const {
    isModalOpen,
    signingStatus,
    txId,
    error,
    signAndSubmitTransactions,
    closeModal,
  } = useTransactionSigner();

  const handleConsent = async () => {
    if (!isChecked) return;

    setIsProcessing(true);
    try {
      // Build consent transaction
      const algodClient = getAlgodClient();
      const params = await algodClient.getTransactionParams().do();

      const timestamp = Math.floor(Date.now() / 1000);
      
      // Simple hash using timestamp and purpose (browser-compatible)
      const purposeString = `credit_scoring_${timestamp}`;
      const purposeHash = Array.from(purposeString)
        .reduce((hash, char) => ((hash << 5) - hash) + char.charCodeAt(0), 0)
        .toString(16)
        .substring(0, 16);

      const note = new TextEncoder().encode(
        `LATERON_CONSENT|credit_scoring|${timestamp}|${purposeHash}`
      );

      // 0 ALGO self-transfer
      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: walletAddress,
        receiver: walletAddress,
        amount: 0,
        note,
        suggestedParams: params,
      });

      // Sign and submit
      const result = await signAndSubmitTransactions(txn);

      // Store the transaction ID to call onConsent after modal closes
      setCompletedTxId(result.txId);
    } catch (err) {
      console.error("Consent transaction failed:", err);
      // Error is already handled by useTransactionSigner
    } finally {
      setIsProcessing(false);
    }
  };

  const handleModalClose = async () => {
    closeModal();
    
    // If transaction was successful, call onConsent callback
    if (completedTxId) {
      await onConsent(completedTxId);
    }
  };

  return (
    <>
      {/* Only show consent modal if not processing transaction */}
      {!isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-title">Data Processing Consent</h2>

            <div className="consent-text">
              <p>
                To provide you with credit scoring services, LaterOn needs to
                analyze your Algorand wallet's on-chain activity. This includes:
              </p>
              <ul>
                <li>Wallet age and transaction history</li>
                <li>Current ALGO balance</li>
                <li>DeFi protocol interactions</li>
                <li>Previous LaterOn payment history</li>
              </ul>
              <p>
                Your consent will be recorded on the Algorand blockchain as an
                immutable record. You can withdraw consent and request data
                deletion at any time from your dashboard.
              </p>
              <p className="compliance-note">
                This consent is required under the Digital Personal Data
                Protection Act 2023 (DPDP Act).
              </p>
            </div>

            <label className="checkbox-container">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => setIsChecked(e.target.checked)}
                disabled={isProcessing}
              />
              <span className="checkbox-label">
                I acknowledge and consent to the processing of my wallet data for
                credit scoring purposes
              </span>
            </label>

            <div className="button-group">
              <button
                onClick={handleConsent}
                disabled={!isChecked || isProcessing}
                className="consent-button"
              >
                {isProcessing ? "Processing..." : "I Consent"}
              </button>
              <button
                onClick={onDecline}
                disabled={isProcessing}
                className="decline-button"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      <SigningModal
        isOpen={isModalOpen}
        status={signingStatus}
        txId={txId}
        error={error}
        onClose={handleModalClose}
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
        }

        .modal-content {
          background: white;
          border-radius: 20px;
          padding: 40px 32px;
          max-width: 600px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        .modal-title {
          font-family: "'Space Grotesk', sans-serif";
          font-size: 28px;
          font-weight: 700;
          margin: 0 0 24px 0;
          color: ${TEXT};
          letter-spacing: -0.6px;
        }

        .consent-text {
          font-family: "'Inter', sans-serif";
          font-size: 15px;
          line-height: 1.6;
          color: ${TEXT}CC;
          margin-bottom: 24px;
        }

        .consent-text p {
          margin: 0 0 16px 0;
        }

        .consent-text ul {
          margin: 16px 0;
          padding-left: 24px;
        }

        .consent-text li {
          margin: 8px 0;
        }

        .compliance-note {
          font-size: 13px;
          color: ${TEXT}99;
          font-style: italic;
          background: ${BACKGROUND};
          padding: 12px 16px;
          border-radius: 10px;
          border: 1px solid ${TEXT}14;
        }

        .checkbox-container {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 24px;
          cursor: pointer;
        }

        .checkbox-container input[type="checkbox"] {
          margin-top: 4px;
          width: 20px;
          height: 20px;
          cursor: pointer;
          accent-color: ${SUCCESS};
        }

        .checkbox-container input[type="checkbox"]:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .checkbox-label {
          font-family: "'Inter', sans-serif";
          font-size: 15px;
          line-height: 1.5;
          color: ${TEXT};
          font-weight: 500;
        }

        .button-group {
          display: flex;
          gap: 12px;
        }

        .consent-button,
        .decline-button {
          flex: 1;
          padding: 14px 24px;
          font-family: "'Inter', sans-serif";
          font-size: 16px;
          font-weight: 600;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .consent-button {
          background: ${PRIMARY};
          color: ${TEXT};
          box-shadow: 0 4px 16px ${SUCCESS}33;
        }

        .consent-button:hover:not(:disabled) {
          background: #e4ee8c;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px ${SUCCESS}47;
        }

        .consent-button:disabled {
          background: ${TEXT}26;
          color: ${TEXT}66;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .decline-button {
          background: ${BACKGROUND};
          color: ${TEXT}99;
          border: 2px solid ${TEXT}1A;
        }

        .decline-button:hover:not(:disabled) {
          background: ${TEXT}0D;
          border-color: ${TEXT}33;
          color: ${TEXT};
        }

        .decline-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </>
  );
}
