# Async Operations Standardization Design

## Date: 2025-08-16

## Branch: fix/async-operations-standardization

## Problem Statement

The SDK currently has inconsistent patterns for asynchronous operations:

1. **Server Operations**: Return an operation ID requiring manual polling
   - `createOperation()` returns `{ id: string, ... }`
   - Developer must manually call `getOperation(id)` in a loop
   - No built-in Promise-based abstraction

2. **Transaction Operations**: Return `TransactionHandle` with Promise methods
   - Provides `.waitForReceipt()` and `.waitForEvents()`
   - Clean Promise-based interface
   - Results are memoized for efficiency

This inconsistency creates a poor developer experience and increases complexity.

## Proposed Solution

### Design Principles

1. **Consistency**: All async operations should follow the same pattern
2. **Backward Compatibility**: Existing methods remain functional with deprecation notices
3. **Progressive Enhancement**: Low-level methods available for advanced use cases
4. **Type Safety**: Full TypeScript support with proper generics

### Implementation Pattern

#### For Server Operations

Create new wrapper methods that return Promise-based interfaces:

```typescript
// New high-level method
async createOperationAndWait<T = any>(
  params: CreateOperationParams,
  options?: {
    pollingInterval?: number;  // Default: 1000ms
    timeout?: number;          // Default: 30000ms
  }
): Promise<T> {
  // 1. Create the operation
  const operation = await this.createOperation(params);

  // 2. Poll until complete
  return this.waitForOperation<T>(operation.id, options);
}

// Shared polling utility
async waitForOperation<T = any>(
  operationId: string,
  options?: {
    pollingInterval?: number;
    timeout?: number;
  }
): Promise<T> {
  const startTime = Date.now();
  const timeout = options?.timeout ?? 30000;
  const interval = options?.pollingInterval ?? 1000;

  while (true) {
    const result = await this.getOperation(operationId);

    if (result.status === 'succeeded') {
      return result.output as T;
    }

    if (result.status === 'failed' || result.status === 'canceled') {
      throw new PersonalServerError(
        `Operation ${result.status}: ${result.error || 'Unknown error'}`
      );
    }

    if (Date.now() - startTime > timeout) {
      throw new PersonalServerError(`Operation timed out after ${timeout}ms`);
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }
}
```

#### Method Deprecation Strategy

```typescript
/**
 * @deprecated Use createOperationAndWait() for automatic polling
 * This method will be removed in v2.0.0
 */
async createOperation(params: CreateOperationParams): Promise<CreateOperationResponse> {
  // Existing implementation
}
```

### API Changes

#### ServerController

| Current Method      | New Method                 | Behavior                                             |
| ------------------- | -------------------------- | ---------------------------------------------------- |
| `createOperation()` | `createOperationAndWait()` | Creates operation and polls to completion            |
| `getOperation()`    | `waitForOperation()`       | Polls existing operation to completion               |
| -                   | `createOperationHandle()`  | Returns OperationHandle similar to TransactionHandle |

#### OperationHandle (New Class)

Similar to TransactionHandle but for server operations:

```typescript
class OperationHandle<T = any> {
  constructor(
    private readonly controller: ServerController,
    public readonly id: string,
  ) {}

  async waitForResult(options?: PollingOptions): Promise<T> {
    return this.controller.waitForOperation<T>(this.id, options);
  }

  async getStatus(): Promise<OperationStatus> {
    const result = await this.controller.getOperation(this.id);
    return result.status;
  }

  async cancel(): Promise<void> {
    return this.controller.cancelOperation(this.id);
  }
}
```

## Migration Path

### Phase 1: Add New Methods (v1.1.0)

- Implement new Promise-based methods
- Add @deprecated JSDoc tags to old methods
- Update documentation with migration examples

### Phase 2: Default to New Methods (v1.2.0)

- Update all examples to use new methods
- Add console warnings when deprecated methods are used
- Provide codemod script for automatic migration

### Phase 3: Remove Old Methods (v2.0.0)

- Remove deprecated methods
- Clean up internal code
- Final documentation update

## Benefits

1. **Improved DX**: Developers can use async/await without manual polling
2. **Consistency**: All async operations follow the same pattern
3. **Type Safety**: Better TypeScript inference with generics
4. **Error Handling**: Centralized error handling for timeouts and failures
5. **Flexibility**: Both high-level and low-level APIs available

## Example Usage

### Before

```typescript
// Manual polling required
const operation = await vana.server.createOperation({ permissionId: 123 });

let result;
while (true) {
  result = await vana.server.getOperation(operation.id);
  if (result.status === "succeeded" || result.status === "failed") {
    break;
  }
  await new Promise((r) => setTimeout(r, 1000));
}

if (result.status === "failed") {
  throw new Error(result.error);
}

console.log(result.output);
```

### After

```typescript
// Automatic polling with Promise
const result = await vana.server.createOperationAndWait({
  permissionId: 123,
});
console.log(result);

// Or with custom options
const result = await vana.server.createOperationAndWait(
  { permissionId: 123 },
  { pollingInterval: 2000, timeout: 60000 },
);

// Or using handle for more control
const handle = await vana.server.createOperationHandle({ permissionId: 123 });
console.log(`Operation ID: ${handle.id}`);

// Can check status
const status = await handle.getStatus();
if (status === "processing") {
  // Can cancel if needed
  await handle.cancel();
} else {
  // Wait for result
  const result = await handle.waitForResult();
  console.log(result);
}
```

## Testing Strategy

1. **Unit Tests**: Test polling logic with mocked responses
2. **Integration Tests**: Test against real server with various scenarios
3. **Timeout Tests**: Verify timeout behavior
4. **Cancellation Tests**: Test operation cancellation
5. **Backward Compatibility**: Ensure old methods still work
