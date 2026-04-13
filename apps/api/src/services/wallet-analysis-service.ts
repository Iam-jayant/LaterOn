import type algosdk from "algosdk";
import type { PostgresRepository } from "../db/postgres-repository.js";

export interface WalletSignal {
  signal: string;
  value: string;
  points: number;
  maxPoints: number;
  barPercent: number;
}

export interface ScoreBreakdown {
  breakdown: WalletSignal[];
  totalScore: number;
  tier: string;
  creditLimit: number;
}

/**
 * WalletAnalysisService analyzes Algorand wallet history using Indexer API
 * and calculates credit scores based on on-chain activity.
 * 
 * Scoring Signals (500 base + up to 400 points):
 * - Wallet Age: max 100 points
 * - Transaction Count: max 100 points
 * - Current Balance: max 100 points
 * - DeFi Activity: max 100 points
 * - LaterOn History: max 400 points (0 for new users)
 * 
 * Total Score Range: 500-1000 points
 */
export class WalletAnalysisService {
  private readonly KNOWN_DEFI_APP_IDS = [
    "21580889",   // Tinyman testnet
    "552635992",  // Tinyman mainnet
    "1166022341"  // Folks Finance mainnet
  ];

  constructor(
    private readonly indexerClient: algosdk.Indexer,
    private readonly repository: PostgresRepository
  ) {}

  /**
   * Analyze a wallet and calculate credit score.
   * Fetches on-chain data from Algorand Indexer and computes score breakdown.
   * 
   * @param walletAddress - Algorand wallet address to analyze
   * @returns Score breakdown with signals, total score, tier, and credit limit
   */
  async analyzeWallet(walletAddress: string): Promise<ScoreBreakdown> {
    // Fetch wallet signals from Indexer
    const walletAgeDays = await this.fetchWalletAge(walletAddress);
    const txCount = await this.fetchTransactionCount(walletAddress);
    const balanceAlgo = await this.fetchCurrentBalance(walletAddress);
    const hasDeFi = await this.fetchDefiActivity(walletAddress);

    // Calculate score
    return this.calculateScore({
      walletAgeDays,
      txCount,
      balanceAlgo,
      hasDeFi,
    });
  }

  /**
   * Fetch wallet age in days from first transaction.
   * Returns 0 if no transactions found (new wallet).
   * 
   * @param walletAddress - Algorand wallet address
   * @returns Wallet age in days
   */
  private async fetchWalletAge(walletAddress: string): Promise<number> {
    try {
      const response = await this.indexerClient
        .searchForTransactions()
        .address(walletAddress)
        .limit(1)
        .do();

      if (!response.transactions || response.transactions.length === 0) {
        return 0;
      }

      const firstTxTimestamp = response.transactions[0].roundTime;
      if (!firstTxTimestamp) {
        return 0;
      }

      const nowSeconds = Math.floor(Date.now() / 1000);
      const ageDays = Math.floor((nowSeconds - firstTxTimestamp) / 86400);
      return Math.max(0, ageDays);
    } catch (error) {
      console.error("Indexer error fetching wallet age:", error);
      return 0; // Graceful degradation
    }
  }

  /**
   * Fetch total transaction count for wallet.
   * Returns 0 if account not found or no transactions.
   * 
   * @param walletAddress - Algorand wallet address
   * @returns Total transaction count
   */
  private async fetchTransactionCount(walletAddress: string): Promise<number> {
    try {
      // Search for all transactions and count them
      // Note: This is a simplified approach. For production, consider pagination
      const response = await this.indexerClient
        .searchForTransactions()
        .address(walletAddress)
        .limit(1000) // Get up to 1000 transactions
        .do();

      return response.transactions?.length ?? 0;
    } catch (error) {
      console.error("Indexer error fetching transaction count:", error);
      return 0; // Graceful degradation
    }
  }

  /**
   * Fetch current ALGO balance for wallet.
   * Returns 0 if account not found.
   * 
   * @param walletAddress - Algorand wallet address
   * @returns Current balance in ALGO
   */
  private async fetchCurrentBalance(walletAddress: string): Promise<number> {
    try {
      const accountInfo = await this.indexerClient
        .lookupAccountByID(walletAddress)
        .do();

      const microAlgos = accountInfo.account?.amount ?? BigInt(0);
      return Number(microAlgos) / 1_000_000;
    } catch (error) {
      console.error("Indexer error fetching balance:", error);
      return 0; // Graceful degradation
    }
  }

  /**
   * Check if wallet has DeFi activity.
   * Searches for application call transactions to known DeFi protocols.
   * 
   * @param walletAddress - Algorand wallet address
   * @returns True if DeFi activity found, false otherwise
   */
  private async fetchDefiActivity(walletAddress: string): Promise<boolean> {
    try {
      const response = await this.indexerClient
        .searchForTransactions()
        .address(walletAddress)
        .txType("appl")
        .limit(100)
        .do();

      if (!response.transactions || response.transactions.length === 0) {
        return false;
      }

      // Check if any transaction interacts with known DeFi app IDs
      return response.transactions.some((tx: any) => {
        const appId = tx["application-transaction"]?.["application-id"];
        return appId && this.KNOWN_DEFI_APP_IDS.includes(String(appId));
      });
    } catch (error) {
      console.error("Indexer error fetching DeFi activity:", error);
      return false; // Graceful degradation
    }
  }

  /**
   * Calculate credit score from wallet signals.
   * Base score: 500 points
   * Maximum score: 1000 points
   * 
   * @param signals - Wallet signals (age, tx count, balance, DeFi)
   * @returns Score breakdown with tier and credit limit
   */
  private calculateScore(signals: {
    walletAgeDays: number;
    txCount: number;
    balanceAlgo: number;
    hasDeFi: boolean;
  }): ScoreBreakdown {
    let score = 500; // Base score for all new users

    // Wallet Age signal (max 100 points)
    let walletAgePoints = 0;
    if (signals.walletAgeDays > 365) {
      walletAgePoints = 100;
    } else if (signals.walletAgeDays > 90) {
      walletAgePoints = 60;
    } else if (signals.walletAgeDays > 30) {
      walletAgePoints = 30;
    } else if (signals.walletAgeDays > 0) {
      walletAgePoints = 10;
    }
    score += walletAgePoints;

    // Transaction Count signal (max 100 points)
    let txCountPoints = 0;
    if (signals.txCount > 200) {
      txCountPoints = 100;
    } else if (signals.txCount > 50) {
      txCountPoints = 60;
    } else if (signals.txCount > 10) {
      txCountPoints = 30;
    } else if (signals.txCount > 0) {
      txCountPoints = 10;
    }
    score += txCountPoints;

    // Balance signal (max 100 points)
    let balancePoints = 0;
    if (signals.balanceAlgo > 100) {
      balancePoints = 100;
    } else if (signals.balanceAlgo > 20) {
      balancePoints = 60;
    } else if (signals.balanceAlgo > 5) {
      balancePoints = 30;
    }
    score += balancePoints;

    // DeFi Activity signal (max 100 points)
    const defiPoints = signals.hasDeFi ? 100 : 0;
    score += defiPoints;

    // LaterOn History signal (0 for new users, max 400 for existing)
    const lateronPoints = 0;

    // Ensure score is within bounds
    score = Math.min(Math.max(score, 500), 1000);

    // Determine tier based on score
    let tier = "Starter";
    let creditLimit = 1000; // ₹1,000 base limit

    if (score >= 700) {
      tier = "Trusted";
      creditLimit = 10000; // ₹10,000
    } else if (score >= 600) {
      tier = "Builder";
      creditLimit = 5000; // ₹5,000
    }

    // Build breakdown
    const breakdown: WalletSignal[] = [
      {
        signal: "Wallet Age",
        value: `${signals.walletAgeDays} days`,
        points: walletAgePoints,
        maxPoints: 100,
        barPercent: (walletAgePoints / 100) * 100,
      },
      {
        signal: "Transaction Count",
        value: `${signals.txCount} transactions`,
        points: txCountPoints,
        maxPoints: 100,
        barPercent: (txCountPoints / 100) * 100,
      },
      {
        signal: "ALGO Balance",
        value: `${signals.balanceAlgo.toFixed(2)} ALGO`,
        points: balancePoints,
        maxPoints: 100,
        barPercent: (balancePoints / 100) * 100,
      },
      {
        signal: "DeFi Activity",
        value: signals.hasDeFi ? "Found" : "None detected",
        points: defiPoints,
        maxPoints: 100,
        barPercent: (defiPoints / 100) * 100,
      },
      {
        signal: "LaterOn History",
        value: "New user",
        points: lateronPoints,
        maxPoints: 400,
        barPercent: (lateronPoints / 400) * 100,
      },
    ];

    return {
      breakdown,
      totalScore: score,
      tier,
      creditLimit,
    };
  }
}
