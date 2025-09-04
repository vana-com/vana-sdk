# SDK TransactionOptions Integration for Load Testing

## Overview

The Vana SDK now supports native `TransactionOptions` for gas configuration and timeout control, eliminating the need for gas monkey-patching in load tests.

## Key Changes

### ✅ SDK Implementation (Completed)

1. **Enhanced TransactionOptions Interface**:
   ```typescript
   interface TransactionOptions {
     gasLimit?: bigint;
     gasPrice?: bigint;
     maxFeePerGas?: bigint;
     maxPriorityFeePerGas?: bigint;
     nonce?: number;
     value?: bigint;
     timeout?: number; // NEW: Transaction timeout in milliseconds
   }
   ```

2. **Updated Methods with TransactionOptions Support**:
   - `submitAddServerFilesAndPermissions(params, options?)` ✅
   - `submitPermissionRevoke(params, options?)` ✅
   - `submitUntrustServer(params, options?)` ✅
   - `submitRegisterGrantee(params, options?)` ✅
   - `submitUpdateServer(serverId, url, options?)` ✅
   - `submitRevokePermission(permissionId, options?)` ✅

### 🔄 Load Test Integration (In Progress)

#### Before (Gas Monkey-Patch):
```typescript
// OLD: Monkey-patch approach
const patchedWalletClient = patchWalletClientForPremiumGas(baseWalletClient, config);

const txHandle = await vana.permissions.submitAddServerFilesAndPermissions({
  // ... params
}); // No gas control
```

#### After (SDK TransactionOptions):
```typescript
// NEW: Native SDK approach
const transactionOptions = {
  maxFeePerGas: BigInt(config.maxGasPrice) * BigInt(config.premiumGasMultiplier) * 1_000_000_000n,
  maxPriorityFeePerGas: BigInt(config.maxGasPrice) * 100_000_000n, // 10% of base
  gasLimit: BigInt(config.gasLimit),
  timeout: config.transactionTimeoutMs,
};

const txHandle = await vana.permissions.submitAddServerFilesAndPermissions({
  // ... params
}, transactionOptions);

// Timeout is automatically applied when waiting for receipt
const receipt = await vana.waitForTransactionReceipt(txHandle, {
  timeout: transactionOptions.timeout
});
```

## Implementation Guide

### 1. Update DataPortabilityFlow

```typescript
// In executeTransaction method
const transactionOptions = {
  maxFeePerGas: BigInt(config.maxGasPrice * config.premiumGasMultiplier) * 1_000_000_000n,
  maxPriorityFeePerGas: BigInt(config.maxGasPrice * 0.1) * 1_000_000_000n,
  gasLimit: BigInt(config.gasLimit),
  timeout: config.transactionTimeoutMs,
};

const txHandle = await this.vana.permissions.submitAddServerFilesAndPermissions({
  granteeId: BigInt(granteeId),
  grant: grantUrl,
  fileUrls: [fileUrl],
  schemaIds: [finalSchemaId],
  serverAddress: serverInfo.address,
  serverUrl: serverInfo.base_url,
  serverPublicKey: serverInfo.public_key,
  filePermissions: [[{
    account: serverInfo.address,
    key: encryptedKey,
  }]],
}, transactionOptions);
```

### 2. Remove Gas Monkey-Patch

```typescript
// Remove from load-test-client.ts:
- import { patchWalletClientForPremiumGas } from '../utils/gas-monkey-patch.js';
- this.walletClient = patchWalletClientForPremiumGas(baseWalletClient, config);

// Use standard wallet client:
+ this.walletClient = baseWalletClient;
```

### 3. Update Configuration

```typescript
// In LoadTestConfig interface - timeout is already supported:
interface LoadTestConfig {
  transactionTimeoutMs: number; // Used in TransactionOptions.timeout
  premiumGasMultiplier: number; // Used for maxFeePerGas calculation
  maxGasPrice: string;          // Base gas price in gwei
  gasLimit: number;             // Used in TransactionOptions.gasLimit
  // ... other config
}
```

## Benefits

### 🚀 Performance Improvements
- **Native gas control**: No monkey-patching overhead
- **Proper timeout handling**: Configurable per transaction type
- **EIP-1559 support**: Better gas price management during congestion
- **Type safety**: Full TypeScript support for gas parameters

### 🔧 Maintainability
- **Standard SDK API**: No custom patching required
- **Consistent interface**: Same pattern across all transaction methods
- **Future-proof**: Supports new gas features as they're added to viem

### 🧪 Load Testing
- **Reliable timeouts**: Prevents stuck transactions during high load
- **Premium gas pricing**: Ensures transactions are processed quickly
- **Configurable per method**: Different gas strategies for different operations

## Migration Checklist

- [x] Update SDK with TransactionOptions support
- [x] Add comprehensive test coverage for TransactionOptions
- [x] Update permissions controller methods
- [ ] Update DataPortabilityFlow to use TransactionOptions
- [ ] Remove gas monkey-patch from load test client
- [ ] Update streaming load test documentation
- [ ] Test integration with actual load test run
- [ ] Update TIMEOUT_ISSUE_ANALYSIS.md with new solution

## Usage Examples

### High Priority Load Test
```typescript
const highPriorityOptions = {
  maxFeePerGas: 500n * 10n ** 9n, // 500 gwei
  maxPriorityFeePerGas: 50n * 10n ** 9n, // 50 gwei tip
  gasLimit: 1000000n,
  timeout: 300000, // 5 minutes
};

await vana.permissions.submitAddServerFilesAndPermissions(params, highPriorityOptions);
```

### Conservative Load Test
```typescript
const conservativeOptions = {
  gasPrice: 20n * 10n ** 9n, // 20 gwei legacy pricing
  gasLimit: 600000n,
  timeout: 180000, // 3 minutes
};

await vana.permissions.submitAddServerFilesAndPermissions(params, conservativeOptions);
```

### Batch Operations
```typescript
const batchOptions = {
  maxFeePerGas: 100n * 10n ** 9n,
  maxPriorityFeePerGas: 2n * 10n ** 9n,
  timeout: 120000, // 2 minutes for faster batch processing
};

// Use same options for multiple operations
await vana.permissions.submitPermissionRevoke({permissionId: 1n}, batchOptions);
await vana.permissions.submitPermissionRevoke({permissionId: 2n}, batchOptions);
await vana.permissions.submitPermissionRevoke({permissionId: 3n}, batchOptions);
```

## Next Steps

1. **Rebuild SDK**: Ensure load test has access to latest SDK with TransactionOptions
2. **Update imports**: Fix SDK import issues in load test files
3. **Test integration**: Run load test with new TransactionOptions approach
4. **Performance validation**: Compare against gas monkey-patch approach
5. **Documentation**: Update all load test docs with new patterns
