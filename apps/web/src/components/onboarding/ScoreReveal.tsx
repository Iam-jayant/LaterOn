"use client";

import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api";

interface ScoreRevealProps {
  authToken: string;
  onComplete: () => void;
}

interface WalletSignal {
  value: string | number;
  points: number;
  maxPoints: number;
  barPercent: number;
}

interface ScoreBreakdown {
  walletAge: WalletSignal;
  transactionCount: WalletSignal;
  currentBalance: WalletSignal;
  defiActivity: WalletSignal;
  lateronHistory: WalletSignal;
  totalScore: number;
  tier: string;
  creditLimit: number;
}

export function ScoreReveal({ authToken, onComplete }: ScoreRevealProps) {
  const [breakdown, setBreakdown] = useState<ScoreBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [animationStep, setAnimationStep] = useState(0);
  const [displayScore, setDisplayScore] = useState(500);

  // Fetch wallet analysis on mount
  useEffect(() => {
    const fetchAnalysis = async () => {
      try {
        setIsLoading(true);
        const result = await apiClient.analyseWallet(authToken);
        setBreakdown(result.breakdown);
        setError(null);
      } catch (err) {
        console.error("Wallet analysis failed:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to analyze wallet. Please try again."
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnalysis();
  }, [authToken]);

  // Animate bars sequentially
  useEffect(() => {
    if (!breakdown || animationStep >= 5) return;

    const timer = setTimeout(() => {
      setAnimationStep((prev) => prev + 1);
    }, 300);

    return () => clearTimeout(timer);
  }, [breakdown, animationStep]);

  // Animate score counter after all bars complete
  useEffect(() => {
    if (!breakdown || animationStep < 5) return;

    const duration = 1000;
    const steps = 50;
    const increment = (breakdown.totalScore - 500) / steps;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      if (currentStep >= steps) {
        setDisplayScore(breakdown.totalScore);
        clearInterval(timer);
      } else {
        setDisplayScore(Math.floor(500 + increment * currentStep));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [breakdown, animationStep]);

  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
    setAnimationStep(0);
    setDisplayScore(500);
    window.location.reload();
  };

  if (isLoading) {
    return (
      <div className="container">
        <div className="loading">
          <div className="spinner" />
          <p>Analyzing your wallet...</p>
        </div>
        <style jsx>{`
          .container {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }

          .loading {
            text-align: center;
            color: white;
          }

          .spinner {
            width: 48px;
            height: 48px;
            border: 4px solid rgba(255, 255, 255, 0.3);
            border-top-color: white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 16px;
          }

          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }

          .loading p {
            font-size: 18px;
            margin: 0;
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="error-card">
          <div className="error-icon">❌</div>
          <h2>Analysis Failed</h2>
          <p>{error}</p>
          <button onClick={handleRetry} className="retry-button">
            Retry
          </button>
        </div>
        <style jsx>{`
          .container {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }

          .error-card {
            background: white;
            border-radius: 16px;
            padding: 48px;
            max-width: 400px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          }

          .error-icon {
            font-size: 64px;
            margin-bottom: 16px;
          }

          .error-card h2 {
            font-size: 24px;
            font-weight: 600;
            margin: 0 0 12px 0;
            color: #1a1a1a;
          }

          .error-card p {
            font-size: 16px;
            color: #666;
            margin: 0 0 24px 0;
            line-height: 1.5;
          }

          .retry-button {
            background: #0066cc;
            color: white;
            border: none;
            border-radius: 8px;
            padding: 12px 32px;
            font-size: 16px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
          }

          .retry-button:hover {
            background: #0052a3;
          }
        `}</style>
      </div>
    );
  }

  if (!breakdown) return null;

  const signals = [
    { label: "Wallet Age", signal: breakdown.walletAge, step: 0 },
    { label: "Transaction Count", signal: breakdown.transactionCount, step: 1 },
    { label: "Current Balance", signal: breakdown.currentBalance, step: 2 },
    { label: "DeFi Activity", signal: breakdown.defiActivity, step: 3 },
    { label: "LaterOn History", signal: breakdown.lateronHistory, step: 4 },
  ];

  const showFinalScore = animationStep >= 5;

  return (
    <div className="container">
      <div className="card">
        <h1 className="title">Your Credit Score</h1>

        <div className="signals">
          {signals.map(({ label, signal, step }) => (
            <div key={label} className="signal-row">
              <div className="signal-header">
                <span className="signal-label">{label}</span>
                <span className="signal-value">{signal.value}</span>
              </div>
              <div className="bar-container">
                <div
                  className="bar-fill"
                  style={{
                    width:
                      animationStep > step ? `${signal.barPercent}%` : "0%",
                  }}
                />
              </div>
              <div className="signal-points">
                {signal.points} / {signal.maxPoints} pts
              </div>
            </div>
          ))}
        </div>

        {showFinalScore && (
          <div className="score-section">
            <div className="score-display">{displayScore}</div>
            <div className="tier-badge">{breakdown.tier}</div>
            <div className="credit-limit">
              Credit Limit: ₹{breakdown.creditLimit.toLocaleString()}
            </div>
            <button onClick={onComplete} className="continue-button">
              Continue to Marketplace
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        .container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 24px;
        }

        .card {
          background: white;
          border-radius: 16px;
          padding: 48px;
          max-width: 600px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        .title {
          font-size: 32px;
          font-weight: 600;
          margin: 0 0 32px 0;
          text-align: center;
          color: #1a1a1a;
        }

        .signals {
          margin-bottom: 32px;
        }

        .signal-row {
          margin-bottom: 24px;
        }

        .signal-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .signal-label {
          font-size: 16px;
          font-weight: 500;
          color: #333;
        }

        .signal-value {
          font-size: 14px;
          color: #666;
        }

        .bar-container {
          height: 12px;
          background: #f0f0f0;
          border-radius: 6px;
          overflow: hidden;
          margin-bottom: 4px;
        }

        .bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
          transition: width 0.3s ease-out;
        }

        .signal-points {
          font-size: 12px;
          color: #999;
          text-align: right;
        }

        .score-section {
          text-align: center;
          padding-top: 32px;
          border-top: 2px solid #f0f0f0;
          animation: fadeIn 0.5s ease-in;
        }

        .score-display {
          font-size: 72px;
          font-weight: 700;
          color: #667eea;
          margin-bottom: 16px;
        }

        .tier-badge {
          display: inline-block;
          background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 8px 24px;
          border-radius: 20px;
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 16px;
        }

        .credit-limit {
          font-size: 20px;
          color: #333;
          margin-bottom: 32px;
        }

        .continue-button {
          background: #0066cc;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 14px 48px;
          font-size: 18px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }

        .continue-button:hover {
          background: #0052a3;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
