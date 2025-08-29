# Vana SDK Relayer Callbacks Simplification

## Summary

Simplifying the relayer pattern from 11 callbacks to 2, making it easier for developers to implement gasless transactions.

## Current Problem

Developers must implement 11 different callbacks, even though:

- All 7 signed operations have identical signatures and go to the same server handler
- Developers end up creating workarounds to avoid repetition
- The callback names don't match the methods that trigger them

## Solution: 2 Callbacks

### New Interface

```typescript
interface RelayerCallbacks {
  /**
   * Handles all EIP-712 signed operations.
   * Pass these arguments directly to the SDK's `handleRelayerRequest` helper.
   */
  submitSigned?: (
    typedData: GenericTypedData,
    signature: Hash,
  ) => Promise<Hash>;

  /**
   * Handles all non-signed operations.
   * Pass this request object to the SDK's new `handleDirectRequest` helper.
   */
  submitDirect?: (
    request: DirectRelayerRequest,
  ) => Promise<DirectRelayerResponse>;
}
```

### Type Definitions

```typescript
// Discriminated union for all non-signed operations
type DirectRelayerRequest =
  | {
      operation: "file.add";
      params: {
        url: string;
        userAddress: Address;
      };
    }
  | {
      operation: "file.addWithPermissions";
      params: {
        url: string;
        userAddress: Address;
        permissions: Array<{ account: Address; key: string }>;
      };
    }
  | {
      operation: "file.addComplete";
      params: {
        url: string;
        userAddress: Address;
        permissions: Array<{ account: Address; key: string }>;
        schemaId: number;
        ownerAddress?: Address;
      };
    }
  | {
      operation: "grant.store";
      params: GrantFile;
    };

type DirectRelayerResponse =
  | { fileId: number; transactionHash: Hash } // For file operations
  | { url: string }; // For grant storage
```

## Implementation Steps

### 1. Update Type Definitions

Update `/workspace/packages/vana-sdk/src/types/config.ts`:

- Add new `RelayerCallbacksV2` interface with 2 callbacks
- Add `DirectRelayerRequest` and `DirectRelayerResponse` types
- Keep old `RelayerCallbacks` for backward compatibility

### 2. Create Server Helper

Create `/workspace/packages/vana-sdk/src/server/directHandler.ts`:

```typescript
export async function handleDirectRequest(
  sdk: VanaInstance,
  request: DirectRelayerRequest,
): Promise<DirectRelayerResponse> {
  switch (request.operation) {
    case "file.add":
    // Implementation for file.add
    case "file.addWithPermissions":
    // Implementation for file.addWithPermissions
    case "file.addComplete":
    // Implementation for file.addComplete
    case "grant.store":
    // Implementation for grant.store
  }
}
```

### 3. Update SDK Controllers

Modify controllers to check for new callbacks first, fall back to old ones:

```typescript
// In permissions controller
if (this.context.relayerCallbacks?.submitSigned) {
  // Use new unified callback
  return this.context.relayerCallbacks.submitSigned(typedData, signature);
} else if (this.context.relayerCallbacks?.submitPermissionGrant) {
  // Fall back to old callback for compatibility
  return this.context.relayerCallbacks.submitPermissionGrant(
    typedData,
    signature,
  );
}
```

### 4. Create Migration Guide

Document how to migrate from 11 callbacks to 2.

## Benefits

1. **Simpler for developers** - 2 callbacks instead of 11
2. **Type-safe** - Discriminated unions provide full type safety
3. **Backward compatible** - Old callbacks continue to work
4. **Matches reality** - Signed ops already use one server handler
5. **Self-documenting** - Operation types are explicit

## Timeline

- Day 1: Implement types and server helper
- Day 2: Update SDK controllers
- Day 3: Test and document
- Day 4: Release as minor version update
