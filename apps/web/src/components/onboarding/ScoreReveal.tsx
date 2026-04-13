"use client";

import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api";
import { PRIMARY, BACKGROUND, TEXT, SUCCESS } from "@/lib/colors";

interface ScoreRevealProps {
  authToken: string;
  onComplete: () => void;
}

interface WalletSignal {
  signal: string;
  value: string | number;
  points: number;
  maxPoints: number;
  barPercent: number;
}

interface ScoreBreakdown {
  breakdown: WalletSignal[];
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
        setBreakdown(result);
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
            background: #FFFFFF;
          }

          .loading {
            text-align: center;
            color: #0A0C12;
          }

          .spinner {
            width: 48px;
            height: 48px;
            border: 4px solid rgba(10,12,18,0.1);
            border-top-color: #6b7a00;
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
            font-family: 'Inter', sans-serif;
            font-size: 16px;
            margin: 0;
            font-weight: 500;
            color: rgba(10,12,18,0.6);
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
            background: #FFFFFF;
          }

          .error-card {
            background: #FFFFFF;
            border: 1px solid rgba(10,12,18,0.07);
            border-radius: 20px;
            padding: 48px;
            max-width: 400px;
            text-align: center;
            box-shadow: 0 4px 16px rgba(10,12,18,0.06);
          }

          .error-icon {
            font-size: 64px;
            margin-bottom: 16px;
          }

          .error-card h2 {
            font-family: 'Space Grotesk', sans-serif;
            font-size: 24px;
            font-weight: 700;
            margin: 0 0 12px 0;
            color: #0A0C12;
          }

          .error-card p {
            font-family: 'Inter', sans-serif;
            font-size: 15px;
            color: rgba(10,12,18,0.5);
            margin: 0 0 24px 0;
            line-height: 1.5;
          }

          .retry-button {
            background: #D7E377;
            color: #0A0C12;
            border: none;
            border-radius: 12px;
            padding: 12px 32px;
            font-family: 'Inter', sans-serif;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.22s;
            box-shadow: 0 4px 20px rgba(107,122,0,0.25);
          }

          .retry-button:hover {
            background: #e4ee8c;
            transform: translateY(-2px);
            box-shadow: 0 8px 28px rgba(107,122,0,0.32);
          }
        `}</style>
      </div>
    );
  }

  if (!breakdown) return null;

  // Convert breakdown array to object for easier access
  const breakdownObj = {
    walletAge: breakdown.breakdown.find((s: any) => s.signal === "Wallet Age"),
    transactionCount: breakdown.breakdown.find((s: any) => s.signal === "Transaction Count"),
    currentBalance: breakdown.breakdown.find((s: any) => s.signal === "ALGO Balance"),
    defiActivity: breakdown.breakdown.find((s: any) => s.signal === "DeFi Activity"),
    lateronHistory: breakdown.breakdown.find((s: any) => s.signal === "LaterOn History"),
  };

  const signals = [
    { label: "Wallet Age", signal: breakdownObj.walletAge, step: 0 },
    { label: "Transaction Count", signal: breakdownObj.transactionCount, step: 1 },
    { label: "Current Balance", signal: breakdownObj.currentBalance, step: 2 },
    { label: "DeFi Activity", signal: breakdownObj.defiActivity, step: 3 },
    { label: "LaterOn History", signal: breakdownObj.lateronHistory, step: 4 },
  ];

  const showFinalScore = animationStep >= 5;

  // Calculate score percentage (assuming max score is 1000)
  const scorePercentage = showFinalScore ? (displayScore / 1000) * 100 : 0;
  const circumference = 2 * Math.PI * 130; // radius = 130
  const strokeDashoffset = circumference - (scorePercentage / 100) * circumference;

  return (
    <div className="container">
      <div className="unified-card">
        <h1 className="title">Your Credit Score</h1>

        <div className="content-grid">
          {/* Left Column - Score Breakdown */}
          <div className="signals">
            {signals.map(({ label, signal, step }) => signal && (
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

          {/* Right Column - Animated Score Circle */}
          <div className="score-section">
            <div className="circle-container">
              <svg className="progress-ring" width="280" height="280">
                <circle
                  className="progress-ring-bg"
                  stroke="rgba(10,12,18,0.06)"
                  strokeWidth="8"
                  fill="transparent"
                  r="130"
                  cx="140"
                  cy="140"
                />
                <circle
                  className="progress-ring-circle"
                  stroke="#6b7a00"
                  strokeWidth="8"
                  fill="transparent"
                  r="130"
                  cx="140"
                  cy="140"
                  style={{
                    strokeDasharray: circumference,
                    strokeDashoffset: showFinalScore ? strokeDashoffset : circumference,
                    transition: 'stroke-dashoffset 1.5s ease-out',
                  }}
                />
              </svg>
              <div className="score-content">
                <div className="score-display">{displayScore}</div>
                {showFinalScore && (
                  <>
                    <div className="tier-badge">{breakdown.tier}</div>
                    <div className="credit-limit">
                      Credit Limit: ₹{breakdown.creditLimit.toLocaleString()}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Centered Button */}
        {showFinalScore && (
          <div className="button-container">
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
          background: #FFFFFF;
          padding: 32px;
          position: relative;
        }

        .unified-card {
          background: #FFFFFF;
          border: 1px solid rgba(10,12,18,0.07);
          border-radius: 24px;
          padding: 48px;
          max-width: 1100px;
          width: 100%;
          box-shadow: 0 4px 16px rgba(10,12,18,0.06);
          position: relative;
          z-index: 1;
        }

        .title {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 32px;
          font-weight: 700;
          margin: 0 0 40px 0;
          color: #0A0C12;
          letter-spacing: -0.8px;
          text-align: center;
        }

        .content-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 48px;
          margin-bottom: 40px;
        }

        .signals {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .signal-row {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .signal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .signal-label {
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          font-weight: 500;
          color: #0A0C12;
        }

        .signal-value {
          font-family: 'Inter', sans-serif;
          font-size: 13px;
          color: rgba(10,12,18,0.5);
        }

        .bar-container {
          height: 6px;
          background: rgba(10,12,18,0.06);
          border-radius: 3px;
          overflow: hidden;
        }

        .bar-fill {
          height: 100%;
          background: #6b7a00;
          transition: width 0.3s ease-out;
        }

        .signal-points {
          font-family: 'Inter', sans-serif;
          font-size: 12px;
          color: rgba(10,12,18,0.45);
          text-align: right;
        }

        .score-section {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .circle-container {
          position: relative;
          width: 280px;
          height: 280px;
        }

        .progress-ring {
          transform: rotate(-90deg);
        }

        .progress-ring-circle {
          stroke-linecap: round;
        }

        .score-content {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
          width: 100%;
        }

        .score-display {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 64px;
          font-weight: 700;
          color: #0A0C12;
          margin-bottom: 8px;
          letter-spacing: -2px;
          line-height: 1;
        }

        .tier-badge {
          display: inline-block;
          background: #D7E377;
          color: #0A0C12;
          padding: 6px 20px;
          border-radius: 16px;
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 8px;
          animation: fadeIn 0.5s ease-in 0.3s both;
        }

        .credit-limit {
          font-family: 'Inter', sans-serif;
          font-size: 13px;
          color: rgba(10,12,18,0.5);
          animation: fadeIn 0.5s ease-in 0.4s both;
        }

        .button-container {
          display: flex;
          justify-content: center;
          padding-top: 24px;
          border-top: 1px solid rgba(10,12,18,0.07);
          animation: fadeIn 0.5s ease-in 0.5s both;
        }

        .continue-button {
          background: #D7E377;
          color: #0A0C12;
          border: none;
          border-radius: 12px;
          padding: 14px 48px;
          font-family: 'Inter', sans-serif;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.22s;
          box-shadow: 0 4px 20px rgba(107,122,0,0.25);
        }

        .continue-button:hover {
          background: #e4ee8c;
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(107,122,0,0.32);
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Responsive Design */
        @media (max-width: 968px) {
          .content-grid {
            grid-template-columns: 1fr;
            gap: 32px;
          }

          .circle-container {
            width: 240px;
            height: 240px;
          }

          .score-display {
            font-size: 56px;
          }
        }

        @media (max-width: 640px) {
          .container {
            padding: 20px;
          }

          .unified-card {
            padding: 32px 24px;
          }

          .title {
            font-size: 26px;
            margin-bottom: 32px;
          }

          .content-grid {
            gap: 28px;
            margin-bottom: 32px;
          }

          .circle-container {
            width: 200px;
            height: 200px;
          }

          .score-display {
            font-size: 48px;
          }

          .continue-button {
            width: 100%;
            max-width: 320px;
          }
        }
      `}</style>
    </div>
  );
}
