/**
 * Simple in-memory nonce manager for single-instance deployments.
 *
 * @internal
 * @module
 */

import type { PublicClient, WalletClient, Address, Hash } from "viem";

/**
 * Simple nonce manager for single-instance deployments.
 *
 * @internal
 * @remarks
 * This class provides nonce management for single-instance deployments
 * where distributed coordination is not needed. It keeps track of nonces
 * in memory and syncs with the blockchain's pending count.
 *
 * ⚠️ WARNING: This should ONLY be used for single-instance deployments.
 * Using this with multiple instances will cause nonce conflicts!
 *
 * Key features:
 * - Simple in-memory tracking
 * - Syncs with blockchain pending count
 * - No external dependencies (no Redis needed)
 * - Suitable for hobby projects and development
 */
export class InMemoryNonceManager {
  private readonly publicClient: PublicClient;
  private readonly lastUsedNonces = new Map<string, number>();

  constructor(publicClient: PublicClient) {
    this.publicClient = publicClient;
  }

  /**
   * Assigns the next available nonce for an address.
   *
   * @remarks
   * This method:
   * 1. Gets the pending count from the blockchain
   * 2. Compares with the last used nonce in memory
   * 3. Returns the higher of (pending count, last used + 1)
   *
   * @param address - The address to assign a nonce for
   * @param chainId - The chain ID for the network
   * @returns The assigned nonce (never returns null in single-instance mode)
   */
  async assignNonce(address: Address, chainId: number): Promise<number | null> {
    const key = `${chainId}:${address}`;

    // Get pending transaction count from blockchain
    const pendingCount = await this.publicClient.getTransactionCount({
      address,
      blockTag: "pending",
    });

    // Get last used nonce from memory
    const lastUsed = this.lastUsedNonces.get(key) ?? -1;

    // Calculate next nonce (max of pending count or last used + 1)
    const nextNonce = Math.max(pendingCount, lastUsed + 1);

    // Update memory
    this.lastUsedNonces.set(key, nextNonce);

    console.log(
      `[InMemoryNonceManager] Assigned nonce ${nextNonce} for ${address} on chain ${chainId} (pending: ${pendingCount}, lastUsed: ${lastUsed})`,
    );

    return nextNonce;
  }

  /**
   * Resets the nonce counter for an address.
   *
   * @remarks
   * Clears the in-memory tracking for an address, causing the next
   * assignment to use the blockchain's pending count.
   *
   * @param address - The address to reset
   * @param chainId - The chain ID for the network
   */
  async resetNonce(address: Address, chainId: number): Promise<void> {
    const key = `${chainId}:${address}`;
    this.lastUsedNonces.delete(key);

    console.log(
      `[InMemoryNonceManager] Reset nonce for ${address} on chain ${chainId}`,
    );
  }

  /**
   * Burns a stuck nonce by sending a minimal self-transfer with higher gas.
   *
   * @remarks
   * This is the same implementation as DistributedNonceManager for consistency.
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

      // Bump gas prices by multiplier
      const bump = (x: bigint) =>
        (x * BigInt(Math.floor(gasMultiplier * 100))) / 100n;

      const newMaxFee = bump(fees.maxFeePerGas);
      const newMaxPriorityFee = bump(fees.maxPriorityFeePerGas);

      console.log(
        `[InMemoryNonceManager] Burning stuck nonce ${nonceToBurn} with high gas`,
      );

      // Send minimal self-transfer to burn the nonce
      const burnTx = await walletClient.sendTransaction({
        account: walletClient.account!,
        to: address,
        value: 0n,
        nonce: nonceToBurn,
        gas: 21000n,
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

      console.log(`[InMemoryNonceManager] Burn transaction sent: ${burnTx}`);
      return burnTx;
    } catch (error) {
      console.error(
        `[InMemoryNonceManager] Error burning nonce ${nonceToBurn}:`,
        error,
      );
      throw error;
    }
  }
}
