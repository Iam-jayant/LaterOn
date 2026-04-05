"use client";

import { useTransactionSigner } from "@/hooks/useTransactionSigner";
import { SigningModal } from "./signing-modal";
import { useWallet } from "@/hooks/useWallet";
import { decodeUnsignedTransactions } from "@/lib/transaction-signer";

/**
 * Example component demonstrating transaction signing flow
 * This shows how to integrate the signing modal with API calls
 */
export function TransactionExample() {
  const { address } = useWallet();
  const {
    isModalOpen,
    signingStatus,
    txId,
    error,
    signAndSubmitTransactions,
    closeModal,
  } = useTransactionSigner();

  const handleExampleTransaction = async () => {
    if (!address) {
      alert("Please connect your wallet first");
      return;
    }

    try {
      // Example: Call API to get unsigned transactions
      // const response = await fetch("/api/checkout/commit", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ quoteId: "example-quote-id" }),
      // });
      // const { unsignedTxns } = await response.json();
      
      // Decode base64 transactions from API
      // const transactions = decodeUnsignedTransactions(unsignedTxns);
      
      // Sign and submit
      // const result = await signAndSubmitTransactions(transactions);
      
      // After success, call confirm endpoint
      // await fetch("/api/checkout/confirm", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ planId: "...", txId: result.txId }),
      // });

      console.log("Transaction flow completed");
    } catch (err) {
      console.error("Transaction failed:", err);
    }
  };

  return (
    <div>
      <button
        onClick={handleExampleTransaction}
        disabled={!address}
        style={{
          padding: "12px 24px",
          fontSize: "16px",
          backgroundColor: address ? "#0066cc" : "#ccc",
          color: "white",
          border: "none",
          borderRadius: "8px",
          cursor: address ? "pointer" : "not-allowed",
        }}
      >
        {address ? "Test Transaction" : "Connect Wallet First"}
      </button>

      <SigningModal
        isOpen={isModalOpen}
        status={signingStatus}
        txId={txId}
        error={error}
        onClose={closeModal}
      />
    </div>
  );
}
