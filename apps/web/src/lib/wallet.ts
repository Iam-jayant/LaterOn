import algosdk from "algosdk";

export type WalletType = "lute" | "pera" | "defly";

export class WalletService {
  private luteWallet: any = null;
  private peraWallet: any = null;
  private deflyWallet: any = null;
  private connectedWallet: WalletType | null = null;
  private connectedAddress: string | null = null;

  constructor() {
    // Lazy initialization to avoid SSR issues
  }

  private async ensureWallets() {
    if (typeof window === 'undefined') {
      throw new Error('Wallet operations are only available in the browser');
    }
    
    if (!this.luteWallet) {
      const LuteConnect = (await import('lute-connect')).default;
      this.luteWallet = new LuteConnect("LaterOn");
    }
    if (!this.peraWallet) {
      const { PeraWalletConnect } = await import('@perawallet/connect');
      this.peraWallet = new PeraWalletConnect();
    }
    if (!this.deflyWallet) {
      const { DeflyWalletConnect } = await import('@blockshake/defly-connect');
      this.deflyWallet = new DeflyWalletConnect();
    }
  }

  async connect(walletType: WalletType): Promise<string> {
    await this.ensureWallets();
    let accounts: string[];
    
    switch (walletType) {
      case "lute":
        // Lute requires genesisID for network selection
        accounts = await this.luteWallet.connect("testnet-v1.0");
        break;
      case "pera":
        accounts = await this.peraWallet.connect();
        break;
      case "defly":
        accounts = await this.deflyWallet.connect();
        break;
      default:
        throw new Error(`Unknown wallet type: ${walletType}`);
    }
    
    if (!accounts || accounts.length === 0) {
      throw new Error("No accounts returned from wallet");
    }
    
    this.connectedWallet = walletType;
    this.connectedAddress = accounts[0];
    return this.connectedAddress;
  }

  async disconnect(): Promise<void> {
    if (!this.connectedWallet) return;
    
    await this.ensureWallets();
    
    switch (this.connectedWallet) {
      case "lute":
        // Lute doesn't have a disconnect method
        break;
      case "pera":
        await this.peraWallet.disconnect();
        break;
      case "defly":
        await this.deflyWallet.disconnect();
        break;
    }
    
    this.connectedWallet = null;
    this.connectedAddress = null;
  }

  async signTransaction(txns: algosdk.Transaction[]): Promise<Uint8Array[]> {
    if (!this.connectedWallet) {
      throw new Error("No wallet connected");
    }
    
    await this.ensureWallets();
    
    switch (this.connectedWallet) {
      case "lute": {
        // Lute expects WalletTransaction[] with base64 encoded txns
        const walletTxns = txns.map((txn) => ({
          txn: Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString("base64"),
        }));
        const signedTxns = await this.luteWallet.signTxns(walletTxns);
        // Filter out null values and return Uint8Array[]
        return signedTxns.filter((txn: any): txn is Uint8Array => txn !== null);
      }
      case "pera": {
        // Pera expects SignerTransaction[][] (array of groups)
        const signerTxns = txns.map((txn) => ({ txn }));
        return await this.peraWallet.signTransaction([signerTxns]);
      }
      case "defly": {
        // Defly expects SignerTransaction[][] (array of groups)
        const signerTxns = txns.map((txn) => ({ txn }));
        return await this.deflyWallet.signTransaction([signerTxns]);
      }
      default:
        throw new Error(`Unknown wallet type: ${this.connectedWallet}`);
    }
  }

  getAddress(): string | null {
    return this.connectedAddress;
  }

  getWalletType(): WalletType | null {
    return this.connectedWallet;
  }
}

// Export singleton instance
export const walletService = new WalletService();
