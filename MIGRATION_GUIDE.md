# Migration Guide: Vana SDK Subgraph Consistency Update

## Overview

This update introduces consistency guarantees for subgraph queries and aligns transaction options with viem standards. It includes breaking changes that improve reliability and prevent data inconsistency issues.

## Breaking Changes

### 1. TransactionOptions: `gasLimit` → `gas`

**Before:**

```typescript
await vana.data.upload(params, {
  gasLimit: 1000000n,
  gasPrice: 50n * 10n ** 9n,
});
```

**After:**

```typescript
await vana.data.upload(params, {
  gas: 1000000n, // Changed from gasLimit
  gasPrice: 50n * 10n ** 9n,
});
```

### 2. getUserFiles Signature Change

**Before:**

```typescript
const files = await vana.data.getUserFiles({
  owner: address,
  subgraphUrl: "https://...", // Optional
});
```

**After:**

```typescript
// Basic usage (backward compatible)
const files = await vana.data.getUserFiles({
  owner: address,
});

// With new options
const files = await vana.data.getUserFiles(
  { owner: address },
  {
    minBlock: 12345,
    limit: 50,
  },
);
```

## New Features

### Consistency Guarantees

Ensure data includes recent transactions:

```typescript
// After creating data on-chain
const tx = await vana.data.upload({ ... });
const receipt = await vana.publicClient.waitForTransactionReceipt({
  hash: tx.hash
});

// Guarantee the new data is visible
const files = await vana.data.getUserFiles(
  { owner: address },
  {
    minBlock: Number(receipt.blockNumber),
    waitForSync: 30000  // Wait up to 30s for subgraph to sync
  }
);
```

### Pagination Controls

**Default Behavior (Safe):**

```typescript
// Returns first 100 files by default
const files = await vana.data.getUserFiles({ owner: address });
```

**Custom Limits:**

```typescript
// Get first 10 files
const files = await vana.data.getUserFiles({ owner: address }, { limit: 10 });

// Get files 20-30
const files = await vana.data.getUserFiles(
  { owner: address },
  { offset: 20, limit: 10 },
);
```

**Fetch All (Explicit Opt-in):**

```typescript
// Fetch ALL files (use with caution)
const files = await vana.data.getUserFiles(
  { owner: address },
  { fetchAll: true },
);
```

### Sorting Options

```typescript
// Sort by different fields
const recentFiles = await vana.data.getUserFiles(
  { owner: address },
  {
    orderBy: "addedAtBlock",
    orderDirection: "desc", // newest first
  },
);

// Sort by timestamp ascending
const oldestFirst = await vana.data.getUserFiles(
  { owner: address },
  {
    orderBy: "addedAtTimestamp",
    orderDirection: "asc",
  },
);
```

## Common Patterns

### Pattern 1: Verify After Upload (XP Rewards, etc.)

```typescript
async function uploadAndVerify(data: any) {
  // Upload file
  const uploadResult = await vana.data.upload(data);

  // Wait for transaction confirmation
  const receipt = await vana.publicClient.waitForTransactionReceipt({
    hash: uploadResult.hash,
  });

  // Verify file exists with consistency guarantee
  const files = await vana.data.getUserFiles(
    { owner: userAddress },
    {
      minBlock: Number(receipt.blockNumber),
      waitForSync: 30000,
    },
  );

  const uploadedFile = files.find((f) => f.id === uploadResult.fileId);
  if (!uploadedFile) {
    throw new Error("File verification failed");
  }

  return uploadedFile;
}
```

### Pattern 2: Paginated File Browser

```typescript
async function* getUserFilesPaginated(
  owner: string,
  pageSize = 20,
): AsyncGenerator<UserFile[]> {
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const files = await vana.data.getUserFiles(
      { owner: owner as Address },
      {
        limit: pageSize,
        offset,
        orderBy: "addedAtBlock",
        orderDirection: "desc",
      },
    );

    if (files.length > 0) {
      yield files;
      offset += files.length;
      hasMore = files.length === pageSize;
    } else {
      hasMore = false;
    }
  }
}

// Usage
for await (const page of getUserFilesPaginated(userAddress)) {
  console.log(`Processing ${page.length} files`);
  // Process page of files
}
```

### Pattern 3: Quick Recent Files Check

```typescript
// Get just the 5 most recent files without waiting
const recentFiles = await vana.data.getUserFiles(
  { owner: address },
  {
    limit: 5,
    orderBy: "addedAtBlock",
    orderDirection: "desc",
  },
);
```

## Error Handling

### StaleDataError

When subgraph hasn't indexed required blocks:

```typescript
import { StaleDataError } from "@opendatalabs/vana-sdk/utils";

try {
  const files = await vana.data.getUserFiles(
    { owner: address },
    { minBlock: 15000000 }, // Recent block
  );
} catch (error) {
  if (error instanceof StaleDataError) {
    console.log(
      `Subgraph is at block ${error.currentBlock}, need ${error.requiredBlock}`,
    );
    // Option 1: Retry with waiting
    const files = await vana.data.getUserFiles(
      { owner: address },
      {
        minBlock: 15000000,
        waitForSync: 30000, // Wait up to 30s
      },
    );
    // Option 2: Proceed without guarantee
    // Option 3: Show user subgraph is syncing
  }
}
```

## Performance Considerations

1. **Default Limits**: Methods now return max 100 items by default to prevent accidental large fetches
2. **Explicit Fetch All**: Use `fetchAll: true` only when you need all data
3. **Waiting Costs**: `waitForSync` blocks execution - use appropriately
4. **Subgraph Lag**: Typical lag is 15-60 seconds on mainnet

## Gradual Migration Strategy

### Phase 1: Update Critical Paths

Update code that requires consistency first:

- XP/reward verification
- Access control checks
- Financial operations

### Phase 2: Update Transaction Options

Search and replace `gasLimit` with `gas` in transaction options.

### Phase 3: Add Pagination

Update UI components to use pagination instead of fetching all data.

## TypeScript Types

New types available:

```typescript
import type {
  ConsistencyOptions,
  PaginationOptions,
  ListOptions, // Combines both
  DataSource, // 'chain' | 'subgraph' | 'auto'
} from "@opendatalabs/vana-sdk";
```

## Getting Help

- Review the [implementation tests](./src/controllers/__tests__/data-consistency.test.ts)
- Check type definitions in `@opendatalabs/vana-sdk/types/options`
- Report issues at the SDK repository

## Summary

This update makes the SDK more reliable by:

1. Preventing silent data loss from pagination
2. Ensuring consistency for critical operations
3. Aligning with viem transaction standards
4. Providing explicit control over data freshness

The changes are breaking but straightforward to migrate, with most code continuing to work with minor updates.
