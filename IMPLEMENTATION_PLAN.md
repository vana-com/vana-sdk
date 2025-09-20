# Technical Implementation Plan: Client-Side Asynchronous Relayer Abstraction

## Executive Summary

We're implementing a fully abstracted client-side polling mechanism for the Vana SDK that transforms the developer experience from manual operation tracking to a simple `await` pattern. This builds upon the server-side stateful relayer foundation in PR #102 and incorporates production learnings from Ton-Chanh's implementation.

## Current Architecture Analysis

### What Already Exists (PR #102)

1. **Server-side Foundation**
   - `IOperationStore` interface for state persistence
   - `OperationState` data structure for tracking lifecycle
   - `handleRelayerOperation` server handler
   - `status_check` type already in `UnifiedRelayerRequest` (line 359-362 in relayer.ts)

2. **Production Implementation (Ton-Chanh's PR)**
   - Redis-based nonce management with distributed locking
   - Retry logic with configurable attempts (MAX_RELAY_RETRY_ATTEMPTS=3)
   - Lock acquisition with timeout handling (RELAY_NONCE_LOCK_TTL=5s)
   - Successful production deployment with XP reward integration

3. **Key Performance Constraints**
   - P99 latency: 2-5 minutes under load
   - Throughput: ~1-2 users/second
   - Queue position tracking required for UX
   - Polling must not degrade server (learned from crashes)

## Implementation Phases

### Phase 1: Core Polling Infrastructure

#### 1.1 PollingManager Class (`packages/vana-sdk/src/core/pollingManager.ts`)

**Purpose**: Internal service managing all polling operations with exponential backoff

**Key Features**:

```typescript
interface PollingOptions {
  timeout?: number; // Default: 300000ms (5 min)
  initialInterval?: number; // Default: 1000ms
  maxInterval?: number; // Default: 10000ms
  backoffMultiplier?: number; // Default: 1.5
  jitter?: number; // Default: 0.2 (20%)
}

interface PollingContext {
  operationId: string;
  signal?: AbortSignal;
  onStatusUpdate?: (status: OperationStatus) => void;
  relayerCallback: (
    request: UnifiedRelayerRequest,
  ) => Promise<UnifiedRelayerResponse>;
}
```

**Critical Implementation Details**:

- Must handle browser tab closure gracefully
- AbortSignal integration for cancellation
- Network error retry vs terminal failure distinction
- Memory leak prevention with proper cleanup

#### 1.2 Exponential Backoff Algorithm

Based on production findings:

```
Initial: 1000ms
Sequence: 1s → 1.5s → 2.25s → 3.375s → 5s → 7.5s → 10s (max)
With 20% jitter: Prevents thundering herd
```

### Phase 2: Request/Response Contract Updates

#### 2.1 Enhanced UnifiedRelayerRequest

- ✅ Already has `status_check` type (line 359-362)
- No additional changes needed

#### 2.2 Server Handler Updates (`packages/vana-sdk/src/server/relayerHandler.ts`)

**Add status_check handling**:

```typescript
case "status_check": {
  const { operationId } = request;

  // 1. Check operation store
  const state = await operationStore.get(operationId);
  if (!state) {
    return { type: "error", error: "Operation not found" };
  }

  // 2. For pending/submitted states, check on-chain
  if (state.status === "submitted" && state.transactionHash) {
    const receipt = await publicClient.getTransactionReceipt({
      hash: state.transactionHash
    });

    if (receipt) {
      // Update store and return confirmed
      await operationStore.update(operationId, {
        status: "confirmed",
        receipt
      });
      return {
        type: "confirmed",
        hash: state.transactionHash,
        receipt
      };
    }
  }

  // 3. Return current state
  return mapStateToResponse(state);
}
```

### Phase 3: SDK Method Integration

#### 3.1 Enhanced TransactionOptions (`packages/vana-sdk/src/types/operations.ts`)

```typescript
export interface TransactionOptions {
  // Existing options...
  nonce?: number;
  gasLimit?: bigint;

  // New polling options
  signal?: AbortSignal;
  onStatusUpdate?: (status: OperationStatus) => void;
  pollingOptions?: Partial<PollingOptions>;
}

export type OperationStatus =
  | { type: "pending"; operationId: string }
  | { type: "queued"; position: number; estimatedWait?: number }
  | { type: "processing" }
  | { type: "submitted"; hash: Hash }
  | { type: "confirmed"; receipt: TransactionReceipt }
  | { type: "failed"; error: string; operationId?: string };
```

#### 3.2 Modified High-Level Methods

**Example: permissions.grant()**

```typescript
async grant(params: GrantParams, options?: TransactionOptions): Promise<PermissionGrantResult> {
  // 1. Create and sign as before
  const { typedData, signature } = await this.createAndSign(...);

  // 2. Submit via relayer
  const response = await this.context.relayer({
    type: "signed",
    operation: "submitAddPermission",
    typedData,
    signature
  });

  // 3. NEW: Handle async operations
  if (response.type === "pending") {
    const pollingManager = new PollingManager(this.context.relayer);

    return await pollingManager.startPolling({
      operationId: response.operationId,
      signal: options?.signal,
      onStatusUpdate: options?.onStatusUpdate,
      ...options?.pollingOptions
    });
  }

  // 4. Handle immediate responses (backward compat)
  if (response.type === "signed" || response.type === "submitted") {
    return { hash: response.hash, /* legacy format */ };
  }

  throw new RelayerError(response.error);
}
```

### Phase 4: Error Handling & Resilience

#### 4.1 TransactionPendingError (`packages/vana-sdk/src/errors.ts`)

```typescript
export class TransactionPendingError extends Error {
  public readonly operationId: string;
  public readonly lastKnownStatus?: OperationStatus;

  constructor(
    operationId: string,
    message: string,
    lastKnownStatus?: OperationStatus,
  ) {
    super(message);
    this.name = "TransactionPendingError";
    this.operationId = operationId;
    this.lastKnownStatus = lastKnownStatus;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      operationId: this.operationId,
      lastKnownStatus: this.lastKnownStatus,
    };
  }
}
```

**Recovery Pattern**:

```typescript
try {
  const result = await vana.permissions.grant(...);
} catch (error) {
  if (error instanceof TransactionPendingError) {
    // Save operationId for later recovery
    localStorage.setItem('pending_tx', error.operationId);
    // User can check status later
  }
}
```

### Phase 5: Testing Strategy

#### 5.1 Unit Tests

- PollingManager backoff calculation
- AbortSignal handling
- Network error retry logic
- Status transition state machine

#### 5.2 Integration Tests

- End-to-end flow with mock relayer
- Timeout scenarios
- Cancellation mid-flight
- Recovery from TransactionPendingError

#### 5.3 Load Testing Considerations

Based on Ton-Chanh's findings:

- Test with 500+ concurrent operations
- Verify backoff prevents server overload
- Measure memory usage over long polling sessions

### Phase 6: Documentation & Migration

#### 6.1 Developer Guide

```typescript
// Simple usage
const result = await vana.permissions.grant({
  grantee: '0x...',
  files: [1, 2, 3]
});

// With progress updates
const result = await vana.permissions.grant({
  grantee: '0x...',
  files: [1, 2, 3]
}, {
  onStatusUpdate: (status) => {
    if (status.type === 'queued') {
      setMessage(`Queue position: ${status.position}`);
    }
  }
});

// With cancellation
const controller = new AbortController();
const promise = vana.permissions.grant({...}, {
  signal: controller.signal
});

// Cancel after 30 seconds
setTimeout(() => controller.abort(), 30000);
```

#### 6.2 Migration Path

1. Existing code continues to work (backward compatible)
2. New async behavior opt-in via relayer configuration
3. Clear deprecation path for manual polling

## Implementation Order

1. **Start with PollingManager** - Core infrastructure
2. **Add server status_check handler** - Enable polling
3. **Update one method (grant)** - Prove the pattern
4. **Add error handling** - Make it resilient
5. **Write comprehensive tests** - Ensure reliability
6. **Update all methods** - Complete the feature
7. **Document thoroughly** - Enable adoption

## Success Metrics

1. **Developer Experience**
   - Zero manual polling code required
   - Clear progress feedback available
   - Graceful error recovery possible

2. **Performance**
   - No server degradation under load
   - Memory usage stable over long sessions
   - Cancellation response < 100ms

3. **Reliability**
   - 99.9% successful transaction tracking
   - Zero orphaned operations
   - Full recovery from network interruptions

## Risk Mitigation

1. **Browser Memory Leaks**
   - Implement cleanup in PollingManager destructor
   - Use WeakMap for callback references
   - Test with Chrome DevTools Memory Profiler

2. **Server Overload**
   - Exponential backoff mandatory
   - Rate limiting on server side
   - Circuit breaker pattern for failures

3. **Network Interruptions**
   - Distinguish transient vs terminal errors
   - Preserve operationId for recovery
   - Implement reconnection logic

## Notes from Production (Ton-Chanh's Implementation)

### What Works Well

- Redis-based nonce management with locks
- Retry with exponential backoff
- Separation of revert errors from network errors
- XP tracking integration

### What to Avoid

- Fixed interval polling (causes server degradation)
- Synchronous nonce assignment (causes conflicts)
- Missing operation IDs (prevents recovery)
- Tight coupling to specific infrastructure (Redis)

## Next Steps

1. Create branch `feat/client-side-polling`
2. Implement PollingManager with tests
3. Update server handler for status checks
4. Modify permissions.grant() as proof of concept
5. Get early feedback on API design
6. Complete remaining methods
7. Performance testing under load
8. Documentation and examples
9. Release as minor version bump
