import { useState, useCallback } from "react";
import algosdk from "algosdk";
import { signAndSubmit, type SignAndSubmitResult } from "@/lib/transaction-signer";
import type { SigningStatus } from "@/components/signing-modal";

interface UseTransactionSignerReturn {
  isModalOpen: boolean;
  signingStatus: SigningStatus;
  txId: string | undefined;
  error: string | undefined;
  signAndSubmitTransactions: (
    transactions: algosdk.Transaction | algosdk.Transaction[]
  ) => Promise<SignAndSubmitResult>;
  closeModal: () => void;
  resetState: () => void;
}

/**
 * React hook for managing transaction signing flow with modal UI
 * Handles all states: signing, submitting, confirming, success, error
 */
export function useTransactionSigner(): UseTransactionSignerReturn {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [signingStatus, setSigningStatus] = useState<SigningStatus>("signing");
  const [txId, setTxId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const signAndSubmitTransactions = useCallback(
    async (
      transactions: algosdk.Transaction | algosdk.Transaction[]
    ): Promise<SignAndSubmitResult> => {
      // Reset state and open modal
      setIsModalOpen(true);
      setSigningStatus("signing");
      setTxId(undefined);
      setError(undefined);

      try {
        const result = await signAndSubmit(transactions, {
          onSigning: () => setSigningStatus("signing"),
          onSubmitting: () => setSigningStatus("submitting"),
          onConfirming: () => setSigningStatus("confirming"),
        });

        // Success
        setSigningStatus("success");
        setTxId(result.txId);
        return result;
      } catch (err) {
        // Error
        const errorMessage =
          err instanceof Error ? err.message : "Transaction failed";
        setSigningStatus("error");
        setError(errorMessage);
        throw err;
      }
    },
    []
  );

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const resetState = useCallback(() => {
    setIsModalOpen(false);
    setSigningStatus("signing");
    setTxId(undefined);
    setError(undefined);
  }, []);

  return {
    isModalOpen,
    signingStatus,
    txId,
    error,
    signAndSubmitTransactions,
    closeModal,
    resetState,
  };
}
