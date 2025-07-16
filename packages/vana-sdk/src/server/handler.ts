import { Address, Hash, recoverTypedDataAddress } from "viem";
import type { VanaNode } from "../index.node";
import type {
  GenericTypedData,
  PermissionGrantTypedData,
  TrustServerTypedData,
} from "../types";
import { SignatureError } from "../errors";

/**
 * Payload structure for relayer requests.
 * Contains the EIP-712 typed data, signature, and optional expected user address for security verification.
 *
 * @category Server
 */
export interface RelayerRequestPayload {
  /** EIP-712 typed data containing the transaction details */
  typedData: GenericTypedData;
  /** User's signature of the typed data */
  signature: Hash;
  /** Optional expected user address for security verification */
  expectedUserAddress?: Address;
}

/**
 * Unified server-side handler for processing relayed transactions.
 *
 * This function encapsulates the complete relayer workflow:
 * 1. Verifies the signature against the typed data
 * 2. Optionally checks the signer matches the expected user address
 * 3. Routes to the appropriate SDK method based on primaryType
 * 4. Returns the resulting transaction hash
 *
 * Supported transaction types:
 * - Permission: Permission grants
 * - PermissionRevoke: Permission revocations
 * - TrustServer: Trust server operations
 * - UntrustServer: Untrust server operations
 *
 * @param sdk - Initialized Vana SDK instance
 * @param payload - Request payload containing typed data, signature, and optional security check
 * @returns Promise resolving to the transaction hash
 * @throws {SignatureError} When signature verification fails or signer mismatch occurs
 * @throws {Error} When primaryType is unsupported or SDK operations fail
 * @category Server
 * @example
 * ```typescript
 * import { handleRelayerRequest } from 'vana-sdk';
 *
 * // In your relayer API endpoint:
 * export async function POST(request: NextRequest) {
 *   try {
 *     const body = await request.json();
 *     const vana = await createRelayerVana();
 *
 *     const txHash = await handleRelayerRequest(vana, {
 *       typedData: body.typedData,
 *       signature: body.signature,
 *       expectedUserAddress: body.expectedUserAddress
 *     });
 *
 *     return NextResponse.json({
 *       success: true,
 *       transactionHash: txHash
 *     });
 *   } catch (error) {
 *     return NextResponse.json({
 *       success: false,
 *       error: error.message
 *     }, { status: 500 });
 *   }
 * }
 * ```
 */
export async function handleRelayerRequest(
  sdk: VanaNode,
  payload: RelayerRequestPayload,
): Promise<Hash> {
  const { typedData, signature, expectedUserAddress } = payload;

  // Step 1: Verify signature and recover signer address
  const signerAddress = await recoverTypedDataAddress({
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message as unknown as Record<string, unknown>,
    signature,
  });

  if (!signerAddress) {
    throw new SignatureError(
      "Invalid signature - could not recover signer address",
    );
  }

  // Step 2: Security check - verify signer matches expected user address if provided
  if (expectedUserAddress) {
    const normalizedSigner = signerAddress.toLowerCase();
    const normalizedExpected = expectedUserAddress.toLowerCase();

    if (normalizedSigner !== normalizedExpected) {
      throw new SignatureError(
        `Security verification failed: Recovered signer address (${normalizedSigner}) does not match expected user address (${normalizedExpected}). This may be due to incorrect EIP-712 domain configuration.`,
      );
    }
  }

  // Step 3: Route to appropriate SDK method based on primaryType
  switch (typedData.primaryType) {
    case "Permission":
      return await sdk.permissions.submitSignedGrant(
        typedData as unknown as PermissionGrantTypedData,
        signature,
      );

    case "PermissionRevoke":
      return await sdk.permissions.submitSignedRevoke(
        typedData as unknown as GenericTypedData,
        signature,
      );

    case "TrustServer":
      return await sdk.permissions.submitSignedTrustServer(
        typedData as unknown as TrustServerTypedData,
        signature,
      );

    case "UntrustServer":
      return await sdk.permissions.submitSignedUntrustServer(
        typedData as unknown as GenericTypedData,
        signature,
      );

    default:
      throw new Error(`Unsupported operation type: ${typedData.primaryType}`);
  }
}
