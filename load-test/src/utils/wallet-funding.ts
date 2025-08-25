/**
 * Wallet Funding Utilities for Load Testing
 * 
 * Provides automatic funding of test wallets from a relayer wallet
 * to ensure sufficient balance for blockchain transactions.
 */

import { createPublicClient, createWalletClient, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mokshaTestnet } from '@opendatalabs/vana-sdk/chains';
import type { LoadTestConfig } from '../config/types.js';

export interface FundingResult {
  success: boolean;
  txHash?: string;
  balanceBefore: bigint;
  balanceAfter: bigint;
  amountSent: bigint;
  error?: string;
}

/**
 * Estimates gas cost for addServerFilesAndPermissions transaction
 * Based on observed transaction data from load testing
 */
export const ESTIMATED_GAS_COSTS = {
  // Gas limit for addServerFilesAndPermissions (observed ~500k gas)
  GAS_LIMIT: 600000n,
  // Gas price on Moksha (typically 20 gwei)
  GAS_PRICE: 20000000000n, // 20 gwei
  // Total estimated cost per transaction
  get ESTIMATED_COST() {
    return this.GAS_LIMIT * this.GAS_PRICE;
  },
  // Funding amount per wallet (enough for multiple transactions)
  FUNDING_AMOUNT: parseEther('0.1'), // 0.1 VANA per wallet
  // Minimum balance threshold to trigger funding
  MIN_BALANCE_THRESHOLD: parseEther('0.05'), // 0.05 VANA
};

/**
 * Wallet funding utility class
 */
export class WalletFunder {
  private relayerClient: any;
  private publicClient: any;
  private config: LoadTestConfig;

  constructor(config: LoadTestConfig) {
    this.config = config;
    
    if (!config.relayerPrivateKey) {
      throw new Error('RELAYER_PRIVATE_KEY is required for wallet funding');
    }

    // Format relayer private key
    let formattedPrivateKey: `0x${string}`;
    if (config.relayerPrivateKey.startsWith('0x')) {
      formattedPrivateKey = config.relayerPrivateKey as `0x${string}`;
    } else {
      formattedPrivateKey = `0x${config.relayerPrivateKey}` as `0x${string}`;
    }

    if (formattedPrivateKey.length !== 66) {
      throw new Error(`Invalid RELAYER_PRIVATE_KEY length: expected 66 characters (0x + 64 hex), got ${formattedPrivateKey.length}`);
    }

    const relayerAccount = privateKeyToAccount(formattedPrivateKey);

    this.publicClient = createPublicClient({
      chain: mokshaTestnet,
      transport: http(config.rpcEndpoint),
    });

    this.relayerClient = createWalletClient({
      chain: mokshaTestnet,
      transport: http(config.rpcEndpoint),
      account: relayerAccount,
    });

    if (config.enableDebugLogs) {
      console.log(`[WalletFunder] Initialized with relayer: ${relayerAccount.address}`);
    }
  }

  /**
   * Get wallet balance
   */
  async getBalance(address: string): Promise<bigint> {
    return await this.publicClient.getBalance({
      address: address as `0x${string}`,
    });
  }

  /**
   * Get relayer balance
   */
  async getRelayerBalance(): Promise<bigint> {
    return await this.getBalance(this.relayerClient.account.address);
  }

  /**
   * Check if wallet needs funding
   */
  async needsFunding(address: string): Promise<boolean> {
    const balance = await this.getBalance(address);
    return balance < ESTIMATED_GAS_COSTS.MIN_BALANCE_THRESHOLD;
  }

  /**
   * Fund a single wallet
   */
  async fundWallet(targetAddress: string): Promise<FundingResult> {
    try {
      const balanceBefore = await this.getBalance(targetAddress);
      
      // Check if funding is needed
      if (balanceBefore >= ESTIMATED_GAS_COSTS.MIN_BALANCE_THRESHOLD) {
        if (this.config.enableDebugLogs) {
          console.log(`[WalletFunder] Wallet ${targetAddress} has sufficient balance: ${formatEther(balanceBefore)} VANA`);
        }
        return {
          success: true,
          balanceBefore,
          balanceAfter: balanceBefore,
          amountSent: 0n,
        };
      }

      // Check relayer balance
      const relayerBalance = await this.getRelayerBalance();
      if (relayerBalance < ESTIMATED_GAS_COSTS.FUNDING_AMOUNT * 2n) {
        throw new Error(`Relayer has insufficient balance: ${formatEther(relayerBalance)} VANA. Need at least ${formatEther(ESTIMATED_GAS_COSTS.FUNDING_AMOUNT * 2n)} VANA`);
      }

      if (this.config.enableDebugLogs) {
        console.log(`[WalletFunder] Funding ${targetAddress} with ${formatEther(ESTIMATED_GAS_COSTS.FUNDING_AMOUNT)} VANA`);
        console.log(`[WalletFunder] Current balance: ${formatEther(balanceBefore)} VANA`);
        console.log(`[WalletFunder] Relayer balance: ${formatEther(relayerBalance)} VANA`);
      }

      // Send funding transaction
      const txHash = await this.relayerClient.sendTransaction({
        to: targetAddress as `0x${string}`,
        value: ESTIMATED_GAS_COSTS.FUNDING_AMOUNT,
      });

      // Wait for confirmation
      await this.publicClient.waitForTransactionReceipt({ hash: txHash });

      const balanceAfter = await this.getBalance(targetAddress);

      if (this.config.enableDebugLogs) {
        console.log(`[WalletFunder] ✅ Funded ${targetAddress}`);
        console.log(`[WalletFunder] Transaction: ${txHash}`);
        console.log(`[WalletFunder] New balance: ${formatEther(balanceAfter)} VANA`);
      }

      return {
        success: true,
        txHash,
        balanceBefore,
        balanceAfter,
        amountSent: ESTIMATED_GAS_COSTS.FUNDING_AMOUNT,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (this.config.enableDebugLogs) {
        console.error(`[WalletFunder] ❌ Failed to fund ${targetAddress}: ${errorMessage}`);
      }

      return {
        success: false,
        balanceBefore: 0n,
        balanceAfter: 0n,
        amountSent: 0n,
        error: errorMessage,
      };
    }
  }

  /**
   * Fund multiple wallets sequentially to avoid nonce collisions
   */
  async fundWallets(addresses: string[]): Promise<FundingResult[]> {
    if (this.config.enableDebugLogs) {
      console.log(`[WalletFunder] Funding ${addresses.length} wallets sequentially to avoid nonce collisions...`);
    }

    const results: FundingResult[] = [];
    
    // Fund sequentially to avoid nonce collisions
    for (let i = 0; i < addresses.length; i++) {
      const address = addresses[i];
      if (this.config.enableDebugLogs) {
        console.log(`[WalletFunder] Funding wallet ${i + 1}/${addresses.length}: ${address}`);
      }
      
      const result = await this.fundWallet(address);
      results.push(result);
      
      // Small delay between transactions to ensure nonce ordering
      if (i < addresses.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    if (this.config.enableDebugLogs) {
      console.log(`[WalletFunder] Funding complete: ${successful} successful, ${failed} failed`);
      if (failed > 0) {
        const errors = results.filter(r => !r.success).map(r => r.error);
        console.error(`[WalletFunder] Funding errors:`, errors);
      }
    }

    return results;
  }

  /**
   * Get funding statistics
   */
  async getFundingStats(): Promise<{
    relayerBalance: bigint;
    estimatedTransactionsRemaining: bigint;
    costPerTransaction: bigint;
    fundingAmountPerWallet: bigint;
  }> {
    const relayerBalance = await this.getRelayerBalance();
    
    return {
      relayerBalance,
      estimatedTransactionsRemaining: relayerBalance / ESTIMATED_GAS_COSTS.ESTIMATED_COST,
      costPerTransaction: ESTIMATED_GAS_COSTS.ESTIMATED_COST,
      fundingAmountPerWallet: ESTIMATED_GAS_COSTS.FUNDING_AMOUNT,
    };
  }
}
