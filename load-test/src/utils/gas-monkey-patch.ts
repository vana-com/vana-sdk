import type { WalletClient } from 'viem';
import { parseEther } from 'viem';
import type { LoadTestConfig } from '../config/types.js';

/**
 * Monkey-patches a viem WalletClient to use premium gas prices for all transactions.
 * This is a workaround for the SDK not accepting gas parameters.
 * 
 * @param walletClient - The viem wallet client to patch
 * @param config - Load test configuration with gas settings
 * @returns The patched wallet client
 */
export function patchWalletClientForPremiumGas(
  walletClient: WalletClient,
  config: LoadTestConfig
): WalletClient {
  console.log(`[GAS] Initializing gas monkey-patch with ${config.premiumGasMultiplier}x multiplier, max ${config.maxGasPrice} gwei`);
  
  // Store original methods
  const originalWriteContract = walletClient.writeContract?.bind(walletClient);
  const originalSendTransaction = walletClient.sendTransaction?.bind(walletClient);
  
  // Function to get gas price directly from the client
  const getGasPrice = async (): Promise<bigint> => {
    try {
      // @ts-ignore - accessing internal transport
      const result = await walletClient.transport.request({
        method: 'eth_gasPrice',
      });
      
      // Ensure proper conversion to BigInt (result might be hex string)
      const gasPrice = typeof result === 'string' 
        ? BigInt(result)
        : BigInt(String(result));
        
      // Sanity check - if gas price is less than 1 gwei, something's wrong
      if (gasPrice < 1_000_000_000n) {
        console.warn(`[GAS] Suspiciously low gas price from RPC: ${gasPrice} wei`);
        return 20_000_000_000n; // Use 20 gwei fallback
      }
      
      return gasPrice;
    } catch (error) {
      console.warn(`[GAS] Failed to get gas price: ${error}`);
      return 20_000_000_000n; // 20 gwei fallback
    }
  };

  // Calculate premium gas prices
  const getPremiumGasPrice = async (): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> => {
    try {
      // Get current base gas price
      const baseGasPrice = await getGasPrice();
      
      // Debug log the raw gas price
      if (config.enableDebugLogs) {
        console.log(`[GAS] Raw base gas from RPC: ${baseGasPrice} wei (${Number(baseGasPrice) / 1e9} gwei)`);
      }
      
      // Ensure we have a valid gas price
      if (!baseGasPrice || baseGasPrice === 0n) {
        throw new Error('Invalid base gas price from RPC');
      }
      
      // Apply premium multiplier
      const premiumGasPrice = BigInt(Math.floor(Number(baseGasPrice) * config.premiumGasMultiplier));
      
      // Cap at maximum gas price (convert gwei string to wei)
      const maxGasPriceWei = BigInt(config.maxGasPrice) * 1_000_000_000n; // Convert gwei to wei
      const maxFeePerGas = premiumGasPrice > maxGasPriceWei ? maxGasPriceWei : premiumGasPrice;
      
      // Priority fee is typically 10% of max fee, but at least 1 gwei
      const maxPriorityFeePerGas = maxFeePerGas / 10n || 1_000_000_000n;
      
      if (config.enableDebugLogs) {
        console.log(`[GAS] Base: ${Number(baseGasPrice) / 1e9} gwei, Premium: ${Number(maxFeePerGas) / 1e9} gwei (${config.premiumGasMultiplier}x)`);
      }
      
      return { maxFeePerGas, maxPriorityFeePerGas };
    } catch (error) {
      console.warn(`[GAS] Failed to get gas price from RPC, using fallback: ${error}`);
      // Fallback to hardcoded premium values
      const fallbackGasPrice = BigInt(Math.floor(20_000_000_000 * config.premiumGasMultiplier)); // 20 gwei * multiplier
      const maxGasPriceWei = BigInt(config.maxGasPrice) * 1_000_000_000n;
      const maxFeePerGas = fallbackGasPrice > maxGasPriceWei ? maxGasPriceWei : fallbackGasPrice;
      
      return {
        maxFeePerGas: maxFeePerGas,
        maxPriorityFeePerGas: maxFeePerGas / 10n || 1_000_000_000n,
      };
    }
  };

  // Patch writeContract to include premium gas
  if (originalWriteContract) {
    walletClient.writeContract = async (args: any) => {
      try {
        const gasParams = await getPremiumGasPrice();
        
        // ALWAYS override gas params with our premium values
        // The SDK might pass very low values that would cause transactions to get stuck
        const enhancedArgs = {
          ...args,
          maxFeePerGas: gasParams.maxFeePerGas,
          maxPriorityFeePerGas: gasParams.maxPriorityFeePerGas,
          // Remove legacy gasPrice if using EIP-1559
          gasPrice: undefined,
        };
        
        // Log if we're overriding existing values
        if (args.maxFeePerGas && args.maxFeePerGas !== gasParams.maxFeePerGas) {
          console.log(`[GAS] Overriding SDK gas: ${Number(args.maxFeePerGas) / 1e9} gwei → ${Number(gasParams.maxFeePerGas) / 1e9} gwei`);
        }
        
        if (config.enableDebugLogs || !args.maxFeePerGas) {
          console.log(`[GAS] Premium gas applied: ${Number(enhancedArgs.maxFeePerGas) / 1e9} gwei (max), ${Number(enhancedArgs.maxPriorityFeePerGas) / 1e9} gwei (priority)`);
        }
        
        return originalWriteContract(enhancedArgs);
      } catch (error) {
        console.error(`[GAS] Error in writeContract patch:`, error);
        // Fall back to original behavior
        return originalWriteContract(args);
      }
    };
  } else {
    console.warn('[GAS] walletClient.writeContract not found - gas monkey-patch not applied');
  }

  // Also patch sendTransaction if it exists
  if (originalSendTransaction) {
    walletClient.sendTransaction = async (args: any) => {
      const gasParams = await getPremiumGasPrice();
      
      const enhancedArgs = {
        ...args,
        maxFeePerGas: args.maxFeePerGas || gasParams.maxFeePerGas,
        maxPriorityFeePerGas: args.maxPriorityFeePerGas || gasParams.maxPriorityFeePerGas,
        gasPrice: undefined,
      };
      
      return originalSendTransaction!(enhancedArgs);
    };
  }

  return walletClient;
}

/**
 * Logs current network gas prices for debugging
 */
export async function logNetworkGasInfo(walletClient: WalletClient): Promise<void> {
  try {
    // Get gas price and block info directly from transport
    // @ts-ignore - accessing internal transport
    const gasPrice = BigInt(await walletClient.transport.request({
      method: 'eth_gasPrice',
    }));
    
    // @ts-ignore - accessing internal transport  
    const block = await walletClient.transport.request({
      method: 'eth_getBlockByNumber',
      params: ['latest', false]
    }) as any;
    
    console.log(`\n📊 Network Gas Info:`);
    console.log(`   Current gas price: ${Number(gasPrice) / 1e9} gwei`);
    if (block) {
      console.log(`   Block number: ${block.number}`);
      if (block.gasUsed && block.gasLimit) {
        console.log(`   Block gas used: ${((Number(block.gasUsed) / Number(block.gasLimit)) * 100).toFixed(1)}%`);
      }
    }
    
    // If EIP-1559 block
    if (block && block.baseFeePerGas) {
      console.log(`   Base fee: ${Number(block.baseFeePerGas) / 1e9} gwei`);
    }
    console.log('');
  } catch (error) {
    console.warn(`Could not fetch network gas info: ${error}`);
  }
}
