import algosdk from "algosdk";
import type { PostgresRepository } from "../db/postgres-repository.js";

export interface ScoreASAMetadata {
  standard: "arc69";
  properties: {
    score: number;
    tier: string;
    updated_at: number;
  };
}

/**
 * ScoreASAService manages Score ASAs (Algorand Standard Assets) that represent
 * user credit scores on-chain.
 * 
 * Features:
 * - Create Score ASAs with ARC-69 metadata
 * - Update metadata when scores change
 * - Transfer ASAs to users after opt-in
 * - Clawback ASAs on default or ban
 * - Check user balance for 0.1 ALGO minimum requirement
 */
export class ScoreASAService {
  constructor(
    private readonly algodClient: algosdk.Algodv2,
    private readonly protocolAccount: algosdk.Account,
    private readonly repository: PostgresRepository
  ) {}

  /**
   * Create a Score ASA for a user.
   * ASA parameters:
   * - Name: "LTRSCR"
   * - Unit: "LaterOn Score"
   * - Total: 1 (non-fungible)
   * - Decimals: 0
   * - Manager/Reserve/Freeze/Clawback: Protocol address
   * 
   * @param params - User wallet address, score, and tier
   * @returns ASA ID of the created asset
   */
  async createScoreASA(params: {
    walletAddress: string;
    score: number;
    tier: string;
  }): Promise<number> {
    const suggestedParams = await this.algodClient.getTransactionParams().do();

    // Build ARC-69 metadata
    const metadata: ScoreASAMetadata = {
      standard: "arc69",
      properties: {
        score: params.score,
        tier: params.tier,
        updated_at: Math.floor(Date.now() / 1000),
      },
    };

    // Create ASA transaction
    const txn = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
      sender: this.protocolAccount.addr,
      total: 1,
      decimals: 0,
      defaultFrozen: false,
      manager: this.protocolAccount.addr,
      reserve: this.protocolAccount.addr,
      freeze: this.protocolAccount.addr,
      clawback: this.protocolAccount.addr,
      unitName: "LTRSCR",
      assetName: "LaterOn Score",
      assetURL: "https://lateron.in/score-metadata",
      note: new Uint8Array(Buffer.from(JSON.stringify(metadata), "utf-8")),
      suggestedParams,
    });

    // Sign and send transaction
    const signedTxn = txn.signTxn(this.protocolAccount.sk);
    const response = await this.algodClient.sendRawTransaction(signedTxn).do();
    const txId = response.txid;

    // Wait for confirmation
    const confirmedTxn = await algosdk.waitForConfirmation(this.algodClient, txId, 4);
    const asaId = Number(confirmedTxn.assetIndex);

    if (!asaId) {
      throw new Error("Failed to create Score ASA: no asset ID returned");
    }

    // Store ASA ID in database
    await this.repository.updateUserScoreASAId(params.walletAddress, asaId);

    return asaId;
  }

  /**
   * Update ARC-69 metadata for a Score ASA.
   * Uses asset configuration transaction to update the note field.
   * 
   * @param params - ASA ID, new score, and tier
   * @returns Transaction ID of the update
   */
  async updateASAMetadata(params: {
    asaId: number;
    score: number;
    tier: string;
  }): Promise<string> {
    const suggestedParams = await this.algodClient.getTransactionParams().do();

    // Build updated ARC-69 metadata
    const metadata: ScoreASAMetadata = {
      standard: "arc69",
      properties: {
        score: params.score,
        tier: params.tier,
        updated_at: Math.floor(Date.now() / 1000),
      },
    };

    // Create asset config transaction
    const txn = algosdk.makeAssetConfigTxnWithSuggestedParamsFromObject({
      sender: this.protocolAccount.addr,
      assetIndex: params.asaId,
      manager: this.protocolAccount.addr,
      reserve: this.protocolAccount.addr,
      freeze: this.protocolAccount.addr,
      clawback: this.protocolAccount.addr,
      note: new Uint8Array(Buffer.from(JSON.stringify(metadata), "utf-8")),
      suggestedParams,
      strictEmptyAddressChecking: false,
    });

    // Sign and send transaction
    const signedTxn = txn.signTxn(this.protocolAccount.sk);
    const response = await this.algodClient.sendRawTransaction(signedTxn).do();
    const txId = response.txid;

    // Wait for confirmation
    await algosdk.waitForConfirmation(this.algodClient, txId, 4);

    return txId;
  }

  /**
   * Transfer Score ASA to user after opt-in.
   * Sends the ASA from protocol address to user address.
   * 
   * @param params - ASA ID and recipient address
   * @returns Transaction ID of the transfer
   */
  async transferASAToUser(params: {
    asaId: number;
    recipientAddress: string;
  }): Promise<string> {
    const suggestedParams = await this.algodClient.getTransactionParams().do();

    // Create asset transfer transaction
    const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: this.protocolAccount.addr,
      receiver: params.recipientAddress,
      assetIndex: params.asaId,
      amount: 1,
      suggestedParams,
    });

    // Sign and send transaction
    const signedTxn = txn.signTxn(this.protocolAccount.sk);
    const response = await this.algodClient.sendRawTransaction(signedTxn).do();
    const txId = response.txid;

    // Wait for confirmation
    await algosdk.waitForConfirmation(this.algodClient, txId, 4);

    return txId;
  }

  /**
   * Clawback Score ASA from user.
   * Retrieves the ASA from user's wallet back to protocol address.
   * Used on default or ban.
   * 
   * @param params - ASA ID and user address to clawback from
   * @returns Transaction ID of the clawback
   */
  async clawbackASA(params: {
    asaId: number;
    fromAddress: string;
  }): Promise<string> {
    try {
      const suggestedParams = await this.algodClient.getTransactionParams().do();

      // Create clawback transaction (asset transfer with clawback)
      const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: this.protocolAccount.addr,
        receiver: this.protocolAccount.addr,
        assetIndex: params.asaId,
        amount: 1,
        closeRemainderTo: undefined,
        revocationTarget: params.fromAddress,
        suggestedParams,
      } as any); // Type assertion needed for revocationTarget in algosdk v3

      // Sign and send transaction
      const signedTxn = txn.signTxn(this.protocolAccount.sk);
      const response = await this.algodClient.sendRawTransaction(signedTxn).do();
      const txId = response.txid;

      // Wait for confirmation
      await algosdk.waitForConfirmation(this.algodClient, txId, 4);

      // Update database to set score_asa_id to NULL
      await this.repository.updateUserScoreASAId(params.fromAddress, null);

      return txId;
    } catch (error) {
      console.error("Clawback failed:", error);
      // Log error but don't throw - graceful degradation
      // Update database anyway to mark ASA as clawed back
      await this.repository.updateUserScoreASAId(params.fromAddress, null);
      throw error;
    }
  }

  /**
   * Check user's ALGO balance.
   * Verifies if user has at least 0.1 ALGO for ASA holding.
   * 
   * @param walletAddress - Algorand wallet address
   * @returns Current balance in ALGO
   */
  async checkUserBalance(walletAddress: string): Promise<number> {
    try {
      const accountInfo = await this.algodClient.accountInformation(walletAddress).do();
      const microAlgos = accountInfo.amount ?? BigInt(0);
      return Number(microAlgos) / 1_000_000;
    } catch (error) {
      console.error("Error checking user balance:", error);
      return 0;
    }
  }
}
