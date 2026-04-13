"use client";

import { useEffect, useState } from "react";
import { PRIMARY, TEXT, SUCCESS, TEXT_MUTED } from "@/lib/colors";

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
          iconBg: "rgba(107,122,0,0.1)",
          iconContent: (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6b7a00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          ),
          showSpinner: true,
        };
      case "submitting":
        return {
          title: "Submitting transaction",
          message: "Sending transaction to Algorand TestNet",
          iconBg: "rgba(107,122,0,0.1)",
          iconContent: (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6b7a00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <polyline points="19 12 12 19 5 12"/>
            </svg>
          ),
          showSpinner: true,
        };
      case "confirming":
        return {
          title: "Confirming transaction",
          message: "Waiting for blockchain confirmation",
          iconBg: "rgba(107,122,0,0.1)",
          iconContent: (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6b7a00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          ),
          showSpinner: true,
        };
      case "success":
        return {
          title: "Transaction confirmed!",
          message: txId
            ? `Transaction ID: ${txId.substring(0, 8)}...${txId.substring(txId.length - 8)}`
            : "Your transaction was successful",
          iconBg: "rgba(107,122,0,0.12)",
          iconContent: (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="rgba(107,122,0,0.12)"/>
              <path d="M8 12l3 3 5-5" stroke="#6b7a00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ),
          showSpinner: false,
        };
      case "error":
        return {
          title: "Transaction failed",
          message: error || "An error occurred while processing your transaction",
          iconBg: "rgba(204,0,0,0.1)",
          iconContent: (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#cc0000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          ),
          showSpinner: false,
        };
    }
  };

  const content = getStatusContent();
  const canClose = status === "success" || status === "error";

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        backdropFilter: 'blur(4px)',
        padding: '16px'
      }}
      onClick={canClose ? onClose : undefined}
    >
      <div 
        style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          padding: '40px 32px',
          maxWidth: '440px',
          width: '90%',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          textAlign: 'center'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div style={{ 
          width: '64px',
          height: '64px',
          margin: '0 auto 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: content.iconBg,
          borderRadius: '50%'
        }}>
          {content.iconContent}
        </div>
        
        {/* Title */}
        <h2 style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: '24px',
          fontWeight: 600,
          margin: '0 0 12px 0',
          color: TEXT,
          letterSpacing: '-0.4px',
          lineHeight: 1.2
        }}>
          {content.title}
          {content.showSpinner && <span style={{ display: 'inline-block', width: '20px', textAlign: 'left' }}>{dots}</span>}
        </h2>
        
        {/* Message */}
        <p style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: '15px',
          color: TEXT_MUTED,
          margin: '0 0 24px 0',
          lineHeight: 1.6,
          wordBreak: 'break-word'
        }}>{content.message}</p>

        {/* Explorer Link */}
        {status === "success" && txId && (
          <a
            href={`https://testnet.explorer.perawallet.app/tx/${txId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: SUCCESS,
              textDecoration: 'none',
              fontFamily: "'Inter', sans-serif",
              fontSize: '14px',
              fontWeight: 500,
              marginBottom: '20px',
              transition: 'all 0.2s'
            }}
          >
            View on Explorer
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M6 3h7v7M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        )}

        {/* Close Button */}
        {canClose && onClose && (
          <button 
            onClick={onClose}
            style={{
              background: PRIMARY,
              color: TEXT,
              border: 'none',
              borderRadius: '12px',
              padding: '14px 32px',
              fontFamily: "'Inter', sans-serif",
              fontSize: '16px',
              fontWeight: 600,
              cursor: 'pointer',
              width: '100%',
              boxShadow: `0 4px 16px rgba(107,122,0,0.25)`,
              transition: 'all 0.22s',
              minHeight: '44px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#e4ee8c';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 28px rgba(107,122,0,0.32)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = PRIMARY;
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(107,122,0,0.25)';
            }}
          >
            {status === "success" ? "Done" : "Close"}
          </button>
        )}
      </div>
    </div>
  );
}
