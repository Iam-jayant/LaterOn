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
   * Returns atomic group of 3 transactions:
   * - Txn 0: User → Pool (1st EMI)
   * - Txn 1: Pool → Merchant (full amount, will be signed by relayer)
   * - Txn 2: BNPL contract call (create_plan)
   * 
   * @param borrowerAddress - User's wallet address
   * @param totalAmountAlgo - Total order amount in ALGO
   * @param merchantAddress - Merchant's Algorand address
   * @param tierAtApproval - User's tier (0=NEW, 1=EMERGING, 2=TRUSTED)
   * @returns Array of base64-encoded unsigned transactions (user only signs Txn 0)
   */
  public async buildMarketplaceTransactions(
    borrowerAddress: string,
    totalAmountAlgo: number,
    merchantAddress: string,
    tierAtApproval: number = 0
  ): Promise<string[]> {
    if (!this.config.chainEnabled) {
      throw new Error("Blockchain service not properly configured");
    }

    if (!this.signer) {
      throw new Error("Relayer account not configured");
    }

    // Calculate amounts
    const totalMicroAlgo = Math.round(totalAmountAlgo * 1_000_000);
    const firstEmiMicroAlgo = Math.round((totalAmountAlgo / 3) * 1_000_000);
    
    // Calculate next due date (30 days from now)
    const nextDueUnix = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);

    const suggestedParams = await this.algod.getTransactionParams().do();

    // Transaction 0: User pays 1st EMI to pool
    const userPaymentTx = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: borrowerAddress,
      receiver: this.config.lendingPoolAddress,
      amount: firstEmiMicroAlgo,
      note: new Uint8Array(Buffer.from(JSON.stringify({
        type: 'MARKETPLACE_BNPL_EMI1',
        totalAmount: totalAmountAlgo,
        version: '2.0'
      }))),
      suggestedParams,
    });

    // Transaction 1: Pool pays full amount to merchant (signed by relayer)
    const poolPaymentTx = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: this.signer.sender,
      receiver: merchantAddress,
      amount: totalMicroAlgo,
      note: new Uint8Array(Buffer.from(JSON.stringify({
        type: 'MARKETPLACE_BNPL_FULL',
        totalAmount: totalAmountAlgo,
        version: '2.0'
      }))),
      suggestedParams,
    });

    // Transaction 2: BNPL contract call (create_plan)
    const appArgs = [
      new TextEncoder().encode("create_plan"),
      algosdk.decodeAddress(borrowerAddress).publicKey,
      algosdk.encodeUint64(totalMicroAlgo),
      algosdk.encodeUint64(firstEmiMicroAlgo),
      algosdk.decodeAddress(this.config.lendingPoolAddress).publicKey,
      algosdk.decodeAddress(merchantAddress).publicKey,
      algosdk.encodeUint64(nextDueUnix),
      new Uint8Array([tierAtApproval])
    ];

    const appCallTx = algosdk.makeApplicationNoOpTxnFromObject({
      appIndex: this.config.bnplAppId,
      sender: this.signer.sender,
      suggestedParams,
      appArgs
    });

    // Group transactions
    const txGroup = [userPaymentTx, poolPaymentTx, appCallTx];
    algosdk.assignGroupID(txGroup);

    // Sign transactions 1 and 2 with relayer (backend)
    const signedPoolPayment = poolPaymentTx.signTxn(this.signer.privateKey);
    const signedAppCall = appCallTx.signTxn(this.signer.privateKey);

    // Return: Txn 0 unsigned (for user), Txn 1 & 2 signed (by relayer)
    return [
      Buffer.from(algosdk.encodeUnsignedTransaction(userPaymentTx)).toString('base64'),
      Buffer.from(signedPoolPayment).toString('base64'),
      Buffer.from(signedAppCall).toString('base64')
    ];
  }

  /**
   * Submit signed transactions to the blockchain.
   * Handles atomic transaction groups.
   * 
   * @param signedTransactions - Array of base64-encoded signed transactions
   * @returns Transaction ID of the first transaction in the group
   */
  public async submitSignedTransactions(signedTransactions: string[]): Promise<string> {
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
