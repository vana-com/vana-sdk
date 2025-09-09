import { Mutex } from "async-mutex";
import type { PublicClient } from "viem";
import { relayerAccount } from "./relayer";

/**
 * Simple in-memory nonce manager for educational purposes.
 *
 * LIMITATIONS:
 * - Next.js dev server may run multiple processes, breaking singleton pattern
 * - Hot Module Replacement (HMR) can reset the instance
 * - True simultaneous requests may still conflict
 *
 * In local development (stateful):
 * - Maintains nonce in memory, incrementing for each transaction
 * - Prevents MOST nonce conflicts by tracking state
 * - Uses mutex to handle concurrent requests within same process
 *
 * In serverless/Vercel (stateless):
 * - Each request gets a new instance (no shared memory)
 * - Falls back to fetching fresh nonce from blockchain each time
 * - Less efficient but still functional
 *
 * For production, consider:
 * - Redis for shared nonce state across ALL instances/processes
 * - Vercel KV for atomic increments: `await kv.incr('nonce:' + address)`
 * - Database with row-level locking
 * - File-based locking for development
 */
class NonceManager {
  private nonce: number | null = null;
  private isInitialized = false;
  private lock = new Mutex();
  private lastUsedAt: number = 0;
  private readonly STALE_TIMEOUT = 30000; // 30 seconds

  /**
   * Get the next nonce to use for a transaction.
   * Thread-safe with mutex protection.
   */
  async getNonce(publicClient: PublicClient): Promise<number> {
    const release = await this.lock.acquire();
    try {
      const now = Date.now();

      // Reset if nonce is stale (helps recover from failed transactions)
      if (this.isInitialized && now - this.lastUsedAt > this.STALE_TIMEOUT) {
        console.log(
          "⏰ [NonceManager] Nonce is stale, refreshing from blockchain...",
        );
        this.isInitialized = false;
        this.nonce = null;
      }

      // Initialize by fetching the on-chain nonce
      if (!this.isInitialized) {
        console.log("🚀 [NonceManager] Initializing nonce from blockchain...");
        this.nonce = await publicClient.getTransactionCount({
          address: relayerAccount.address,
        });
        this.isInitialized = true;
        this.lastUsedAt = now;
        console.log(`✅ [NonceManager] Initialized with nonce: ${this.nonce}`);
        return this.nonce;
      }

      // For subsequent requests, increment the in-memory nonce
      if (this.nonce !== null) {
        this.nonce++;
        this.lastUsedAt = now;
        console.log(`📈 [NonceManager] Incremented nonce to: ${this.nonce}`);
        return this.nonce;
      }

      // Fallback (shouldn't happen)
      throw new Error(
        "[NonceManager] Unexpected state: nonce is null but manager is initialized",
      );
    } finally {
      release();
    }
  }

  /**
   * Reset the nonce manager (useful for testing or error recovery)
   */
  async reset(): Promise<void> {
    const release = await this.lock.acquire();
    try {
      console.log("🔄 [NonceManager] Resetting nonce manager...");
      this.isInitialized = false;
      this.nonce = null;
      this.lastUsedAt = 0;
    } finally {
      release();
    }
  }

  /**
   * Get current state (for debugging)
   */
  getState(): {
    isInitialized: boolean;
    nonce: number | null;
    lastUsedAt: number;
  } {
    return {
      isInitialized: this.isInitialized,
      nonce: this.nonce,
      lastUsedAt: this.lastUsedAt,
    };
  }
}

// Singleton instance
// - In local dev: Persists across requests, maintaining nonce state
// - In serverless: New instance per request, always fetches fresh
export const nonceManager = new NonceManager();
