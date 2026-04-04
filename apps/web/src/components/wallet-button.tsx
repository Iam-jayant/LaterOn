"use client";

import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { WalletModal } from "@/components/wallet-modal";

export function WalletButton() {
  const { address, walletType, disconnect } = useWallet();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleDisconnect = async () => {
    try {
      await disconnect();
    } catch (err) {
      console.error("Failed to disconnect:", err);
    }
  };

  if (address) {
    return (
      <div className="flex items-center gap-3">
        <div className="text-sm">
          <div className="text-gray-600">
            {walletType === "lute" && "Lute Wallet"}
            {walletType === "pera" && "Pera Wallet"}
            {walletType === "defly" && "Defly Wallet"}
          </div>
          <div className="font-mono text-gray-900">
            {address.slice(0, 6)}...{address.slice(-4)}
          </div>
        </div>
        <button
          onClick={handleDisconnect}
          className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
      >
        Connect Wallet
      </button>
      <WalletModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
