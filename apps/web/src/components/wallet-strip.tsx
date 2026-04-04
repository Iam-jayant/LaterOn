"use client";

import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { WalletModal } from "./wallet-modal";

export const WalletStrip = () => {
  const { address, walletType, disconnect } = useWallet();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const getWalletDisplayName = (type: string) => {
    switch (type) {
      case "lute":
        return "Lute";
      case "pera":
        return "Pera";
      case "defly":
        return "Defly";
      default:
        return type;
    }
  };

  return (
    <>
      <div className="card">
        <div className="eyebrow">Wallet</div>
        <h3 style={{ marginTop: 10 }}>ALGO Checkout Wallet</h3>
        <p style={{ marginTop: 6 }}>
          Connect your wallet to authorize checkout and repayments. Supports Lute, Pera, and Defly.
        </p>
        
        {address ? (
          <div style={{ marginTop: 14 }}>
            <p style={{ marginBottom: 10 }}>
              <strong>Connected:</strong> {formatAddress(address)}
              {walletType && (
                <span style={{ marginLeft: 8 }}>
                  ({getWalletDisplayName(walletType)})
                </span>
              )}
            </p>
            <button 
              type="button" 
              className="secondary" 
              onClick={() => void disconnect()}
            >
              Disconnect Wallet
            </button>
          </div>
        ) : (
          <div style={{ marginTop: 14 }}>
            <button 
              type="button" 
              onClick={() => setIsModalOpen(true)}
            >
              Connect Wallet
            </button>
            <p style={{ marginTop: 10, color: "#666" }}>
              Status: Not connected
            </p>
          </div>
        )}
      </div>

      <WalletModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </>
  );
};
