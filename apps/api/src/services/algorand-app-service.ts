import algosdk from "algosdk";
import type { ApiConfig } from "../config";
import { AtomicTxBuilder } from "./atomic-tx-builder";

export interface ChainTxResult {
  txId: string;
  confirmedRound: number;
  appId: number;
  method: string;
}

interface SignerContext {
  sender: string;
  privateKey: Uint8Array;
}

export class AlgorandAppService {
  private readonly algod: algosdk.Algodv2;
  private readonly signer?: SignerContext;
  private readonly enabled: boolean;
  private readonly txBuilder: AtomicTxBuilder;

  public constructor(private readonly config: ApiConfig) {
    this.algod = new algosdk.Algodv2(config.algodToken, config.algodAddress, "");
    this.signer = this.resolveSigner();
    this.enabled = Boolean(
      config.chainEnabled &&
        this.signer &&
        config.bnplAppId > 0 &&
        config.poolAppId > 0
    );
    this.txBuilder = new AtomicTxBuilder(config);
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public getStatus(): {
    enabled: boolean;
    ready: boolean;
    sender?: string;
    bnplAppId: number;
    poolAppId: number;
  } {
    return {
      enabled: this.config.chainEnabled,
      ready: this.enabled,
      sender: this.signer?.sender,
      bnplAppId: this.config.bnplAppId,
      poolAppId: this.config.poolAppId
    };
  }

  public async createPlan(financedAmountAlgo: number): Promise<ChainTxResult | undefined> {
    if (!this.enabled) {
      return undefined;
    }
    return this.callNoOp(
      this.config.bnplAppId,
      "create_plan",
      [this.microAlgoArg(financedAmountAlgo)]
    );
  }

  public async repayInstallment(amountAlgo: number): Promise<ChainTxResult | undefined> {
    if (!this.enabled) {
      return undefined;
    }
    return this.callNoOp(
      this.config.bnplAppId,
      "repay_installment",
      [this.microAlgoArg(amountAlgo)]
    );
  }

  public async settleRisk(): Promise<ChainTxResult | undefined> {
    if (!this.enabled) {
      return undefined;
    }
    return this.callNoOp(this.config.bnplAppId, "settle_risk");
  }

  public async poolDeposit(amountAlgo: number): Promise<ChainTxResult | undefined> {
    if (!this.enabled) {
      return undefined;
    }
    return this.callNoOp(
      this.config.poolAppId,
      "deposit",
      [this.microAlgoArg(amountAlgo)]
    );
  }

  public async poolLendOut(amountAlgo: number): Promise<ChainTxResult | undefined> {
    if (!this.enabled) {
      return undefined;
    }
    return this.callNoOp(
      this.config.poolAppId,
      "lend_out",
      [this.microAlgoArg(amountAlgo)]
    );
  }

  public async poolRecordRepayment(
    repaidAlgo: number,
    reserveAlgo: number
  ): Promise<ChainTxResult | undefined> {
    if (!this.enabled) {
      return undefined;
    }
    return this.callNoOp(
      this.config.poolAppId,
      "record_repayment",
      [this.microAlgoArg(repaidAlgo), this.microAlgoArg(reserveAlgo)]
    );
  }

  public async setBnplPaused(paused: boolean): Promise<ChainTxResult | undefined> {
    if (!this.enabled) {
      return undefined;
    }
    return this.callNoOp(this.config.bnplAppId, "set_paused", [algosdk.encodeUint64(paused ? 1 : 0)]);
  }

  public async setPoolPaused(paused: boolean): Promise<ChainTxResult | undefined> {
    if (!this.enabled) {
      return undefined;
    }
    return this.callNoOp(this.config.poolAppId, "set_paused", [algosdk.encodeUint64(paused ? 1 : 0)]);
  }

  /**
   * Build unsigned marketplace transactions for frontend signing.
   * Returns base64-encoded unsigned transactions.
   * 
   * @param borrowerAddress - User's wallet address
   * @param financedAmountAlgo - Total amount to finance in ALGO
   * @returns Array of base64-encoded unsigned transactions
   */
  public async buildMarketplaceTransactions(
    borrowerAddress: string,
    financedAmountAlgo: number
  ): Promise<string[]> {
    // Simple architecture: User pays full amount to pool
    // Backend will handle merchant payment after confirmation
    
    if (!this.config.chainEnabled) {
      throw new Error("Blockchain service not properly configured");
    }

    const totalAmountMicroAlgo = Math.round(financedAmountAlgo * 1_000_000);

    // Generate unique plan ID for tracking
    const planId = Date.now();

    const suggestedParams = await this.algod.getTransactionParams().do();

    // Single payment: User pays full amount to pool
    const paymentTx = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: borrowerAddress,
      receiver: this.config.lendingPoolAddress,
      amount: totalAmountMicroAlgo,
      note: new Uint8Array(Buffer.from(JSON.stringify({
        type: 'MARKETPLACE_BNPL',
        planId: `plan_${planId}`,
        version: '1.0'
      }))),
      suggestedParams,
    });

    // Return single transaction
    return [Buffer.from(algosdk.encodeUnsignedTransaction(paymentTx)).toString('base64')];
  }

  /**
   * Submit signed transactions to the blockchain.
   * 
   * @param signedTransactions - Array of base64-encoded signed transactions
   * @returns Transaction ID of the first transaction in the group
   */
  public async submitSignedTransactions(signedTransactions: string[]): Promise<string> {
    // Submitting signed transactions doesn't need relayer - user already signed them
    // Only check if chain is enabled
    if (!this.config.chainEnabled) {
      throw new Error("Blockchain service not enabled");
    }

    // Decode base64 signed transactions
    const signedTxnBlobs = signedTransactions.map(txn => 
      new Uint8Array(Buffer.from(txn, 'base64'))
    );

    // Submit transaction group
    const sendResult = await this.algod.sendRawTransaction(signedTxnBlobs).do();
    const txId = sendResult.txid;

    // Wait for confirmation
    await algosdk.waitForConfirmation(
      this.algod,
      txId,
      this.config.chainWaitRounds
    );

    return txId;
  }

  /**
   * Send payment from pool to merchant using relayer account.
   * This is called after user payment is confirmed.
   * 
   * @param merchantAddress - Merchant's Algorand address
   * @param amountAlgo - Amount to send in ALGO
   * @param note - Optional transaction note
   * @returns Transaction ID
   */
  public async sendPoolPaymentToMerchant(
    merchantAddress: string,
    amountAlgo: number,
    note?: string
  ): Promise<string> {
    if (!this.config.chainEnabled) {
      throw new Error("Blockchain service not enabled");
    }

    if (!this.signer) {
      throw new Error("Relayer account not configured. Set RELAYER_PRIVATE_KEY or RELAYER_MNEMONIC in .env");
    }

    const amountMicroAlgo = Math.round(amountAlgo * 1_000_000);
    const suggestedParams = await this.algod.getTransactionParams().do();

    // Create payment transaction from pool to merchant
    const paymentTx = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: this.signer.sender,
      receiver: merchantAddress,
      amount: amountMicroAlgo,
      note: note ? new Uint8Array(Buffer.from(note)) : undefined,
      suggestedParams,
    });

    // Sign with relayer (pool) private key
    const signedTx = paymentTx.signTxn(this.signer.privateKey);

    // Submit transaction
    const sendResult = await this.algod.sendRawTransaction(signedTx).do();
    const txId = sendResult.txid;

    // Wait for confirmation
    await algosdk.waitForConfirmation(
      this.algod,
      txId,
      this.config.chainWaitRounds
    );

    return txId;
  }

  private async callNoOp(
    appId: number,
    method: string,
    extraArgs: Uint8Array[] = []
  ): Promise<ChainTxResult> {
    if (!this.signer) {
      throw new Error("Signer not configured");
    }

    const params = await this.algod.getTransactionParams().do();
    const appArgs: Uint8Array[] = [new TextEncoder().encode(method), ...extraArgs];
    const tx = algosdk.makeApplicationNoOpTxnFromObject({
      appIndex: appId,
      sender: this.signer.sender,
      suggestedParams: params,
      appArgs
    });

    const signed = tx.signTxn(this.signer.privateKey);
    const sendResult = await this.algod.sendRawTransaction(signed).do();
    const txId = sendResult.txid;
    const confirmation = await algosdk.waitForConfirmation(
      this.algod,
      txId,
      this.config.chainWaitRounds
    );
    const confirmedRound = Number(confirmation.confirmedRound ?? 0);

    return {
      txId,
      confirmedRound,
      appId,
      method
    };
  }

  private resolveSigner(): SignerContext | undefined {
    const privateKeyRaw = this.config.relayerPrivateKey?.trim();
    if (privateKeyRaw) {
      const privateKey = new Uint8Array(Buffer.from(privateKeyRaw, "base64"));
      const sender = algosdk.encodeAddress(privateKey.slice(32));
      return { sender, privateKey };
    }

    const mnemonicRaw = this.config.relayerMnemonic?.trim();
    if (mnemonicRaw) {
      const privateKey = algosdk.mnemonicToSecretKey(mnemonicRaw);
      return {
        sender: privateKey.addr.toString(),
        privateKey: privateKey.sk
      };
    }

    return undefined;
  }

  private microAlgoArg(amountAlgo: number): Uint8Array {
    const microAlgo = Math.round(Math.max(0, amountAlgo) * 1_000_000);
    return algosdk.encodeUint64(microAlgo);
  }
}
