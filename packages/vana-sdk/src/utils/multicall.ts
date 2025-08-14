import type {
  Address,
  PublicClient,
  MulticallParameters,
  MulticallReturnType,
  EncodeFunctionDataParameters,
  Hex,
  Abi,
} from "viem";
import { encodeFunctionData, size } from "viem";
import { getUtilityAddress } from "../config/addresses";
import type { VanaChainId } from "../types";

/**
 * Type for a contract function configuration used in multicall
 */
export interface ContractFunctionConfig {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

/**
 * Configuration options for gas-aware multicall batching.
 *
 * @remarks
 * These options control how the multicall utility splits large batches
 * to stay within gas and calldata limits. The defaults are conservative
 * to ensure compatibility across different chains and RPC providers.
 */
export interface GasAwareMulticallOptions {
  /**
   * Maximum gas per batch. Defaults to 10M (conservative for most chains).
   *
   * @remarks
   * This should be set below the block gas limit of your target chain.
   * Common values:
   * - Vana mainnet: 30M (use 25M for safety)
   * - Vana moksha: 30M (use 25M for safety)
   * - Ethereum mainnet: 30M (use 25M for safety)
   * - Arbitrum: 32M (use 25M for safety)
   */
  maxGasPerBatch?: bigint;

  /**
   * Maximum calldata size per batch in bytes. Defaults to 100KB.
   *
   * @remarks
   * This is particularly important for L2 chains where calldata is expensive.
   * Some RPC providers also have limits on request size.
   */
  maxCalldataBytes?: number;

  /**
   * How often to checkpoint gas estimates. Defaults to every 32 calls or 8KB.
   *
   * @remarks
   * More frequent checkpoints give more accurate batching but require more
   * RPC calls for gas estimation. The default balances accuracy vs performance.
   */
  checkpointFrequency?: {
    /** Checkpoint after this many calls */
    calls: number;
    /** Checkpoint after this many bytes of calldata */
    bytes: number;
  };

  /**
   * Whether to allow partial batch failures. Defaults to false.
   *
   * @remarks
   * When true, individual call failures won't fail the entire batch.
   * This matches viem's multicall behavior with allowFailure option.
   */
  allowFailure?: boolean;

  /**
   * Optional multicall3 contract address override.
   *
   * @remarks
   * By default, uses the standard multicall3 address deployed on most chains:
   * 0xcA11bde05977b3631167028862bE2a173976CA11
   */
  multicallAddress?: Address;

  /**
   * Optional callback for tracking batching progress.
   *
   * @remarks
   * Useful for showing progress in UI or debugging batch performance.
   */
  onProgress?: (completed: number, total: number) => void;
}

/**
 * Internal configuration with defaults applied
 */
interface NormalizedOptions {
  maxGasPerBatch: bigint;
  maxCalldataBytes: number;
  checkpointFrequency: {
    calls: number;
    bytes: number;
  };
  allowFailure: boolean;
  multicallAddress: Address;
  onProgress?: (completed: number, total: number) => void;
}

/**
 * Default configuration values
 */
const DEFAULT_OPTIONS: Omit<NormalizedOptions, "multicallAddress"> = {
  maxGasPerBatch: 10_000_000n, // 10M gas - conservative default
  maxCalldataBytes: 100_000, // 100KB - works with most RPC providers
  checkpointFrequency: {
    calls: 32,
    bytes: 8192, // 8KB
  },
  allowFailure: false,
};

/**
 * A gas-aware multicall function that automatically batches calls to stay within limits.
 *
 * @remarks
 * This function extends viem's multicall with intelligent batching based on:
 * - Actual gas costs (via periodic estimateGas calls)
 * - Calldata size limits
 * - Chain-specific constraints
 *
 * It uses a greedy algorithm with periodic checkpoints to efficiently determine
 * optimal batch sizes without making excessive RPC calls.
 *
 * @param client - The viem public client to use for RPC calls
 * @param parameters - The multicall parameters (same as viem's multicall)
 * @param options - Optional configuration for gas-aware batching
 * @returns The aggregated results from all batches
 *
 * @example
 * ```typescript
 * // Basic usage - drop-in replacement for viem's multicall
 * const results = await gasAwareMulticall(publicClient, {
 *   contracts: [
 *     { address: '0x...', abi: erc20Abi, functionName: 'balanceOf', args: [address1] },
 *     { address: '0x...', abi: erc20Abi, functionName: 'balanceOf', args: [address2] },
 *     // ... hundreds more calls
 *   ]
 * });
 *
 * // With custom limits for a specific chain
 * const results = await gasAwareMulticall(publicClient, {
 *   contracts: calls,
 * }, {
 *   maxGasPerBatch: 25_000_000n, // 25M for mainnet
 *   maxCalldataBytes: 128_000, // 128KB
 *   onProgress: (done, total) => console.log(`Progress: ${done}/${total}`)
 * });
 * ```
 */
export async function gasAwareMulticall<
  TContracts extends readonly ContractFunctionConfig[],
  TAllowFailure extends boolean = false,
>(
  client: PublicClient,
  parameters: MulticallParameters<TContracts, TAllowFailure>,
  options: GasAwareMulticallOptions = {},
): Promise<MulticallReturnType<TContracts, TAllowFailure>> {
  // Get the chain-specific Multicall3 address
  const chainId = await client.getChainId();
  const multicall3Address =
    options.multicallAddress ||
    getUtilityAddress(chainId as VanaChainId, "Multicall3");

  // Normalize options with defaults
  const opts: NormalizedOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
    multicallAddress: multicall3Address,
    checkpointFrequency: {
      ...DEFAULT_OPTIONS.checkpointFrequency,
      ...options.checkpointFrequency,
    },
  };

  // Override allowFailure if specified in parameters
  if (parameters.allowFailure !== undefined) {
    opts.allowFailure = parameters.allowFailure;
  }

  const { contracts } = parameters;
  if (!contracts || contracts.length === 0) {
    return [] as unknown as MulticallReturnType<TContracts, TAllowFailure>;
  }

  // Execute batching algorithm
  const batches = await createBatches(
    client,
    contracts as readonly ContractFunctionConfig[],
    opts,
  );

  // Execute all batches in parallel
  const batchResults = await Promise.all(
    batches.map((batch, index) => {
      // Report progress if callback provided
      if (opts.onProgress && index > 0) {
        const completed = batches
          .slice(0, index)
          .reduce((sum, b) => sum + b.length, 0);
        opts.onProgress(completed, contracts.length);
      }

      // Execute batch using viem's multicall
      return client.multicall({
        ...parameters,
        contracts: batch as typeof contracts,
        multicallAddress: opts.multicallAddress,
        allowFailure: opts.allowFailure,
      });
    }),
  );

  // Report final progress
  if (opts.onProgress) {
    opts.onProgress(contracts.length, contracts.length);
  }

  // Flatten results
  return batchResults.flat() as MulticallReturnType<TContracts, TAllowFailure>;
}

/**
 * Creates optimally-sized batches using greedy algorithm with checkpoints.
 *
 * @param client - The viem public client for making RPC calls
 * @param contracts - Array of contract function configurations to batch
 * @param options - Normalized batching options with limits and settings
 * @returns Array of optimally-sized contract function configuration batches
 */
async function createBatches(
  client: PublicClient,
  contracts: readonly ContractFunctionConfig[],
  options: NormalizedOptions,
): Promise<ContractFunctionConfig[][]> {
  const batches: ContractFunctionConfig[][] = [];
  let currentBatch: ContractFunctionConfig[] = [];
  let currentBytes = 0;
  let lastCheckpointIndex = 0;
  let lastCheckpointBytes = 0;
  let lastEstimatedGas = 0n;

  for (let i = 0; i < contracts.length; i++) {
    const contract = contracts[i];

    // Calculate encoded size for this call
    const encoded = encodeContractCall(contract);
    const callBytes = size(encoded);

    // Check if we need a gas checkpoint
    const callsSinceCheckpoint = i - lastCheckpointIndex;
    const bytesSinceCheckpoint = currentBytes - lastCheckpointBytes;

    const needsCheckpoint =
      callsSinceCheckpoint >= options.checkpointFrequency.calls ||
      bytesSinceCheckpoint >= options.checkpointFrequency.bytes;

    // Perform checkpoint if needed
    if (needsCheckpoint && currentBatch.length > 0) {
      try {
        lastEstimatedGas = await estimateBatchGas(
          client,
          currentBatch,
          options.multicallAddress,
        );
        lastCheckpointIndex = i;
        lastCheckpointBytes = currentBytes;
      } catch (error) {
        // If estimation fails, finalize current batch to be safe
        if (currentBatch.length > 1) {
          // Try with half the batch
          const halfBatch = currentBatch.slice(
            0,
            Math.floor(currentBatch.length / 2),
          );
          batches.push(halfBatch);
          currentBatch = currentBatch.slice(halfBatch.length);
          currentBytes = calculateBatchSize(currentBatch);
          lastCheckpointIndex = i;
          lastCheckpointBytes = currentBytes;
          lastEstimatedGas = 0n;
        } else {
          // Single call failed, skip it or throw based on allowFailure
          if (!options.allowFailure) {
            throw new Error(`Gas estimation failed for call ${i}: ${error}`);
          }
          currentBatch = [];
          currentBytes = 0;
          continue;
        }
      }
    }

    // Check if adding this call would exceed limits
    const wouldExceedCalldata =
      currentBytes + callBytes > options.maxCalldataBytes;
    const wouldExceedGas =
      lastEstimatedGas > 0n &&
      estimateNextGas(lastEstimatedGas, callsSinceCheckpoint + 1) >
        options.maxGasPerBatch;

    // If we would exceed limits, finalize current batch
    if ((wouldExceedCalldata || wouldExceedGas) && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBytes = 0;
      lastCheckpointIndex = i;
      lastCheckpointBytes = 0;
      lastEstimatedGas = 0n;
    }

    // Add call to current batch
    currentBatch.push(contract);
    currentBytes += callBytes;
  }

  // Add final batch if not empty
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

/**
 * Encodes a contract call to measure its calldata size.
 *
 * @param contract - The contract function configuration to encode
 * @returns Hex-encoded function data
 */
function encodeContractCall(contract: ContractFunctionConfig): Hex {
  const { abi, functionName, args } = contract;

  return encodeFunctionData({
    abi,
    functionName,
    args,
  } as EncodeFunctionDataParameters);
}

/**
 * Calculates total encoded size of a batch.
 *
 * @param batch - Array of contract function configurations to measure
 * @returns Total size in bytes of all encoded calls in the batch
 */
function calculateBatchSize(batch: ContractFunctionConfig[]): number {
  return batch.reduce((total, contract) => {
    const encoded = encodeContractCall(contract);
    return total + size(encoded);
  }, 0);
}

/**
 * Estimates gas for a batch of calls via multicall3.
 *
 * @param client - The viem public client for gas estimation
 * @param batch - Array of contract calls to estimate gas for
 * @param multicallAddress - The multicall3 contract address to use
 * @returns Estimated gas cost for executing the batch
 */
async function estimateBatchGas(
  client: PublicClient,
  batch: ContractFunctionConfig[],
  multicallAddress: Address,
): Promise<bigint> {
  // Encode batch as multicall3 aggregate3 call
  const calls = batch.map((contract) => ({
    target: contract.address,
    allowFailure: false,
    callData: encodeContractCall(contract),
  }));

  // Estimate gas for the multicall
  const gas = await client.estimateGas({
    to: multicallAddress,
    data: encodeFunctionData({
      abi: multicall3Abi,
      functionName: "aggregate3",
      args: [calls],
    }),
  });

  return gas;
}

/**
 * Extrapolates gas usage for calls added since last checkpoint.
 *
 * @remarks
 * Uses a conservative 1.1x multiplier for safety to account for gas usage variations.
 *
 * @param lastGas - The gas estimate from the last checkpoint
 * @param callsSinceCheckpoint - Number of calls added since the checkpoint
 * @returns Extrapolated gas estimate with safety margin
 */
function estimateNextGas(
  lastGas: bigint,
  callsSinceCheckpoint: number,
): bigint {
  if (callsSinceCheckpoint === 0) return lastGas;

  // Assume linear scaling with safety factor
  const avgGasPerCall = lastGas / BigInt(Math.max(1, callsSinceCheckpoint - 1));
  const estimatedGas = lastGas + avgGasPerCall;

  // Apply 10% safety margin
  return (estimatedGas * 110n) / 100n;
}

/**
 * Minimal multicall3 ABI for gas estimation
 */
const multicall3Abi = [
  {
    name: "aggregate3",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      {
        name: "returnData",
        type: "tuple[]",
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
      },
    ],
  },
] as const;

/**
 * Utility function to analyze calls and predict optimal batch configuration
 *
 * @remarks
 * This function helps determine the best configuration for a specific set of calls
 * by analyzing their characteristics. Useful for optimizing repeated operations.
 *
 * @param contracts - The calls to analyze
 * @returns Suggested configuration based on call analysis
 */
export function analyzeCallsForOptimalConfig(
  contracts: readonly ContractFunctionConfig[],
): Pick<GasAwareMulticallOptions, "checkpointFrequency" | "maxCalldataBytes"> {
  // Calculate average call size
  const totalBytes = contracts.reduce((sum, contract) => {
    const encoded = encodeContractCall(contract);
    return sum + size(encoded);
  }, 0);

  const avgBytesPerCall = totalBytes / contracts.length;

  // Suggest checkpoint frequency based on call density
  const checkpointFrequency = {
    calls: avgBytesPerCall > 500 ? 16 : 32, // More frequent for large calls
    bytes: avgBytesPerCall > 500 ? 4096 : 8192,
  };

  // Suggest calldata limit based on total size
  // For 1000 calls with small arrays, totalBytes will be much less than 500KB,
  // so use number of contracts as additional signal
  const maxCalldataBytes =
    totalBytes > 50_000 || contracts.length > 500 ? 128_000 : 100_000;

  return {
    checkpointFrequency,
    maxCalldataBytes,
  };
}
