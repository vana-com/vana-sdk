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
import { getRpcEndpoint } from '../utils/rpc-distribution.js';

export interface FundingResult {
  success: boolean;
  txHash?: string;
  balanceBefore: bigint;
  balanceAfter: bigint;
  amountSent: bigint;
  error?: string;
}

/**
 * Dynamic gas configuration for load testing
 * Supports premium gas pricing for faster confirmation under load
 */
export class GasConfiguration {
  private config: LoadTestConfig;
  
  constructor(config: LoadTestConfig) {
    this.config = config;
  }
  
  /**
   * Get current network gas price with premium multiplier
   */
  async getPremiumGasPrice(publicClient: any): Promise<bigint> {
    try {
      // Get current network gas price
      const baseGasPrice = await publicClient.getGasPrice();
      
      // Apply premium multiplier for load testing
      const premiumGasPrice = BigInt(Math.floor(Number(baseGasPrice) * this.config.premiumGasMultiplier));
      
      // Cap at maximum gas price (convert gwei string to wei)
      const maxGasPriceWei = BigInt(this.config.maxGasPrice) * 1_000_000_000n; // Convert gwei to wei
      
      // For funding calculations, we need to use the HIGHER of premium or max gas
      // because the gas monkey-patch will use up to maxGasPrice for transactions
      // This ensures we fund enough even when network gas is extremely low
      return premiumGasPrice > maxGasPriceWei ? premiumGasPrice : maxGasPriceWei;
    } catch (error) {
      console.warn(`Failed to get network gas price, using default: ${error}`);
      // Fallback to default premium gas price
      return BigInt(Math.floor(20000000000 * this.config.premiumGasMultiplier)); // 20 gwei * multiplier
    }
  }
  
  /**
   * Get gas limit for transactions
   */
  getGasLimit(): bigint {
    return BigInt(this.config.gasLimit);
  }
  
  /**
   * Calculate funding amount based on premium gas costs
   * SIMPLIFIED: Just use maxGasPrice * gasLimit * 3 (for safety)
   */
  async getFundingAmount(publicClient: any): Promise<bigint> {
    // Simple calculation: maxGasPrice * gasLimit * 3 transactions
    // This ensures we always have enough, even if slightly overpaying
    const maxGasPriceWei = BigInt(this.config.maxGasPrice) * 1_000_000_000n;
    const gasLimit = this.getGasLimit();
    
    // Fund for 3 transactions worth (funding tx + main tx + buffer)
    const fundingAmount = maxGasPriceWei * gasLimit * 3n;
    
    // Minimum 0.2 VANA for safety
    const minAmount = parseEther('0.2');
    const finalAmount = fundingAmount > minAmount ? fundingAmount : minAmount;
    
    if (this.config.enableDebugLogs) {
      console.log(`[GasConfig] Simple funding calculation:
        Max Gas Price: ${this.config.maxGasPrice} gwei
        Gas Limit: ${gasLimit}
        Funding for 3 txs: ${formatEther(fundingAmount)} VANA
        Final Amount: ${formatEther(finalAmount)} VANA`);
    }
    
    return finalAmount;
  }
  
  /**
   * Get minimum balance threshold (50% of funding amount)
   */
  async getMinBalanceThreshold(publicClient: any): Promise<bigint> {
    const fundingAmount = await this.getFundingAmount(publicClient);
    return fundingAmount / 2n;
  }
}

/**
 * Legacy gas costs for backward compatibility
 * @deprecated Use GasConfiguration class instead
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
  FUNDING_AMOUNT: parseEther('0.2'), // Increased to 0.2 VANA per wallet
  // Minimum balance threshold to trigger funding
  MIN_BALANCE_THRESHOLD: parseEther('0.1'), // Increased to 0.1 VANA
};

/**
 * Wallet funding utility class
 */
export class WalletFunder {
  private relayerClient: any;
  private publicClient: any;
  private config: LoadTestConfig;
  private gasConfig: GasConfiguration;

  constructor(config: LoadTestConfig) {
    this.config = config;
    this.gasConfig = new GasConfiguration(config);
    
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
    
    // Use a random RPC endpoint for the relayer
    const rpcEndpoint = getRpcEndpoint(config);

    this.publicClient = createPublicClient({
      chain: mokshaTestnet,
      transport: http(rpcEndpoint),
    });

    this.relayerClient = createWalletClient({
      chain: mokshaTestnet,
      transport: http(rpcEndpoint),
      account: relayerAccount,
    });
    
    if (config.enableDebugLogs) {
      console.log(`[WalletFunder] Using RPC: ${rpcEndpoint}`);
    }

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
   * Check if wallet needs funding using dynamic gas configuration
   */
  async needsFunding(address: string): Promise<boolean> {
    const balance = await this.getBalance(address);
    const threshold = await this.gasConfig.getMinBalanceThreshold(this.publicClient);
    return balance < threshold;
  }

  /**
   * Fund a single wallet
   */
  async fundWallet(targetAddress: string): Promise<FundingResult> {
    try {
      const balanceBefore = await this.getBalance(targetAddress);
      
      // Get dynamic funding amounts based on current gas prices
      const fundingAmount = await this.gasConfig.getFundingAmount(this.publicClient);
      const minThreshold = await this.gasConfig.getMinBalanceThreshold(this.publicClient);
      
      // Check if funding is needed
      if (balanceBefore >= minThreshold) {
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
      if (relayerBalance < fundingAmount * 2n) {
        throw new Error(`Relayer has insufficient balance: ${formatEther(relayerBalance)} VANA. Need at least ${formatEther(fundingAmount * 2n)} VANA`);
      }

      // Get premium gas price for funding transaction
      const gasPrice = await this.gasConfig.getPremiumGasPrice(this.publicClient);

      if (this.config.enableDebugLogs) {
        console.log(`[WalletFunder] Funding ${targetAddress} with ${formatEther(fundingAmount)} VANA`);
        console.log(`[WalletFunder] Current balance: ${formatEther(balanceBefore)} VANA`);
        console.log(`[WalletFunder] Relayer balance: ${formatEther(relayerBalance)} VANA`);
        console.log(`[WalletFunder] Using premium gas price: ${formatEther(gasPrice)} VANA (${Number(gasPrice) / 1e9} gwei)`);
      }

      // Send funding transaction with premium gas
      const txHash = await this.relayerClient.sendTransaction({
        to: targetAddress as `0x${string}`,
        value: fundingAmount,
        gasPrice: gasPrice,
        gas: 21000n, // Standard ETH transfer gas limit
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
        amountSent: fundingAmount,
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
