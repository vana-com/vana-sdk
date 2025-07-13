# Trusted Server Query Modes

This document explains the dual-mode trusted server query system in the Vana SDK, which supports both subgraph and direct RPC queries.

## Overview

The `getUserTrustedServers()` method now supports three query modes:

- **`subgraph`**: Fast queries via subgraph (requires external subgraph service)
- **`rpc`**: Direct contract queries via RPC (slower but no external dependencies)
- **`auto`**: Smart fallback - tries subgraph first, falls back to RPC if unavailable

## API Usage

### Basic Usage (Auto Mode)

```typescript
// Auto mode - tries subgraph first, falls back to RPC
const result = await vana.data.getUserTrustedServers({
  user: "0x...",
  mode: "auto", // default
});

console.log(`Used ${result.usedMode} mode`);
console.log(`Found ${result.servers.length} trusted servers`);
if (result.warnings) {
  console.log("Warnings:", result.warnings);
}
```

### Subgraph Mode (Fast)

```typescript
// Explicit subgraph mode - fastest but requires subgraph URL
const result = await vana.data.getUserTrustedServers({
  user: "0x...",
  mode: "subgraph",
  subgraphUrl: "https://api.thegraph.com/subgraphs/name/vana/...",
});

// Will throw error if subgraph is unavailable
```

### RPC Mode (No External Dependencies)

```typescript
// Direct RPC mode - slower but always available
const result = await vana.data.getUserTrustedServers({
  user: "0x...",
  mode: "rpc",
  limit: 50, // Pagination support
  offset: 0,
});

console.log(`Total servers: ${result.total}`);
console.log(`Has more: ${result.hasMore}`);
```

## Result Structure

### Unified Result Format

```typescript
interface GetUserTrustedServersResult {
  servers: TrustedServer[]; // Array of trusted servers
  usedMode: "subgraph" | "rpc"; // Which mode was actually used
  total?: number; // Total count (RPC mode only)
  hasMore?: boolean; // Pagination info (RPC mode only)
  warnings?: string[]; // Any warnings or fallback info
}
```

### Server Object Format

```typescript
interface TrustedServer {
  id: string; // Unique identifier
  serverAddress: Address; // Server address (EVM address)
  serverUrl: string; // Server URL
  trustedAt: bigint; // Timestamp when trusted
  user: Address; // User who trusted the server
  trustIndex?: number; // Index in trust list (RPC mode only)
}
```

## Mode Comparison

| Feature             | Subgraph Mode     | RPC Mode        | Auto Mode            |
| ------------------- | ----------------- | --------------- | -------------------- |
| **Speed**           | Fast              | Slower          | Fast with fallback   |
| **Dependencies**    | Requires subgraph | None            | Optional subgraph    |
| **Pagination**      | No\*              | Yes             | Depends on used mode |
| **Total Count**     | No                | Yes             | Yes (RPC only)       |
| **Trust Index**     | No                | Yes             | Yes (RPC only)       |
| **Historical Data** | Rich              | Limited         | Depends on used mode |
| **Reliability**     | External service  | Direct contract | High (fallback)      |

\*Subgraph mode loads all servers at once

## Migration Guide

### From Old API

**Before:**

```typescript
// Old API - only supported subgraph mode
const servers = await vana.data.getUserTrustedServers({
  user: "0x...",
  subgraphUrl: "https://...",
});
// Returns: Array<TrustedServer>
```

**After (Backward Compatible):**

```typescript
// New API with auto mode - backward compatible
const result = await vana.data.getUserTrustedServers({
  user: "0x...",
  mode: "auto", // Optional - defaults to 'auto'
});
// Returns: GetUserTrustedServersResult

// Extract servers array for compatibility
const servers = result.servers;
```

### Choosing the Right Mode

**Use `subgraph` mode when:**

- You have a reliable subgraph endpoint
- You need the fastest possible queries
- You're querying frequently
- You don't need pagination

**Use `rpc` mode when:**

- You want to eliminate external dependencies
- You need pagination support
- Subgraph is unreliable or unavailable
- You need precise trust ordering

**Use `auto` mode when:**

- You want the best of both worlds
- You're building resilient applications
- You want to handle subgraph outages gracefully
- You're unsure which mode to use (recommended default)

## Error Handling

### Mode-Specific Errors

```typescript
try {
  const result = await vana.data.getUserTrustedServers({
    user: "0x...",
    mode: "subgraph",
  });
} catch (error) {
  if (error.message.includes("subgraphUrl is required")) {
    // Handle missing subgraph URL
  } else if (error.message.includes("Subgraph request failed")) {
    // Handle subgraph service errors
  }
}
```

### Auto Mode Error Handling

```typescript
try {
  const result = await vana.data.getUserTrustedServers({
    user: "0x...",
    mode: "auto",
  });

  // Check for warnings about fallback usage
  if (result.warnings) {
    console.warn("Fallback occurred:", result.warnings);
  }
} catch (error) {
  // Only throws if both subgraph AND RPC fail
  console.error("Both query methods failed:", error.message);
}
```

## Performance Considerations

### Subgraph Mode

- **Latency**: ~100-300ms
- **Throughput**: High
- **Caching**: Subgraph-level caching
- **Best for**: Frequent queries, dashboards

### RPC Mode

- **Latency**: ~500-2000ms (depends on server count)
- **Throughput**: Lower
- **Caching**: Contract-level caching
- **Best for**: Occasional queries, critical operations

### Auto Mode

- **Latency**: Subgraph speed + RPC fallback
- **Throughput**: High with graceful degradation
- **Caching**: Best of both
- **Best for**: Production applications

## Demo App Integration

The demo app now includes a query mode selector in the Trusted Server Management section:

1. **Auto (Smart Fallback)**: Default mode with automatic fallback
2. **Subgraph (Fast)**: Direct subgraph queries
3. **RPC (Direct)**: Direct contract queries

Users can switch between modes to see the differences in performance and functionality.

## Advanced Usage

### Pagination with RPC Mode

```typescript
async function getAllTrustedServers(user: Address) {
  const allServers: TrustedServer[] = [];
  let offset = 0;
  const limit = 50;

  do {
    const result = await vana.data.getUserTrustedServers({
      user,
      mode: "rpc",
      limit,
      offset,
    });

    allServers.push(...result.servers);
    offset += limit;

    if (!result.hasMore) break;
  } while (true);

  return allServers;
}
```

### Custom Retry Logic

```typescript
async function getTrustedServersWithRetry(user: Address) {
  // Try subgraph first
  try {
    return await vana.data.getUserTrustedServers({
      user,
      mode: "subgraph",
      subgraphUrl: "https://primary-subgraph.example.com",
    });
  } catch {
    // Try backup subgraph
    try {
      return await vana.data.getUserTrustedServers({
        user,
        mode: "subgraph",
        subgraphUrl: "https://backup-subgraph.example.com",
      });
    } catch {
      // Fall back to RPC
      return await vana.data.getUserTrustedServers({
        user,
        mode: "rpc",
      });
    }
  }
}
```

## Future Considerations

- The SDK team may deprecate one of the modes in the future based on usage patterns
- `auto` mode provides the best migration path for any future changes
- Consider using `auto` mode unless you have specific requirements for a particular mode

## Related Methods

The following methods also support efficient trusted server operations:

- `vana.permissions.getTrustedServersCount()` - Get total count (RPC only)
- `vana.permissions.getTrustedServersPaginated()` - Advanced pagination (RPC only)
- `vana.permissions.checkServerTrustStatus()` - Check individual server trust (RPC only)
- `vana.permissions.getServerInfoBatch()` - Batch server info queries (RPC only)

These methods are available for advanced use cases where you need more control over the query process.
