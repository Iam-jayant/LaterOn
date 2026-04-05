import algosdk from "algosdk";
import { walletService } from "./wallet";

// Algorand TestNet configuration
const ALGOD_SERVER = "https://testnet-api.algonode.cloud";
const ALGOD_PORT = 443;
const ALGOD_TOKEN = "";

// Initialize Algod client for TestNet
const algodClient = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT);

export interface SignAndSubmitResult {
  txId: string;
  confirmedRound: number;
}

export interface SignAndSubmitOptions {
  onSigning?: () => void;
  onSubmitting?: () => void;
  onConfirming?: () => void;
}

/**
 * Signs and submits a single transaction or transaction group to Algorand TestNet
 * @param transactions - Single transaction or array of transactions to sign and submit
 * @param options - Optional callbacks for UI state updates
 * @returns Transaction ID and confirmed round number
 * @throws Error if wallet not connected, signing fails, or transaction fails
 */
export async function signAndSubmit(
  transactions: algosdk.Transaction | algosdk.Transaction[],
  options?: SignAndSubmitOptions
): Promise<SignAndSubmitResult> {
  // Ensure wallet is connected
  const walletAddress = walletService.getAddress();
  if (!walletAddress) {
    throw new Error("No wallet connected. Please connect your wallet first.");
  }

  // Normalize to array
  const txns = Array.isArray(transactions) ? transactions : [transactions];

  if (txns.length === 0) {
    throw new Error("No transactions provided");
  }

  try {
    // Step 1: Sign transactions
    options?.onSigning?.();
    const signedTxns = await walletService.signTransaction(txns);

    if (!signedTxns || signedTxns.length === 0) {
      throw new Error("No signed transactions returned from wallet");
    }

    // Step 2: Submit to network
    options?.onSubmitting?.();
    const response = await algodClient.sendRawTransaction(signedTxns).do();
    const txId = response.txid;

    // Step 3: Wait for confirmation (4 rounds timeout)
    options?.onConfirming?.();
    const confirmedTxn = await waitForConfirmation(txId, 4);

    return {
      txId,
      confirmedRound: confirmedTxn.confirmedRound || 0,
    };
  } catch (error) {
    // Enhance error messages for common cases
    if (error instanceof Error) {
      if (error.message.includes("rejected")) {
        throw new Error("Transaction signing was rejected by wallet");
      }
      if (error.message.includes("overspend")) {
        throw new Error("Insufficient balance to complete transaction");
      }
      if (error.message.includes("logic eval error")) {
        throw new Error("Transaction rejected by smart contract");
      }
    }
    throw error;
  }
}

/**
 * Waits for a transaction to be confirmed on-chain
 * @param txId - Transaction ID to wait for
 * @param timeout - Number of rounds to wait before timing out
 * @returns Confirmed transaction information
 * @throws Error if transaction not confirmed within timeout
 */
export async function waitForConfirmation(
  txId: string,
  timeout: number
): Promise<Record<string, any>> {
  if (timeout < 0) {
    throw new Error("Timeout must be non-negative");
  }

  const status = await algodClient.status().do();
  let lastRound = Number(status.lastRound);
  const targetRound = lastRound + timeout;

  while (lastRound < targetRound) {
    const pendingInfo = await algodClient
      .pendingTransactionInformation(txId)
      .do();

    if (pendingInfo.confirmedRound && pendingInfo.confirmedRound > 0) {
      return pendingInfo;
    }

    if (pendingInfo.poolError && pendingInfo.poolError.length > 0) {
      throw new Error(`Transaction rejected: ${pendingInfo.poolError}`);
    }

    lastRound++;
    await algodClient.statusAfterBlock(lastRound).do();
  }

  throw new Error(
    `Transaction not confirmed after ${timeout} rounds. Transaction ID: ${txId}`
  );
}

/**
 * Decodes base64-encoded unsigned transactions from API
 * @param base64Txns - Array of base64-encoded transaction strings
 * @returns Array of decoded Transaction objects
 */
export function decodeUnsignedTransactions(
  base64Txns: string[]
): algosdk.Transaction[] {
  return base64Txns.map((base64Txn) => {
    const txnBytes = Buffer.from(base64Txn, "base64");
    return algosdk.decodeUnsignedTransaction(txnBytes);
  });
}

/**
 * Gets the Algod client instance for direct usage
 * @returns Configured Algod client for TestNet
 */
export function getAlgodClient(): algosdk.Algodv2 {
  return algodClient;
}
