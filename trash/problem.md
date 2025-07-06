# Test Coverage Challenge: Reaching 100% Branch Coverage

## Problem Summary

We have a TypeScript SDK with **99.53% branch coverage** in our test suite but are stuck on the final **3 uncovered branches** needed to reach 100%. These represent `instanceof Error` checks in catch blocks where we cannot trigger the false branch.

## What We're Trying to Achieve

**Goal**: Reach 100% branch coverage by testing the false branch of `instanceof Error` checks in error handling code.

**Current**: 99.53% branch coverage (554 passing tests)  
**Target**: 100.00% branch coverage  
**Remaining**: 3 specific uncovered branches

## The Technical Challenge

We need to create test cases where **non-Error objects** (strings, objects, null, etc.) are caught in specific catch blocks, rather than Error instances. This would trigger the false branch of `error instanceof Error` conditionals.

### Example Pattern

```typescript
// This is the pattern we need to test
function someMethod() {
  try {
    // Some operation that could throw
    await fetch("https://api.example.com");
  } catch (error) {
    // We can easily test when error IS an Error (true branch)
    // But we need to test when error is NOT an Error (false branch)
    throw new CustomError(
      `Message: ${error instanceof Error ? error.message : "Unknown error"}`,
      //                                                    ↑
      //                              This branch is uncovered
    );
  }
}
```

## Specific Code Locations

### Location 1: Pinata Storage List Method

```typescript
async list(options?: StorageListOptions): Promise<StorageFile[]> {
  try {
    const params = new URLSearchParams({
      status: "pinned",
      pageLimit: (options?.limit || 10).toString(),
    });

    const response = await fetch(`${this.apiUrl}/data/pinList?${params}`, {
      headers: { Authorization: `Bearer ${this.config.jwt}` },
    });

    if (!response.ok) {
      throw new StorageError(`Failed to list files: ${await response.text()}`);
    }

    const result = await response.json();
    return result.rows.map((pin: any) => ({
      id: pin.ipfs_pin_hash,
      name: pin.metadata?.name || "Unnamed",
      // ... more mapping
    }));
  } catch (error) {
    if (error instanceof StorageError) {
      throw error;
    }
    throw new StorageError(
      `Pinata list error: ${error instanceof Error ? error.message : "Unknown error"}`, // ← UNCOVERED
      "LIST_ERROR",
      "pinata",
    );
  }
}
```

### Location 2: Pinata Storage Delete Method

```typescript
async delete(url: string): Promise<boolean> {
  try {
    const ipfsHash = this.extractIPFSHash(url);
    if (!ipfsHash) {
      throw new StorageError("Invalid IPFS URL format");
    }

    const response = await fetch(`${this.apiUrl}/pinning/unpin/${ipfsHash}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.config.jwt}` },
    });

    if (!response.ok && response.status !== 404) {
      throw new StorageError(`Failed to delete: ${await response.text()}`);
    }

    return true;
  } catch (error) {
    if (error instanceof StorageError) {
      throw error;
    }
    throw new StorageError(
      `Pinata delete error: ${error instanceof Error ? error.message : "Unknown error"}`, // ← UNCOVERED
      "DELETE_ERROR",
      "pinata",
    );
  }
}
```

### Location 3: Grant File Retrieval Function

```typescript
export async function retrieveGrantFile(grantUrl: string): Promise<GrantFile> {
  try {
    // Extract IPFS hash from URL
    const ipfsHash = grantUrl.startsWith("ipfs://")
      ? grantUrl.replace("ipfs://", "")
      : grantUrl;

    // Try multiple IPFS gateways
    const gateways = [
      `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
      `https://ipfs.io/ipfs/${ipfsHash}`,
      `https://cloudflare-ipfs.com/ipfs/${ipfsHash}`,
    ];

    for (const gatewayUrl of gateways) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Request timeout")), 10000);
        });

        const response = await Promise.race([
          fetch(gatewayUrl),
          timeoutPromise,
        ]);

        if (response.ok) {
          const text = await response.text();
          const grantFile = JSON.parse(text);
          if (validateGrantFile(grantFile)) {
            return grantFile;
          }
        }
      } catch (gatewayError) {
        console.warn(`Gateway ${gatewayUrl} failed:`, gatewayError);
        continue; // Try next gateway
      }
    }

    throw new NetworkError(
      `Failed to retrieve grant file from any IPFS gateway: ${grantUrl}`,
    );
  } catch (error) {
    if (error instanceof NetworkError) {
      throw error;
    }
    throw new NetworkError(
      `Error retrieving grant file: ${error instanceof Error ? error.message : "Unknown error"}`, // ← UNCOVERED
      error as Error,
    );
  }
}
```

## Testing Framework Context

- **Framework**: Vitest v3.2.4
- **Coverage Tool**: V8 coverage provider
- **Language**: TypeScript/JavaScript (Node.js environment)
- **Mocking**: Vitest's built-in mocking (`vi.fn()`, `vi.spyOn()`, etc.)

## What We've Attempted

### Strategy 1: Mock fetch() to throw non-Error

```typescript
global.fetch = vi.fn().mockImplementation(() => {
  throw "Network connection failed"; // Non-Error string
});
```

**Result**: Tests pass but branches remain uncovered

### Strategy 2: Mock constructors to throw non-Error

```typescript
global.URLSearchParams = class extends URLSearchParams {
  constructor(init?: any) {
    if (init && typeof init === "object" && init.status === "pinned") {
      throw "URLSearchParams construction failed"; // Non-Error string
    }
    super(init);
  }
} as any;
```

**Result**: Tests pass but branches remain uncovered

### Strategy 3: Mock internal methods to throw non-Error

```typescript
(storageInstance as any).extractIPFSHash = vi.fn().mockImplementation(() => {
  throw "Hash extraction failed"; // Non-Error string
});
```

**Result**: Tests pass but branches remain uncovered

### Strategy 4: Mock prototype methods

```typescript
String.prototype.startsWith = function (searchString: string) {
  if (this.toString() === "ipfs://QmTestHash" && searchString === "ipfs://") {
    throw "URL processing failed"; // Non-Error string
  }
  return originalStartsWith.call(this, searchString);
};
```

**Result**: Tests pass but branches remain uncovered

## Constraints

1. **Cannot modify source code** - only add tests
2. **Must maintain existing tests** - all 554 tests must continue passing
3. **Standard testing practices** - no hacky workarounds that would break in CI/CD
4. **Framework limitations** - must work with Vitest/V8 coverage

## Technical Questions

1. **Exception propagation**: Do JavaScript engines or testing frameworks automatically convert non-Error throws to Error objects?

2. **Nested try-catch**: Could inner try-catch blocks be catching our non-Error exceptions before they reach the target catch blocks?

3. **Mock timing**: Are our mocks being applied at the right time in the execution flow?

4. **Coverage tool behavior**: Does V8 coverage consider these branches differently than we expect?

5. **Alternative approaches**: Are there other ways to force non-Error exceptions into these specific catch blocks?

## Success Criteria

Create test cases that achieve **100% branch coverage** by triggering the false branch of the 3 `instanceof Error` checks, without breaking any existing functionality.

**Deliverable**: Working test code that can be added to the existing test suite to achieve 100% coverage.

## Additional Context

This is part of a TypeScript SDK for blockchain operations. The uncovered branches represent defensive error handling for edge cases where non-standard exceptions might be thrown by external APIs, network operations, or JavaScript runtime edge cases.

The team has already achieved significant progress (94.29% → 99.53% coverage) but these final 3 branches represent a specific technical challenge around JavaScript exception handling in test environments.
