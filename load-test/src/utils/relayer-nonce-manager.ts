/**
 * Nonce Manager for Relayer Wallet
 * 
 * Ensures sequential nonce assignment for transactions sent through a single relayer wallet.
 * Prevents nonce conflicts and handles recovery from nonce-related errors.
 */

import { createPublicClient, http, type PublicClient, type Address } from 'viem';
import { mokshaTestnet } from '@opendatalabs/vana-sdk/chains';
import chalk from 'chalk';

export interface NonceReservation {
  nonce: number;
  userId: string;
  timestamp: number;
  status: 'reserved' | 'pending' | 'confirmed' | 'failed';
  txHash?: string;
  retryCount?: number;
}

export class RelayerNonceManager {
  private relayerAddress: Address;
  private publicClient: PublicClient;
  private currentNonce: number = -1;
  private nextNonce: number = -1;
  private nonceReservations: Map<number, NonceReservation> = new Map();
  private pendingNonces: Set<number> = new Set();
  private nonceQueue: Array<{ userId: string; resolve: (nonce: number) => void; reject: (error: Error) => void }> = [];
  private isInitialized: boolean = false;
  private lastConfirmedNonce: number = -1;
  private nonceGapTimeout: number = 30000; // 30 seconds timeout for gaps
  private enableDebugLogs: boolean;
  private syncLock: boolean = false;

  constructor(
    relayerAddress: Address,
    rpcEndpoint: string,
    enableDebugLogs: boolean = false
  ) {
    this.relayerAddress = relayerAddress;
    this.enableDebugLogs = enableDebugLogs;
    
    this.publicClient = createPublicClient({
      chain: mokshaTestnet,
      transport: http(rpcEndpoint),
    });

    if (this.enableDebugLogs) {
      console.log(chalk.cyan(`[NonceManager] Initialized for relayer: ${relayerAddress}`));
    }
  }

  /**
   * Initialize the nonce manager by fetching current on-chain nonce
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Get current on-chain nonce
      const onChainNonce = await this.publicClient.getTransactionCount({
        address: this.relayerAddress,
        blockTag: 'pending', // Include pending transactions
      });

      this.currentNonce = Number(onChainNonce);
      this.nextNonce = this.currentNonce;
      this.lastConfirmedNonce = this.currentNonce - 1;
      this.isInitialized = true;

      if (this.enableDebugLogs) {
        console.log(chalk.green(`[NonceManager] Initialized with nonce: ${this.currentNonce}`));
      }

      // Start periodic sync
      this.startPeriodicSync();
    } catch (error) {
      console.error(chalk.red(`[NonceManager] Failed to initialize:`, error));
      throw error;
    }
  }

  /**
   * Reserve the next available nonce for a transaction
   */
  async reserveNonce(userId: string): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      // Add to queue
      this.nonceQueue.push({ userId, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Process the nonce reservation queue
   */
  private async processQueue(): Promise<void> {
    if (this.nonceQueue.length === 0) return;

    const request = this.nonceQueue.shift();
    if (!request) return;

    const nonce = this.nextNonce;
    this.nextNonce++;

    const reservation: NonceReservation = {
      nonce,
      userId: request.userId,
      timestamp: Date.now(),
      status: 'reserved',
      retryCount: 0,
    };

    this.nonceReservations.set(nonce, reservation);
    this.pendingNonces.add(nonce);

    if (this.enableDebugLogs) {
      console.log(chalk.blue(`[NonceManager] Reserved nonce ${nonce} for ${request.userId}`));
    }

    request.resolve(nonce);

    // Process next in queue if any
    if (this.nonceQueue.length > 0) {
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * Mark a nonce as used with transaction hash
   */
  markNoncePending(nonce: number, txHash: string): void {
    const reservation = this.nonceReservations.get(nonce);
    if (reservation) {
      reservation.status = 'pending';
      reservation.txHash = txHash;
      
      if (this.enableDebugLogs) {
        console.log(chalk.yellow(`[NonceManager] Nonce ${nonce} pending with tx: ${txHash}`));
      }
    }
  }

  /**
   * Mark a nonce as confirmed
   */
  markNonceConfirmed(nonce: number): void {
    const reservation = this.nonceReservations.get(nonce);
    if (reservation) {
      reservation.status = 'confirmed';
      this.pendingNonces.delete(nonce);
      
      // Update last confirmed nonce if this is sequential
      if (nonce === this.lastConfirmedNonce + 1) {
        this.lastConfirmedNonce = nonce;
        // Check for more sequential confirmations
        this.updateLastConfirmed();
      }

      if (this.enableDebugLogs) {
        console.log(chalk.green(`[NonceManager] Nonce ${nonce} confirmed`));
      }
    }
  }

  /**
   * Mark a nonce as failed and handle recovery
   */
  async markNonceFailed(nonce: number, error: string): Promise<number | null> {
    const reservation = this.nonceReservations.get(nonce);
    if (!reservation) return null;

    reservation.status = 'failed';
    reservation.retryCount = (reservation.retryCount || 0) + 1;

    if (this.enableDebugLogs) {
      console.log(chalk.red(`[NonceManager] Nonce ${nonce} failed: ${error}`));
    }

    // Check if it's a nonce error or underpriced error
    const errorLower = error.toLowerCase();
    const isNonceError = errorLower.includes('nonce') || 
                        errorLower.includes('replacement') || 
                        errorLower.includes('underpriced') ||
                        errorLower.includes('already known');
    
    if (isNonceError) {
      // For underpriced errors, the transaction with this nonce exists in mempool
      // We need to skip this nonce and use a fresh one
      if (errorLower.includes('underpriced')) {
        if (this.enableDebugLogs) {
          console.log(chalk.yellow(`[NonceManager] Underpriced error for nonce ${nonce}, skipping to new nonce`));
        }
        // Mark this nonce as permanently failed (don't reuse)
        this.pendingNonces.delete(nonce);
      }
      
      // Resync with chain to ensure we have the latest state
      await this.syncWithChain();
      
      // Reserve new nonce for retry
      if (reservation.retryCount <= 3) {
        const newNonce = await this.reserveNonce(reservation.userId);
        if (this.enableDebugLogs) {
          console.log(chalk.yellow(`[NonceManager] Retry with new nonce ${newNonce} for ${reservation.userId} (was ${nonce})`));
        }
        return newNonce;
      }
    }

    this.pendingNonces.delete(nonce);
    return null;
  }

  /**
   * Update the last confirmed nonce by checking sequential confirmations
   */
  private updateLastConfirmed(): void {
    let checkNonce = this.lastConfirmedNonce + 1;
    while (true) {
      const reservation = this.nonceReservations.get(checkNonce);
      if (reservation && reservation.status === 'confirmed') {
        this.lastConfirmedNonce = checkNonce;
        checkNonce++;
      } else {
        break;
      }
    }
  }

  /**
   * Sync nonce with blockchain
   */
  async syncWithChain(): Promise<void> {
    if (this.syncLock) return;
    this.syncLock = true;

    try {
      const onChainNonce = await this.publicClient.getTransactionCount({
        address: this.relayerAddress,
        blockTag: 'pending',
      });

      const onChainNonceNum = Number(onChainNonce);
      
      if (onChainNonceNum > this.currentNonce) {
        if (this.enableDebugLogs) {
          console.log(chalk.yellow(`[NonceManager] Chain nonce (${onChainNonceNum}) ahead of local (${this.currentNonce}), updating...`));
        }
        
        // Mark skipped nonces as confirmed
        for (let n = this.currentNonce; n < onChainNonceNum; n++) {
          if (this.pendingNonces.has(n)) {
            this.markNonceConfirmed(n);
          }
        }
        
        this.currentNonce = onChainNonceNum;
        this.nextNonce = Math.max(this.nextNonce, onChainNonceNum);
      }
    } catch (error) {
      console.error(chalk.red(`[NonceManager] Sync failed:`, error));
    } finally {
      this.syncLock = false;
    }
  }

  /**
   * Start periodic synchronization with blockchain
   */
  private startPeriodicSync(): void {
    setInterval(async () => {
      await this.syncWithChain();
      this.cleanupOldReservations();
    }, 10000); // Sync every 10 seconds
  }

  /**
   * Clean up old reservations
   */
  private cleanupOldReservations(): void {
    const now = Date.now();
    const timeout = 60000; // 1 minute

    for (const [nonce, reservation] of this.nonceReservations.entries()) {
      if (now - reservation.timestamp > timeout && reservation.status !== 'confirmed') {
        if (this.enableDebugLogs) {
          console.log(chalk.gray(`[NonceManager] Cleaning up old reservation: nonce ${nonce}`));
        }
        this.nonceReservations.delete(nonce);
        this.pendingNonces.delete(nonce);
      }
    }
  }

  /**
   * Get current status for monitoring
   */
  getStatus(): {
    currentNonce: number;
    nextNonce: number;
    pendingCount: number;
    queueLength: number;
    lastConfirmed: number;
    gaps: number[];
  } {
    // Find gaps in pending nonces
    const gaps: number[] = [];
    for (let n = this.lastConfirmedNonce + 1; n < this.nextNonce; n++) {
      const reservation = this.nonceReservations.get(n);
      if (!reservation || reservation.status === 'failed') {
        gaps.push(n);
      }
    }

    return {
      currentNonce: this.currentNonce,
      nextNonce: this.nextNonce,
      pendingCount: this.pendingNonces.size,
      queueLength: this.nonceQueue.length,
      lastConfirmed: this.lastConfirmedNonce,
      gaps,
    };
  }

  /**
   * Reset the manager (useful for testing)
   */
  async reset(): Promise<void> {
    this.nonceReservations.clear();
    this.pendingNonces.clear();
    this.nonceQueue = [];
    this.isInitialized = false;
    await this.initialize();
  }
}