import { getContract } from "viem";
import { PublicClient, WalletClient } from "viem";
import { getContractAddress } from "../../config/addresses";
import { getAbi } from "../../generated/abi";
import { SchemaMetadata } from "../../types/index";

/**
 * Shared context for blockchain operations.
 * Only includes the minimal required fields to avoid coupling.
 */
interface BlockchainContext {
  walletClient: WalletClient;
  publicClient: PublicClient;
}

/**
 * Contract data structure returned by the blockchain.
 *
 * @internal
 */
interface SchemaContractData {
  name: string;
  dialect: string;
  definitionUrl: string;
}

/**
 * Fetches schema metadata from the blockchain by its ID.
 *
 * @param context - The blockchain context containing wallet and public clients
 * @param schemaId - The ID of the schema to fetch
 * @returns The schema metadata with id, name, dialect, and definitionUrl
 * @throws Error if chain ID is not available, schema not found, or data is incomplete
 *
 * @internal
 */
export async function fetchSchemaFromChain(
  context: BlockchainContext,
  schemaId: number,
): Promise<SchemaMetadata> {
  const chainId = context.walletClient.chain?.id;
  if (!chainId) {
    throw new Error("Chain ID not available");
  }

  const dataRefinerRegistryAddress = getContractAddress(
    chainId,
    "DataRefinerRegistry",
  );
  const dataRefinerRegistryAbi = getAbi("DataRefinerRegistry");

  const dataRefinerRegistry = getContract({
    address: dataRefinerRegistryAddress,
    abi: dataRefinerRegistryAbi,
    client: context.publicClient,
  });

  const schemaData = await dataRefinerRegistry.read.schemas([BigInt(schemaId)]);

  if (!schemaData) {
    throw new Error(`Schema with ID ${schemaId} not found`);
  }

  // TODO(TYPES): Contract read returns unknown type from viem library.
  // Future improvement: Create typed contract interface when viem adds support
  // or implement a contract type generator from ABI definitions.
  const schemaObj = schemaData as unknown as SchemaContractData;

  if (!schemaObj.name || !schemaObj.dialect || !schemaObj.definitionUrl) {
    throw new Error("Incomplete schema data");
  }

  return {
    id: schemaId,
    name: schemaObj.name,
    dialect: schemaObj.dialect as "json" | "sqlite",
    definitionUrl: schemaObj.definitionUrl,
  };
}

/**
 * Fetches the total count of schemas from the blockchain.
 *
 * @param context - The blockchain context containing wallet and public clients
 * @returns The total number of schemas
 * @throws Error if chain ID is not available or operation fails
 *
 * @internal
 */
export async function fetchSchemaCountFromChain(
  context: BlockchainContext,
): Promise<number> {
  const chainId = context.walletClient.chain?.id;
  if (!chainId) {
    throw new Error("Chain ID not available");
  }

  const dataRefinerRegistryAddress = getContractAddress(
    chainId,
    "DataRefinerRegistry",
  );
  const dataRefinerRegistryAbi = getAbi("DataRefinerRegistry");

  const dataRefinerRegistry = getContract({
    address: dataRefinerRegistryAddress,
    abi: dataRefinerRegistryAbi,
    client: context.publicClient,
  });

  const count = await dataRefinerRegistry.read.schemasCount();
  return Number(count);
}
