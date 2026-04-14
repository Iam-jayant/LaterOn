import algosdk from "algosdk";

export type WalletType = "lute" | "pera" | "defly";

export class WalletService {
  private luteWallet: any = null;
  private peraWallet: any = null;
  private deflyWallet: any = null;
  private connectedWallet: WalletType | null = null;
  private connectedAddress: string | null = null;
  private readonly STORAGE_KEY = 'lateron_wallet_connection';

  constructor() {
    // Lazy initialization to avoid SSR issues
    if (typeof window !== 'undefined') {
      this.restoreConnection();
    }
  }

  private restoreConnection(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const { walletType, address } = JSON.parse(stored);
        this.connectedWallet = walletType;
        this.connectedAddress = address;
      }
    } catch (err) {
      console.error('Failed to restore wallet connection:', err);
    }
  }

  private saveConnection(): void {
    if (typeof window === 'undefined') return;
    
    if (this.connectedWallet && this.connectedAddress) {
      localStorage.setItem(
        this.STORAGE_KEY,
        JSON.stringify({
          walletType: this.connectedWallet,
          address: this.connectedAddress,
        })
      );
    }
  }

  private clearConnection(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.STORAGE_KEY);
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
    this.saveConnection();
    return this.connectedAddress;
  }

  async reconnect(): Promise<string | null> {
    if (!this.connectedWallet) return null;
    
    try {
      await this.ensureWallets();
      let accounts: string[] = [];
      
      switch (this.connectedWallet) {
        case "lute":
          // Lute doesn't have auto-reconnect, keep stored address
          if (this.connectedAddress) {
            return this.connectedAddress;
          }
          break;
        case "pera":
          accounts = await this.peraWallet.reconnectSession();
          break;
        case "defly":
          accounts = await this.deflyWallet.reconnectSession();
          break;
      }
      
      if (accounts && accounts.length > 0) {
        this.connectedAddress = accounts[0];
        this.saveConnection();
        return this.connectedAddress;
      }
      
      // If reconnection failed, clear stored connection
      if (!this.connectedAddress) {
        this.clearConnection();
        this.connectedWallet = null;
      }
      
      return this.connectedAddress;
    } catch (err) {
      console.error('Failed to reconnect wallet:', err);
      this.clearConnection();
      this.connectedWallet = null;
      this.connectedAddress = null;
      return null;
    }
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
    this.clearConnection();
  }

  async signTransaction(txns: algosdk.Transaction[]): Promise<Uint8Array[]> {
    if (!this.connectedWallet) {
      throw new Error("No wallet connected");
    }
    
    if (!this.connectedAddress) {
      throw new Error("No wallet address available");
    }
    
    await this.ensureWallets();
    
    const userAddress = this.connectedAddress;
    
    // Helper function to safely get sender address from transaction
    const getTxnSender = (txn: algosdk.Transaction): string => {
      try {
        // Try multiple ways to get the sender address
        const txnObj = txn as any;
        
        // Method 1: Check 'from' property (common in algosdk)
        if (txnObj.from) {
          return typeof txnObj.from === 'string' ? txnObj.from : txnObj.from.toString();
        }
        
        // Method 2: Check 'sender' property
        if (txnObj.sender) {
          // If sender is an Address object with publicKey
          if (txnObj.sender.publicKey) {
            return algosdk.encodeAddress(txnObj.sender.publicKey);
          }
          // If sender is already a string
          if (typeof txnObj.sender === 'string') {
            return txnObj.sender;
          }
        }
        
        // Method 3: Try to get it from the encoded transaction
        const encoded = algosdk.encodeUnsignedTransaction(txn);
        const decoded = algosdk.decodeUnsignedTransaction(encoded);
        if ((decoded as any).from) {
          return (decoded as any).from.toString();
        }
        
        console.error("Could not extract sender from transaction:", txnObj);
        return "";
      } catch (error) {
        console.error("Error extracting sender from transaction:", error);
        return "";
      }
    };
    
    switch (this.connectedWallet) {
      case "lute": {
        const walletTxns = txns.map((txn) => {
          const txnSender = getTxnSender(txn);
          const shouldSign = txnSender === userAddress;
          
          return {
            txn: Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString("base64"),
            signers: shouldSign ? undefined : [],
          };
        });
        
        const signedTxns = await this.luteWallet.signTxns(walletTxns);
        return signedTxns.map((signedTxn: Uint8Array | null, index: number) => {
          return signedTxn || algosdk.encodeUnsignedTransaction(txns[index]);
        });
      }
      
      case "pera": {
        const signerTxns = txns.map((txn) => {
          const txnSender = getTxnSender(txn);
          const shouldSign = txnSender === userAddress;
          return shouldSign ? { txn } : { txn, signers: [] };
        });
        
        const signedTxns = await this.peraWallet.signTransaction([signerTxns]);
        
        let signedIndex = 0;
        return txns.map((txn) => {
          const txnSender = getTxnSender(txn);
          const shouldSign = txnSender === userAddress;
          
          if (shouldSign) {
            return signedTxns[signedIndex++];
          }
          return algosdk.encodeUnsignedTransaction(txn);
        });
      }
      
      case "defly": {
        const signerTxns = txns.map((txn) => {
          const txnSender = getTxnSender(txn);
          const shouldSign = txnSender === userAddress;
          return shouldSign ? { txn } : { txn, signers: [] };
        });
        
        const signedTxns = await this.deflyWallet.signTransaction([signerTxns]);
        
        let signedIndex = 0;
        return txns.map((txn) => {
          const txnSender = getTxnSender(txn);
          const shouldSign = txnSender === userAddress;
          
          if (shouldSign) {
            return signedTxns[signedIndex++];
          }
          return algosdk.encodeUnsignedTransaction(txn);
        });
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
