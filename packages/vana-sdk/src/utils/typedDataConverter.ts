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
