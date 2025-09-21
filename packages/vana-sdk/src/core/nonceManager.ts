/**
 * Internal distributed nonce manager for atomic transaction nonce assignment.
 *
 * @internal
 * @module
 */

import type { PublicClient, Address } from "viem";
import type { IAtomicStore } from "../types/atomicStore";

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
 * - Distributed locking to prevent race conditions
 * - Syncing with blockchain pending count
 * - Exponential backoff for lock acquisition
 * - Automatic recovery from stuck states
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
   * This method:
   * 1. Acquires a distributed lock to prevent race conditions
   * 2. Queries the blockchain for the current pending nonce
   * 3. Syncs the stored nonce if blockchain is ahead
   * 4. Atomically increments and returns the next nonce
   * 5. Releases the lock
   *
   * @param address - The address to assign a nonce for
   * @param chainId - The chain ID for the network
   * @returns The assigned nonce, or null if lock acquisition fails
   */
  async assignNonce(address: Address, chainId: number): Promise<number | null> {
    const lastUsedKey = `nonce:${chainId}:${address}:lastUsed`;
    const lockKey = `nonce:${chainId}:${address}:lock`;

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
}
