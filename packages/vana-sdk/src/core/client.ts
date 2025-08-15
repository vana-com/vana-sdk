import {
  Chain,
  createPublicClient,
  http,
  Account,
  createWalletClient as viemCreateWalletClient,
  PublicClient,
  WalletClient,
} from "viem";
import { chains, mokshaTestnet } from "../config/chains";

/**
 * Default starting block numbers for querying blockchain events and data per chain.
 *
 * @remarks
 * These block numbers represent the earliest deployment of Vana protocol contracts
 * on each network. Using these as starting points for event queries significantly
 * improves performance by avoiding unnecessary queries of blocks before the
 * protocol existed.
 *
 * - Moksha Testnet (14800): Block 732312 - DataRegistry deployment
 * - Vana Mainnet (1480): Block 758584 - DataRegistry deployment
 *
 * @category Blockchain
 */
export const defaultFromBlocks: Record<number, bigint> = {
  14800: BigInt(732312), // Moksha Testnet - earliest contract deployment
  1480: BigInt(758584), // Vana Mainnet - earliest contract deployment
};

/**
 * Gets the default starting block for a specific chain.
 *
 * @param chainId - The chain ID to get the default from block for
 * @returns The default starting block for the chain, or 0n if not configured
 * @category Blockchain
 */
export function getDefaultFromBlock(chainId: number): bigint {
  return defaultFromBlocks[chainId] || BigInt(0);
}

// Cache for clients
let _client: PublicClient & { chain: Chain };

/**
 * Creates or retrieves a cached public client for blockchain read operations.
 *
 * @remarks
 * This function provides an optimized way to access blockchain data by maintaining
 * a cached client instance per chain. The client is used for reading contract state,
 * querying events, and other read-only blockchain operations. It automatically
 * handles HTTP transport configuration and chain switching.
 *
 * @param chainId - The chain ID to connect to (defaults to Moksha testnet)
 * @returns A public client configured for the specified chain with caching optimization
 * @throws {Error} When the specified chain ID is not supported by the SDK
 * @example
 * ```typescript
 * // Get client for default chain (Moksha testnet)
 * const client = createClient();
 *
 * // Get client for specific chain
 * const mainnetClient = createClient(14800);
 *
 * // Use client for blockchain reads
 * const blockNumber = await client.getBlockNumber();
 * ```
 * @category Blockchain
 */
export const createClient = (
  chainId: keyof typeof chains = mokshaTestnet.id,
): PublicClient & { chain: Chain } => {
  if (!_client || _client.chain?.id !== chainId) {
    const chain = chains[chainId];
    if (!chain) {
      throw new Error(`Chain ${chainId} not found`);
    }

    _client = createPublicClient({
      chain,
      transport: http(),
    });
  }

  return _client;
};

/**
 * Creates a wallet client for blockchain transaction signing and submission.
 *
 * @remarks
 * This function creates a wallet client configured for transaction signing and
 * submission on the specified chain. Unlike the public client, wallet clients
 * are not cached and require an account for transaction signing. The client
 * handles HTTP transport configuration and provides access to wallet-specific
 * operations like signing transactions and messages.
 *
 * @param chainId - The chain ID to connect to (defaults to Moksha testnet)
 * @param account - Optional account for transaction signing (can be set later)
 * @returns A wallet client configured for the specified chain
 * @throws {Error} When the specified chain ID is not supported by the SDK
 * @example
 * ```typescript
 * import { privateKeyToAccount } from 'viem/accounts';
 *
 * // Create wallet client for default chain
 * const account = privateKeyToAccount('0x...');
 * const walletClient = createWalletClient(mokshaTestnet.id, account);
 *
 * // Use for transaction signing
 * const txHash = await walletClient.writeContract({
 *   address: contractAddress,
 *   abi: contractAbi,
 *   functionName: 'someFunction',
 *   args: []
 * });
 *
 * // Create without account (account can be set later)
 * const client = createWalletClient();
 * ```
 * @category Blockchain
 */
export const createWalletClient = (
  chainId: keyof typeof chains = mokshaTestnet.id,
  account?: Account,
): WalletClient => {
  const chain = chains[chainId];
  if (!chain) {
    throw new Error(`Chain ${chainId} not found`);
  }

  return viemCreateWalletClient({
    chain,
    transport: http(),
    account,
  });
};
