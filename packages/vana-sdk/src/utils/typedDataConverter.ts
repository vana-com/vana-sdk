/**
 * Provides type-safe conversion between Vana and viem typed data formats.
 *
 * @remarks
 * This module bridges the gap between Vana's generic typed data structure
 * and viem's strict TypedDataDefinition format, ensuring compatibility
 * for EIP-712 signature operations.
 *
 * @category Utilities
 * @module typedDataConverter
 */

import type { TypedDataDefinition } from "viem";
import type { GenericTypedData } from "../types/permissions";

/**
 * Converts a GenericTypedData object to a viem-compatible TypedDataDefinition.
 *
 * @remarks
 * Transforms Vana's flexible typed data format into viem's strict format
 * with readonly arrays. This ensures type safety when passing typed data
 * to viem's `signTypedData` method for EIP-712 signatures.
 *
 * @param typedData - The typed data object to convert.
 *   Obtain from permission operations or server responses.
 * @returns A properly typed TypedDataDefinition for use with viem
 *
 * @example
 * ```typescript
 * const vanTypedData: GenericTypedData = {
 *   domain: { name: 'Vana', version: '1', chainId: 14800 },
 *   types: {
 *     Permission: [
 *       { name: 'grantee', type: 'address' },
 *       { name: 'operation', type: 'string' }
 *     ]
 *   },
 *   primaryType: 'Permission',
 *   message: { grantee: '0x...', operation: 'read' }
 * };
 *
 * const viemTypedData = toViemTypedDataDefinition(vanaTypedData);
 * const signature = await walletClient.signTypedData(viemTypedData);
 * ```
 *
 * @category Utilities
 */
export function toViemTypedDataDefinition(
  typedData: GenericTypedData,
): TypedDataDefinition {
  // Transform the types to match viem's expected format with readonly arrays
  const viemTypes: Record<string, readonly { name: string; type: string }[]> =
    {};

  for (const [typeName, typeArray] of Object.entries(typedData.types)) {
    // Create a new readonly array for each type
    viemTypes[typeName] = typeArray.map((field) => ({
      name: field.name,
      type: field.type,
    })) as readonly { name: string; type: string }[];
  }

  return {
    domain: typedData.domain,
    types: viemTypes as TypedDataDefinition["types"],
    primaryType: typedData.primaryType,
    message: typedData.message,
  };
}
