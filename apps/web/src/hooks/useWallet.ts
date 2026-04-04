import { useState, useEffect } from "react";
import { walletService, type WalletType } from "@/lib/wallet";

interface UseWalletReturn {
  address: string | null;
  walletType: WalletType | null;
  isConnecting: boolean;
  error: string | null;
  connect: (type: WalletType) => Promise<void>;
  disconnect: () => Promise<void>;
}

export function useWallet(): UseWalletReturn {
  const [address, setAddress] = useState<string | null>(null);
  const [walletType, setWalletType] = useState<WalletType | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize wallet state from service on mount
  useEffect(() => {
    const currentAddress = walletService.getAddress();
    const currentWalletType = walletService.getWalletType();
    
    if (currentAddress && currentWalletType) {
      setAddress(currentAddress);
      setWalletType(currentWalletType);
    }
  }, []);

  const connect = async (type: WalletType) => {
    setIsConnecting(true);
    setError(null);
    
    try {
      const addr = await walletService.connect(type);
      setAddress(addr);
      setWalletType(type);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to connect wallet";
      setError(errorMessage);
      
      // Clear any partial state
      setAddress(null);
      setWalletType(null);
      
      throw err;
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = async () => {
    try {
      await walletService.disconnect();
      setAddress(null);
      setWalletType(null);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to disconnect wallet";
      setError(errorMessage);
      throw err;
    }
  };

  return {
    address,
    walletType,
    isConnecting,
    error,
    connect,
    disconnect,
  };
}
