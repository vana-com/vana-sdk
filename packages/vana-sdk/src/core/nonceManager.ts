/**
 * Internal distributed nonce manager for atomic transaction nonce assignment.
 *
 * @internal
 * @module
 */

import type { PublicClient, WalletClient, Address, Hash } from "viem";
import type { IAtomicStore } from "../types/atomicStore";
import { hasNonceSupport } from "../types/atomicStore";

/**
 * Configuration for the distributed nonce manager.
 *
 * @internal
 */
export interface NonceManagerConfig {
  /** Atomic store for distributed coordination */
  atomicStore: IAtomicStore;
  /** Public client for blockchain queries */
  publicClient: PublicClient;
  /** TTL for nonce locks in seconds (default: 5) */
  lockTTL?: number;
  /** Maximum retries to acquire lock (default: 50) */
  maxLockRetries?: number;
  /** Delay between lock retries in milliseconds (default: 100) */
  lockRetryDelay?: number;
}

/**
 * Internal nonce manager that coordinates distributed nonce assignment.
 *
 * @internal
 * @remarks
 * This class implements sophisticated logic for atomic nonce assignment
 * in distributed environments. It uses the provided IAtomicStore to
 * coordinate between multiple instances and prevent nonce conflicts.
 *
 * Key features:
 * - Store-specific optimizations when available (e.g., Redis Lua scripts)
 * - Fallback to distributed locking for generic stores
 * - Syncing with blockchain pending count
 * - Nonce gap prevention
 * - Nonce burning capability for stuck transactions
 */
export class DistributedNonceManager {
  private readonly store: IAtomicStore;
  private readonly publicClient: PublicClient;
  private readonly lockTTL: number;
  private readonly maxLockRetries: number;
  private readonly lockRetryDelay: number;

  constructor(config: NonceManagerConfig) {
    this.store = config.atomicStore;
    this.publicClient = config.publicClient;
    this.lockTTL = config.lockTTL ?? 5;
    this.maxLockRetries = config.maxLockRetries ?? 50;
    this.lockRetryDelay = config.lockRetryDelay ?? 100;
  }

  /**
   * Atomically assigns the next available nonce for an address.
   *
   * @remarks
   * This method uses two strategies depending on the atomic store capabilities:
   * 1. If the store provides atomicAssignNonce (store-specific optimization),
   *    it uses that for maximum reliability and performance
   * 2. Otherwise, it falls back to the lock-based approach:
   *    - Acquires a distributed lock to prevent race conditions
   *    - Queries the blockchain for the current pending nonce
   *    - Syncs the stored nonce if blockchain is ahead
   *    - Atomically increments and returns the next nonce
   *    - Releases the lock
   *
   * @param address - The address to assign a nonce for
   * @param chainId - The chain ID for the network
   * @returns The assigned nonce, or null if lock acquisition fails
   */
  async assignNonce(address: Address, chainId: number): Promise<number | null> {
    const lastUsedKey = `nonce:${chainId}:${address}:lastUsed`;
    const lockKey = `nonce:${chainId}:${address}:lock`;

    // Check if the store provides an optimized atomic nonce assignment
    if (hasNonceSupport(this.store)) {
      try {
        // Get pending transaction count from blockchain
        const pendingCount = await this.publicClient.getTransactionCount({
          address,
          blockTag: "pending",
        });

        // Use store-specific optimized implementation (e.g., Redis Lua script)
        const nonce = await this.store.atomicAssignNonce(
          lastUsedKey,
          pendingCount,
        );

        console.log(
          `[NonceManager] Assigned nonce ${nonce} for ${address} on chain ${chainId} (using store optimization)`,
        );

        return nonce;
      } catch (error) {
        console.error(
          "[NonceManager] Error during optimized nonce assignment:",
          error,
        );
        throw error;
      }
    }

    // Try to acquire lock with retries
    let lockAcquired = false;
    let retries = 0;
    let acquiredLockId: string | null = null;

    while (!lockAcquired && retries < this.maxLockRetries) {
      // Try to acquire the lock
      acquiredLockId = await this.store.acquireLock(lockKey, this.lockTTL);
      lockAcquired = acquiredLockId !== null;

      if (lockAcquired && acquiredLockId) {
        try {
          // Get pending transaction count from blockchain
          const pendingCount = await this.publicClient.getTransactionCount({
            address,
            blockTag: "pending",
          });

          // Calculate the pending nonce (0-indexed)
          // If no transactions, start at 0
          const blockchainPending = pendingCount === 0 ? -1 : pendingCount - 1;

          // Get current lastUsed from store
          const currentLastUsedStr = await this.store.get(lastUsedKey);
          const currentLastUsed = currentLastUsedStr
            ? parseInt(currentLastUsedStr)
            : -1;

          // Sync lastUsed with blockchain if blockchain is ahead
          // This handles cases where transactions were sent outside this system
          if (blockchainPending > currentLastUsed) {
            await this.store.set(lastUsedKey, blockchainPending.toString());
            console.log(
              `[NonceManager] Synced nonce for ${address} on chain ${chainId}: ${currentLastUsed} -> ${blockchainPending}`,
            );
          }

          // Atomically increment and get next nonce
          const nextNonce = await this.store.incr(lastUsedKey);

          console.log(
            `[NonceManager] Assigned nonce ${nextNonce} for ${address} on chain ${chainId}`,
          );

          // Store assignment metadata for debugging (optional TTL)
          if (this.store.setWithTTL) {
            const assignmentKey = `nonce:${chainId}:${address}:assignment:${nextNonce}`;
            const metadata = {
              nonce: nextNonce,
              assignedAt: Date.now(),
              address,
              chainId,
            };
            // Store for 1 hour for debugging
            await this.store.setWithTTL(
              assignmentKey,
              JSON.stringify(metadata),
              3600,
            );
          }

          return nextNonce;
        } catch (error) {
          console.error("[NonceManager] Error during nonce assignment:", error);
          throw error;
        } finally {
          // Always release the lock
          await this.store.releaseLock(lockKey, acquiredLockId);
        }
      } else {
        // Failed to acquire lock, wait and retry with exponential backoff
        retries++;
        if (retries < this.maxLockRetries) {
          const delay = Math.min(
            this.lockRetryDelay * Math.pow(1.5, retries - 1),
            5000, // Cap at 5 seconds
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    console.error(
      `[NonceManager] Failed to acquire lock for ${address} after ${this.maxLockRetries} attempts`,
    );
    return null;
  }

  /**
   * Resets the nonce counter for an address.
   *
   * @remarks
   * Use with caution - should only be called when you're certain
   * no transactions are pending. This is useful for recovery from
   * stuck states.
   *
   * @param address - The address to reset nonce for
   * @param chainId - The chain ID for the network
   */
  async resetNonce(address: Address, chainId: number): Promise<void> {
    const lastUsedKey = `nonce:${chainId}:${address}:lastUsed`;
    const lockKey = `nonce:${chainId}:${address}:lock`;

    // Acquire lock before resetting
    const lockId = await this.acquireLockWithRetry(lockKey);
    if (!lockId) {
      throw new Error("Failed to acquire lock for nonce reset");
    }

    try {
      // Get confirmed transaction count from blockchain
      const confirmedCount = await this.publicClient.getTransactionCount({
        address,
        blockTag: "latest",
      });

      // Reset to blockchain state (confirmed count - 1 since we're 0-indexed)
      const resetValue = confirmedCount === 0 ? -1 : confirmedCount - 1;
      await this.store.set(lastUsedKey, resetValue.toString());

      console.log(
        `[NonceManager] Reset nonce for ${address} on chain ${chainId} to ${resetValue}`,
      );
    } finally {
      await this.store.releaseLock(lockKey, lockId);
    }
  }

  /**
   * Gets the current nonce state for monitoring/debugging.
   *
   * @param address - The address to check
   * @param chainId - The chain ID for the network
   * @returns Current nonce state information
   */
  async getNonceState(
    address: Address,
    chainId: number,
  ): Promise<{
    lastUsed: number;
    blockchainPending: number;
    blockchainConfirmed: number;
  }> {
    const lastUsedKey = `nonce:${chainId}:${address}:lastUsed`;

    // Get stored state
    const lastUsedStr = await this.store.get(lastUsedKey);
    const lastUsed = lastUsedStr ? parseInt(lastUsedStr) : -1;

    // Get blockchain state
    const [pendingCount, confirmedCount] = await Promise.all([
      this.publicClient.getTransactionCount({
        address,
        blockTag: "pending",
      }),
      this.publicClient.getTransactionCount({
        address,
        blockTag: "latest",
      }),
    ]);

    return {
      lastUsed,
      blockchainPending: pendingCount === 0 ? -1 : pendingCount - 1,
      blockchainConfirmed: confirmedCount === 0 ? -1 : confirmedCount - 1,
    };
  }

  /**
   * Helper to acquire lock with retries.
   *
   * @internal
   */
  private async acquireLockWithRetry(lockKey: string): Promise<string | null> {
    let retries = 0;

    while (retries < this.maxLockRetries) {
      const lockId = await this.store.acquireLock(lockKey, this.lockTTL);

      if (lockId) {
        return lockId;
      }

      retries++;
      if (retries < this.maxLockRetries) {
        const delay = Math.min(
          this.lockRetryDelay * Math.pow(1.5, retries - 1),
          5000,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return null;
  }

  /**
   * Burns a stuck nonce by sending a minimal self-transfer with higher gas.
   *
   * @remarks
   * This method implements Vana App's production nonce burning strategy.
   * It sends a zero-value transaction to the same address with elevated gas
   * to replace a stuck transaction and unblock the nonce queue.
   *
   * Ported from apps/web/app/api/relay/route.ts (Vana App production code)
   *
   * @param walletClient - The wallet client to send the burn transaction
   * @param nonceToBurn - The nonce to burn
   * @param address - The address whose nonce to burn
   * @param chainId - The chain ID for the network
   * @param gasMultiplier - Multiplier for gas prices (default: 1.5)
   * @returns The transaction hash of the burn transaction
   */
  async burnNonce(
    walletClient: WalletClient,
    nonceToBurn: number,
    address: Address,
    chainId: number,
    gasMultiplier: number = 1.5,
  ): Promise<Hash> {
    try {
      // Get current gas prices
      const fees = await this.publicClient.estimateFeesPerGas();

      // Bump gas prices by multiplier (Vana App's exact formula)
      const bump = (x: bigint) =>
        (x * BigInt(Math.floor(gasMultiplier * 100))) / 100n;

      const newMaxFee = bump(fees.maxFeePerGas);
      const newMaxPriorityFee = bump(fees.maxPriorityFeePerGas);

      console.log(
        `[NonceManager] Burning stuck nonce ${nonceToBurn} with high gas price: maxFee ${newMaxFee}, maxPriorityFee ${newMaxPriorityFee}`,
      );

      // Send minimal self-transfer to burn the nonce
      const account = walletClient.account;
      if (!account) {
        throw new Error(
          "WalletClient must be configured with an account to burn stuck nonces",
        );
      }

      const burnTx = await walletClient.sendTransaction({
        account,
        to: address, // Self-transfer
        value: 0n,
        nonce: nonceToBurn,
        gas: 21000n, // Minimal gas for transfer
        maxFeePerGas: newMaxFee,
        maxPriorityFeePerGas: newMaxPriorityFee,
        chain: {
          id: chainId,
          name: chainId === 14800 ? "Vana Moksha" : "Vana Mainnet",
          network: chainId === 14800 ? "moksha" : "mainnet",
          nativeCurrency: { name: "VANA", symbol: "VANA", decimals: 18 },
          rpcUrls: {
            default: {
              http: [
                chainId === 14800
                  ? "https://rpc.moksha.vana.org"
                  : "https://rpc.vana.org",
              ],
            },
            public: {
              http: [
                chainId === 14800
                  ? "https://rpc.moksha.vana.org"
                  : "https://rpc.vana.org",
              ],
            },
          },
        },
      });

      console.log(
        `[NonceManager] Burn nonce ${nonceToBurn} transaction sent: ${burnTx}`,
      );

      return burnTx;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // Check for common errors that indicate nonce was already used
      if (
        errorMessage.includes("nonce too low") ||
        errorMessage.includes("underpriced") ||
        errorMessage.includes("already known")
      ) {
        console.log(`[NonceManager] Nonce ${nonceToBurn} was already used`);
      } else {
        console.error(
          `[NonceManager] Error burning nonce ${nonceToBurn}:`,
          error,
        );
      }

      throw error;
    }
  }
}
