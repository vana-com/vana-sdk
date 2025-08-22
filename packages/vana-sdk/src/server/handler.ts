import { Address, Hash, recoverTypedDataAddress, getAddress } from "viem";
import type { VanaInstance } from "../index.node";
import type {
  GenericTypedData,
  PermissionGrantTypedData,
  RevokePermissionTypedData,
  RegisterGranteeTypedData,
  TrustServerTypedData,
  AddAndTrustServerTypedData,
  ServerFilesAndPermissionTypedData,
  TypedDataPrimaryType,
} from "../types";
import { SignatureError } from "../errors";
import type { TransactionResult } from "../types/operations";
import type {
  PermissionGrantResult,
  PermissionRevokeResult,
  ServerTrustResult,
  ServerUntrustResult,
  GranteeRegisterResult,
  FileAddedResult,
} from "../types/transactionResults";

/** Union type of all possible transaction results from relayer operations */
type RelayerTransactionResult =
  | PermissionGrantResult
  | PermissionRevokeResult
  | ServerTrustResult
  | ServerUntrustResult
  | GranteeRegisterResult
  | FileAddedResult;

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
 * 4. Returns the transaction handle with hash and event parsing capability
 *
 * Supported transaction types:
 * - Permission: Permission grants
 * - PermissionRevoke: Permission revocations
 * - TrustServer: Trust server operations
 * - UntrustServer: Untrust server operations
 * - AddServer: Add and trust server operations
 * - RegisterGrantee: Register grantee operations
 * - ServerFilesAndPermission: Batch operation for server, files, and permissions
 *
 * @param sdk - Initialized Vana SDK instance
 * @param payload - Request payload containing typed data, signature, and optional security check
 * @returns Promise resolving to TransactionResult with hash and optional event data
 * @throws {SignatureError} When signature verification fails or signer mismatch occurs
 * @throws {Error} When primaryType is unsupported or SDK operations fail
 * @category Server
 * @example
 * ```typescript
 * import { handleRelayerRequest } from '@opendatalabs/vana-sdk';
 *
 * // In your relayer API endpoint:
 * export async function POST(request: NextRequest) {
 *   try {
 *     const body = await request.json();
 *     const vana = await createRelayerVana();
 *
 *     const tx = await handleRelayerRequest(vana, {
 *       typedData: body.typedData,
 *       signature: body.signature,
 *       expectedUserAddress: body.expectedUserAddress
 *     });
 *
 *     // Option 1: Return just the hash immediately
 *     return NextResponse.json({
 *       success: true,
 *       transactionHash: tx.hash
 *     });
 *
 *     // Option 2: Wait for transaction confirmation and return event data
 *     const eventData = await tx.waitForEvents();
 *     return NextResponse.json({
 *       success: true,
 *       transactionHash: tx.hash,
 *       ...eventData // Include parsed event data like permissionId, fileId, etc.
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
  sdk: VanaInstance,
  payload: RelayerRequestPayload,
): Promise<TransactionResult & { eventData?: RelayerTransactionResult }> {
  const { typedData, signature, expectedUserAddress } = payload;

  console.debug({
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message as unknown as Record<string, unknown>,
    signature,
  });

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
    const normalizedSigner = getAddress(signerAddress);
    const normalizedExpected = getAddress(expectedUserAddress);

    if (normalizedSigner !== normalizedExpected) {
      throw new SignatureError(
        `Security verification failed: Recovered signer address (${normalizedSigner}) does not match expected user address (${normalizedExpected}). This may be due to incorrect EIP-712 domain configuration.`,
      );
    }
  }

  // Step 3: Route to appropriate SDK method based on primaryType
  // Route to appropriate SDK method and return TransactionResult directly
  const primaryType = typedData.primaryType as TypedDataPrimaryType;
  switch (primaryType) {
    case "Permission":
      return sdk.permissions.submitSignedGrant(
        typedData as unknown as PermissionGrantTypedData,
        signature,
      );

    case "RevokePermission":
      return sdk.permissions.submitSignedRevoke(
        typedData as unknown as RevokePermissionTypedData,
        signature,
      );

    case "TrustServer":
      return sdk.permissions.submitSignedTrustServer(
        typedData as unknown as TrustServerTypedData,
        signature,
      );

    case "AddServer":
      return sdk.permissions.submitSignedAddAndTrustServer(
        typedData as unknown as AddAndTrustServerTypedData,
        signature,
      );

    case "UntrustServer":
      return sdk.permissions.submitSignedUntrustServer(
        typedData as unknown as GenericTypedData,
        signature,
      );

    case "RegisterGrantee":
      return sdk.permissions.submitSignedRegisterGrantee(
        typedData as unknown as RegisterGranteeTypedData,
        signature,
      );

    case "ServerFilesAndPermission":
      return sdk.permissions.submitSignedAddServerFilesAndPermissions(
        typedData as unknown as ServerFilesAndPermissionTypedData,
        signature,
      );

    default:
      throw new Error(`Unsupported operation type: ${typedData.primaryType}`);
  }
}
