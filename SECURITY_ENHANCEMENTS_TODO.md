# Security Enhancements for Relayer Pattern

## Current Status

The unified relayer pattern successfully reduces 11 callbacks to 1, improving developer UX significantly. However, additional security measures should be implemented in a future version.

## Recommended Security Enhancements

### 1. Add Security Fields to EIP-712 Messages

**Required Smart Contract Changes**: YES ⚠️

Add these fields to ALL signed message types:

```typescript
// In typedData.types for each operation
types: {
  Permission: [
    // Existing fields
    { name: "nonce", type: "uint256" },
    { name: "granteeId", type: "uint256" },
    { name: "grant", type: "string" },
    { name: "fileIds", type: "uint256[]" },

    // NEW security fields
    { name: "intentId", type: "bytes16" }, // UUID without hyphens
    { name: "deadline", type: "uint256" }, // Unix timestamp
    { name: "grantHash", type: "bytes32" }, // keccak256 of grant data
  ];
}
```

### 2. Server-Side Validation

Add these checks in `handleRelayerOperation`:

```typescript
// Before processing any signed operation
async function validateSignedRequest(request: SignedRelayerRequest) {
  const { message } = request.typedData;

  // 1. Check deadline
  if (Math.floor(Date.now() / 1000) > message.deadline + 30) {
    throw new Error("Request expired");
  }

  // 2. Verify signer
  const signer = recoverTypedDataAddress(request.typedData, request.signature);
  if (
    request.expectedUserAddress &&
    toLower(request.expectedUserAddress) !== toLower(signer)
  ) {
    throw new Error("Invalid signer");
  }

  // 3. Verify grant hash if present
  if (message.grant && message.grantHash === ZERO_HASH) {
    throw new Error("Grant hash required");
  }

  // 4. Allowlist check (optional but recommended)
  const allowed = ALLOWED_CONTRACTS.has(
    `${message.chainId}-${message.verifyingContract}-${request.typedData.primaryType}`,
  );
  if (!allowed) {
    throw new Error("Contract not allowlisted");
  }
}
```

### 3. Grant Hash Computation

```typescript
/**
 * Computes deterministic hash of grant data
 * @param grant - Grant object to hash
 * @returns Keccak256 hash as hex string
 */
export function computeGrantHash(grant: GrantFile): `0x${string}` {
  // Sort keys for deterministic JSON
  const canonical = JSON.stringify(grant, Object.keys(grant).sort());
  return keccak256(toHex(canonical));
}
```

### 4. Intent ID Generation

```typescript
/**
 * Generates a unique intent ID for request tracking
 * @returns 16-byte hex string (UUID v4 without hyphens)
 */
export function generateIntentId(): `0x${string}` {
  const uuid = crypto.randomUUID().replace(/-/g, "");
  return `0x${uuid}`;
}
```

## Implementation Challenges

### Smart Contract Updates Required

1. **Backwards Compatibility**: Adding fields to EIP-712 messages breaks existing signatures
2. **Gas Costs**: Additional fields increase transaction costs
3. **Migration Path**: Need to support both old and new message formats during transition

### Suggested Phased Approach

**Phase 1** (Current): Unified relayer pattern without contract changes ✅
**Phase 2**: Add server-side validation without contract changes
**Phase 3**: Deploy new contracts with enhanced EIP-712 messages
**Phase 4**: Migrate clients to new message format
**Phase 5**: Deprecate old message format

## Why Not Implemented Now

1. **Scope**: Original request was to fix UX (11 callbacks → 1), not security
2. **Breaking Changes**: Requires coordinated smart contract deployment
3. **Time**: Contract changes need extensive testing and auditing
4. **Compatibility**: Would break all existing integrations

## Recommendations

1. **Immediate**: Implement server-side validation (Phase 2) without contract changes
2. **Short-term**: Plan contract upgrade with security fields
3. **Long-term**: Consider meta-transaction standard (EIP-2771) for better security

## Security Considerations Without Contract Changes

Even without contract changes, we can add:

1. **Rate limiting** per address
2. **Request deduplication** via intent IDs (server-side only)
3. **Signature verification** before processing
4. **Deadline enforcement** (server-side only)
5. **Allowlist of known contracts**

These provide defense-in-depth without requiring contract updates.

## Conclusion

The current unified relayer implementation significantly improves UX. Security enhancements requiring contract changes should be implemented in a coordinated future release.
