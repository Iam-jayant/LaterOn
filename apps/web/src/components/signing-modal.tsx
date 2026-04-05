"use client";

import { useEffect, useState } from "react";

export type SigningStatus = "signing" | "submitting" | "confirming" | "success" | "error";

interface SigningModalProps {
  isOpen: boolean;
  status: SigningStatus;
  txId?: string;
  error?: string;
  onClose?: () => void;
}

export function SigningModal({
  isOpen,
  status,
  txId,
  error,
  onClose,
}: SigningModalProps) {
  const [dots, setDots] = useState("");

  // Animated dots for loading states
  useEffect(() => {
    if (status === "signing" || status === "submitting" || status === "confirming") {
      const interval = setInterval(() => {
        setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
      }, 500);
      return () => clearInterval(interval);
    }
  }, [status]);

  if (!isOpen) return null;

  const getStatusContent = () => {
    switch (status) {
      case "signing":
        return {
          title: "Waiting for wallet signature",
          message: "Please approve the transaction in your wallet",
          icon: "🔐",
          showSpinner: true,
        };
      case "submitting":
        return {
          title: "Submitting transaction",
          message: "Sending transaction to Algorand TestNet",
          icon: "📤",
          showSpinner: true,
        };
      case "confirming":
        return {
          title: "Confirming transaction",
          message: "Waiting for blockchain confirmation",
          icon: "⏳",
          showSpinner: true,
        };
      case "success":
        return {
          title: "Transaction confirmed!",
          message: txId
            ? `Transaction ID: ${txId.substring(0, 8)}...${txId.substring(txId.length - 8)}`
            : "Your transaction was successful",
          icon: "✅",
          showSpinner: false,
        };
      case "error":
        return {
          title: "Transaction failed",
          message: error || "An error occurred while processing your transaction",
          icon: "❌",
          showSpinner: false,
        };
    }
  };

  const content = getStatusContent();
  const canClose = status === "success" || status === "error";

  return (
    <div className="modal-overlay" onClick={canClose ? onClose : undefined}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon">{content.icon}</div>
        
        <h2 className="modal-title">
          {content.title}
          {content.showSpinner && <span className="dots">{dots}</span>}
        </h2>
        
        <p className="modal-message">{content.message}</p>

        {status === "success" && txId && (
          <a
            href={`https://testnet.explorer.perawallet.app/tx/${txId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="explorer-link"
          >
            View on Explorer →
          </a>
        )}

        {canClose && onClose && (
          <button onClick={onClose} className="modal-close-button">
            {status === "success" ? "Done" : "Close"}
          </button>
        )}

        <style jsx>{`
          .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            backdrop-filter: blur(4px);
          }

          .modal-content {
            background: white;
            border-radius: 16px;
            padding: 32px;
            max-width: 400px;
            width: 90%;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            text-align: center;
          }

          .modal-icon {
            font-size: 64px;
            margin-bottom: 16px;
            animation: fadeIn 0.3s ease-in;
          }

          .modal-title {
            font-size: 24px;
            font-weight: 600;
            margin: 0 0 12px 0;
            color: #1a1a1a;
          }

          .dots {
            display: inline-block;
            width: 20px;
            text-align: left;
          }

          .modal-message {
            font-size: 16px;
            color: #666;
            margin: 0 0 24px 0;
            line-height: 1.5;
            word-break: break-word;
          }

          .explorer-link {
            display: inline-block;
            color: #0066cc;
            text-decoration: none;
            font-size: 14px;
            margin-bottom: 16px;
            transition: color 0.2s;
          }

          .explorer-link:hover {
            color: #0052a3;
            text-decoration: underline;
          }

          .modal-close-button {
            background: #0066cc;
            color: white;
            border: none;
            border-radius: 8px;
            padding: 12px 32px;
            font-size: 16px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
            width: 100%;
          }

          .modal-close-button:hover {
            background: #0052a3;
          }

          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: scale(0.8);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
        `}</style>
      </div>
    </div>
  );
}
