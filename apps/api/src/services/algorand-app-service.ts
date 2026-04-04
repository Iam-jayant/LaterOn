import algosdk from "algosdk";
import type { ApiConfig } from "../config";

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

  public constructor(private readonly config: ApiConfig) {
    this.algod = new algosdk.Algodv2(config.algodToken, config.algodAddress, "");
    this.signer = this.resolveSigner();
    this.enabled = Boolean(
      config.chainEnabled &&
        this.signer &&
        config.bnplAppId > 0 &&
        config.poolAppId > 0
    );
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
