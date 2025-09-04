# RPC Optimization for Load Testing

## The Real Problem

Based on network analysis, transactions are confirming in <9 seconds once they reach the mempool. The 30+ minute delays are happening **before** transactions reach the blockchain - at the RPC level.

## Solutions

### 1. Use Multiple RPC Endpoints

Instead of hammering one QuickNode endpoint with 1000 users:

```typescript
// In load-test-client.ts
const RPC_ENDPOINTS = [
  process.env.RPC_ENDPOINT_1,
  process.env.RPC_ENDPOINT_2,
  process.env.RPC_ENDPOINT_3,
  // Add more endpoints
];

// Round-robin or random selection
const rpcEndpoint = RPC_ENDPOINTS[userIndex % RPC_ENDPOINTS.length];
```

### 2. Add RPC Retry Logic

```typescript
async function sendTransactionWithRetry(tx: any, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await walletClient.sendTransaction(tx);
    } catch (error) {
      if (error.message.includes('rate limit') || error.code === 'TIMEOUT') {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }
      throw error;
    }
  }
}
```

### 3. Reduce Gas Settings (Save Money!)

Since gas isn't the issue, you can be less aggressive:

```bash
# Instead of 20x premium
PREMIUM_GAS_MULTIPLIER=3 MAX_GAS_PRICE=50 npx tsx milestones/ms-05/test-streaming-load.ts
```

This would only use 0.03 VANA for gas instead of 0.15 VANA!

### 4. Monitor RPC Performance

Add RPC latency tracking:

```typescript
const start = Date.now();
const txHash = await walletClient.sendTransaction(...);
const rpcLatency = Date.now() - start;

if (rpcLatency > 5000) {
  console.warn(`[RPC] Slow response: ${rpcLatency}ms`);
}
```

### 5. Rate Limit Your Requests

Don't overwhelm the RPC:

```typescript
// Add delays between users
const batchSize = 50;
const batchDelay = 1000; // 1 second between batches

if (activeUsers % batchSize === 0) {
  await new Promise(resolve => setTimeout(resolve, batchDelay));
}
```

## Recommended Load Test Strategy

1. **Start Small**: Test with 100 users first
2. **Monitor RPC Latency**: Track how long `sendTransaction` takes
3. **Use Multiple RPCs**: Distribute load across endpoints
4. **Lower Gas Settings**: Start with 3x multiplier, 50 gwei max
5. **Gradual Scaling**: Increase load only after confirming RPC stability

## Quick Fix for Immediate Testing

```bash
# Lower gas, longer timeouts, smaller batches
PREMIUM_GAS_MULTIPLIER=3 \
MAX_GAS_PRICE=50 \
TRANSACTION_TIMEOUT_MS=120000 \
MAX_CONCURRENT_USERS=100 \
npx tsx milestones/ms-05/test-streaming-load.ts --users 500
```
