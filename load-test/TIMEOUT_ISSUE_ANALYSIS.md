# Transaction Timeout Issue Analysis

## Problem Summary

During load testing with 1000 concurrent users, ~83% of transactions fail with TIMEOUT_ERROR. Transactions remain pending for >30 minutes despite:
- Configuring 10x gas multiplier
- Setting 3-minute timeouts
- Having sufficient wallet funding

## Root Causes

### 1. **SDK Doesn't Use Premium Gas Configuration**
```typescript
// Load test configures:
premiumGasMultiplier: 10.0  // 10x gas

// But SDK uses:
await walletClient.writeContract({
  // No gas parameters passed!
  // Uses viem's automatic gas estimation
})
```

### 2. **Timeout Mismatch**
- Load test config: `transactionTimeoutMs: 600000` (10 minutes)
- SDK hardcoded: `timeout: 30_000` (30 seconds)
- Actual pending time: >30 minutes

### 3. **Network Congestion at Scale**
When 1000 users submit simultaneously:
- Mempool fills up
- Base gas price spikes (maybe 5-10x)
- Your "10x" multiplier might only be 1-2x actual market rate
- Lower-priced transactions get stuck

## Why It's "Selective"

Not all transactions fail because:
- Early transactions get in before congestion
- Gas prices fluctuate - some get lucky timing
- Network processes highest-paying transactions first

## Solutions

### Quick Fix: Increase Gas Multiplier (Within Budget)
```typescript
// In defaults.ts (for 0.2 VANA per wallet)
premiumGasMultiplier: 20.0,  // 20x instead of 10x
maxGasPrice: "100",          // 100 gwei max (costs 0.06 VANA)
```

### Proper Fix: Modify SDK to Accept Gas Parameters

#### Option 1: Extend SDK Interface
```typescript
// In SDK permissions controller
async submitAddServerFilesAndPermissions(
  params: ServerFilesAndPermissionParams,
  gasOptions?: {
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
  }
): Promise<TransactionHandle> {
  // ...
  const txHash = await this.context.walletClient.writeContract({
    // ... existing params
    maxFeePerGas: gasOptions?.maxFeePerGas,
    maxPriorityFeePerGas: gasOptions?.maxPriorityFeePerGas,
  });
}
```

#### Option 2: Monkey-patch viem Client
```typescript
// In load test client initialization
const originalWriteContract = walletClient.writeContract;
walletClient.writeContract = async (args) => {
  const premiumGas = await getPremiumGasPrice();
  return originalWriteContract({
    ...args,
    maxFeePerGas: premiumGas,
    maxPriorityFeePerGas: premiumGas / 10n,
  });
};
```

### Immediate Workaround: Batch & Throttle
```typescript
// Instead of 1000 concurrent
const BATCH_SIZE = 50;  // 50 users at a time
const BATCH_DELAY = 5000; // 5 seconds between batches

// This reduces mempool congestion
```

### Fix Timeout Handling
```typescript
// In SDK transactionParsing.ts
const receipt = await context.publicClient.waitForTransactionReceipt({
  hash,
  timeout: 180_000, // 3 minutes instead of 30 seconds
});

// Or make it configurable
timeout: context.config?.transactionTimeout || 30_000,
```

## Debugging Steps

1. **Monitor Actual Gas Prices**
   ```bash
   # During test, check network gas prices
   cast gas-price --rpc-url https://rpc.moksha.vana.org
   ```

2. **Check Pending Transactions**
   ```bash
   # See mempool status
   cast call --rpc-url https://rpc.moksha.vana.org eth_txpool_content
   ```

3. **Verify Transaction Gas**
   ```bash
   # Check what gas price your TX actually used
   cast tx <HASH> --rpc-url https://rpc.moksha.vana.org
   ```

## Recommended Action Plan

1. **Immediate**: Increase gas multiplier to 50x and reduce concurrency to 100
2. **Short-term**: Implement Option 2 (monkey-patch) for gas control
3. **Long-term**: Submit PR to SDK for proper gas parameter support
4. **Monitor**: Add gas price logging to understand actual vs configured values

