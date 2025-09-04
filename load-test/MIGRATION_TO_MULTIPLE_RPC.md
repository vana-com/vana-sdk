# Migration: Single RPC → Multiple RPCs

## Why This Change?

Based on load test analysis, RPC endpoints were the bottleneck, not the blockchain. Transactions confirmed in <9 seconds once they reached the mempool, but were getting stuck at the RPC layer for 30+ minutes.

## What Changed

1. **Removed**: `LOAD_TEST_RPC_ENDPOINT` (singular)
2. **Required**: `LOAD_TEST_RPC_ENDPOINTS` (plural, comma-separated)
3. **Distribution**: Each wallet deterministically uses one RPC endpoint

## How to Update Your Environment

### Before:
```bash
LOAD_TEST_RPC_ENDPOINT=https://rpc.moksha.vana.org
```

### After:
```bash
# Single endpoint (still works, but no distribution)
LOAD_TEST_RPC_ENDPOINTS=https://rpc.moksha.vana.org

# Multiple endpoints (recommended for load testing)
LOAD_TEST_RPC_ENDPOINTS=https://rpc.moksha.vana.org,https://rpc2.moksha.vana.org,https://rpc3.moksha.vana.org

# With QuickNode endpoints
LOAD_TEST_RPC_ENDPOINTS=https://rpc.moksha.vana.org,https://prettiest-damp-forest.vana-moksha.quiknode.pro/YOUR_KEY
```

## How Distribution Works

- Each wallet address is hashed to deterministically select an RPC
- Same wallet always uses same RPC (prevents nonce issues)
- Load is evenly distributed across all endpoints

## Example: 1000 Users, 3 RPCs

- Users 0-332: RPC 1
- Users 333-665: RPC 2  
- Users 666-999: RPC 3

## Benefits

- Avoids RPC rate limits
- Reduces RPC latency
- Better throughput at scale
- No more 30+ minute timeouts

## Quick Test

```bash
# Set multiple endpoints
export LOAD_TEST_RPC_ENDPOINTS="https://rpc.moksha.vana.org,https://rpc2.moksha.vana.org"

# Run small test
npx tsx milestones/ms-05/test-streaming-load.ts --users 20 --rate 2 --concurrency 10
```

You should see in debug logs:
```
[0x123...] Using RPC: https://rpc.moksha.vana.org
[0x456...] Using RPC: https://rpc2.moksha.vana.org
```
