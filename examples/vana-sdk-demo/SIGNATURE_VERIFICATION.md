# Signature Verification in Relayer

## Overview

The relayer API now includes enhanced security verification to prevent incorrect behavior when EIP-712 signatures are created with the wrong domain configuration.

## Problem

When a user signs an EIP-712 message with an incorrect domain (e.g., using `DataPermissions` instead of `VanaDataPermissions`), the recovered signer address on-chain can differ from the actual user's address. This doesn't pose a direct security risk since the chance that another user controls the incorrect address is very low, but it can lead to incorrect behavior and user confusion.

## Solution

The relayer now verifies that the address recovered from the signature matches the expected user address before submitting transactions to the blockchain.

### How It Works

1. **Client Side**: When submitting signatures to the relayer, the client now includes the expected user address alongside the typed data and signature:

```typescript
const result = await relayRequest("relay", {
  typedData: jsonSafeTypedData,
  signature,
  expectedUserAddress: address, // ← New field
});
```

2. **Relayer Side**: The relayer performs the following verification:

```typescript
// Recover signer address from signature
const signerAddress = await recoverTypedDataAddress({
  domain: typedData.domain,
  types: typedData.types,
  primaryType: typedData.primaryType,
  message: typedData.message,
  signature,
});

// Verify addresses match (case-insensitive)
if (expectedUserAddress) {
  const normalizedSigner = signerAddress.toLowerCase();
  const normalizedExpected = expectedUserAddress.toLowerCase();

  if (normalizedSigner !== normalizedExpected) {
    // Return 403 error with detailed information
    return error("Security verification failed: Address mismatch");
  }
}
```

## Benefits

1. **Prevents Domain Confusion**: Catches cases where the wrong EIP-712 domain is used during signing
2. **Clear Error Messages**: Provides detailed information about the mismatch to help debugging
3. **Security Best Practice**: Follows the recommendation to verify recovered addresses match expected signers
4. **Backward Compatible**: The `expectedUserAddress` field is optional, so existing integrations continue to work

## Error Response

When verification fails, the relayer returns a 403 error with detailed information:

```json
{
  "success": false,
  "error": "Security verification failed: Recovered signer address (0xabc...) does not match expected user address (0x123...). This may be due to incorrect EIP-712 domain configuration.",
  "details": {
    "recoveredSigner": "0xabc...",
    "expectedUser": "0x123...",
    "domain": "DataPermissions"
  }
}
```

## Implementation

This verification is implemented in:

- **Relayer API**: `/examples/vana-sdk-demo/src/app/api/relay/route.ts`
- **Demo App**: All relayer callback functions in `demo-page.tsx` now include the expected user address
- **Tests**: Comprehensive test coverage in `route.test.ts`

## Usage

For new integrations, always include the expected user address when calling the relayer:

```typescript
const relayerResponse = await fetch("/api/relay", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    typedData: signedData.typedData,
    signature: signedData.signature,
    expectedUserAddress: userWalletAddress, // Include this!
  }),
});
```

## Testing

The verification can be tested by:

1. Using the wrong EIP-712 domain when signing
2. Providing a different `expectedUserAddress` than the actual signer
3. Verifying that the relayer rejects the transaction with a clear error message

This enhancement ensures that signature-related issues are caught early and provides clear debugging information when domain misconfigurations occur.
