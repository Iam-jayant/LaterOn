"use client";

import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import type { WalletType } from "@/lib/wallet";

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WalletModal({ isOpen, onClose }: WalletModalProps) {
  const { connect, isConnecting, error } = useWallet();
  const [localError, setLocalError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConnect = async (walletType: WalletType) => {
    setLocalError(null);
    
    try {
      await connect(walletType);
      onClose();
    } catch (err) {
      // Error is already set in the hook, but we can display it locally too
      const errorMessage = err instanceof Error ? err.message : "Failed to connect wallet";
      setLocalError(errorMessage);
    }
  };

  const walletOptions = [
    {
      type: "lute" as WalletType,
      name: "Lute Wallet",
      description: "Recommended for development",
      recommended: true,
    },
    {
      type: "pera" as WalletType,
      name: "Pera Wallet",
      description: "Popular Algorand wallet",
      recommended: false,
    },
    {
      type: "defly" as WalletType,
      name: "Defly Wallet",
      description: "Feature-rich Algorand wallet",
      recommended: false,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-semibold text-gray-900">Connect Wallet</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isConnecting}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-3">
          {walletOptions.map((wallet) => (
            <button
              key={wallet.type}
              onClick={() => handleConnect(wallet.type)}
              disabled={isConnecting}
              className={`
                w-full p-4 rounded-lg border-2 text-left transition-all
                ${
                  wallet.recommended
                    ? "border-blue-500 bg-blue-50 hover:bg-blue-100"
                    : "border-gray-200 bg-white hover:bg-gray-50"
                }
                ${isConnecting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">
                      {wallet.name}
                    </span>
                    {wallet.recommended && (
                      <span className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-full">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {wallet.description}
                  </p>
                </div>
                <svg
                  className="w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </button>
          ))}
        </div>

        {/* Error Display */}
        {(error || localError) && (
          <div className="px-6 pb-4">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">
                {localError || error}
              </p>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isConnecting && (
          <div className="px-6 pb-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800 flex items-center gap-2">
                <svg
                  className="animate-spin h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Connecting to wallet...
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 rounded-b-lg border-t">
          <p className="text-xs text-gray-600">
            By connecting your wallet, you agree to the LaterOn Terms of Service
            and acknowledge that you have read and understand the protocol risks.
          </p>
        </div>
      </div>
    </div>
  );
}
