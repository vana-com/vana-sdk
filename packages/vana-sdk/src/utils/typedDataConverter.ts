import type { TypedDataDefinition } from "viem";
import type { GenericTypedData } from "../types/permissions";

/**
 * Converts a GenericTypedData object to a Viem-compatible TypedDataDefinition.
 * This function ensures type safety when passing typed data to viem's signTypedData method.
 *
 * @param typedData - The typed data object to convert
 * @returns A properly typed TypedDataDefinition for use with viem
 */
export function toViemTypedDataDefinition(
  typedData: GenericTypedData,
): TypedDataDefinition {
  return {
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  };
}
