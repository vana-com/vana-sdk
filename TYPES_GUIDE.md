# **Vana SDK TypeScript Types Guide**

**Objective:** To establish clear, consistent TypeScript patterns that prioritize simplicity, explicitness, and maintainability while avoiding the accumulation of type workarounds that become technical debt.

## 1. Core Philosophy: Simple Data, Explicit Boundaries

Following Rich Hickey's philosophy of simplicity:

- **Data is simple.** Types should describe data shapes, not encode business logic.
- **Effects happen at the edges.** Complex library types belong behind interfaces.
- **Make the implicit explicit.** No magic type inference where clarity suffers.
- **Fail at compile time.** If we can't guarantee type safety, we make that explicit.

## 2. The Type Assertion Hierarchy

From best to worst, with clear guidance on when each is acceptable:

### ✅ **Level 1: No Assertions Needed** (Always Prefer)

```typescript
// BEST: Let TypeScript infer or use explicit types
const result = await vana.data.getUserFiles({ user: address });
const files: UserFile[] = result;

// BEST: Use proper generic types
function processResult<T>(data: T): ProcessedData<T> {
  return { processed: true, data };
}
```

### ✅ **Level 2: Utility Types** (Recommended)

```typescript
// GOOD: Partial for test objects
const mockChain: Partial<Chain> = { id: 1, name: 'test' };

// GOOD: Indexed access for property types
transport: {} as PublicClient['transport']

// GOOD: Extract return types from functions
type EncryptResult = Awaited<ReturnType<typeof openpgp.encrypt>>;

// GOOD: Pick specific properties
type UserIdentity = Pick<User, 'id' | 'address' | 'publicKey'>;

// GOOD: Omit sensitive properties
type PublicUser = Omit<User, 'privateKey' | 'mnemonic'>;
```

### ⚠️ **Level 3: Unknown with Guards** (Acceptable)

```typescript
// ACCEPTABLE: When dealing with external data
function processExternalData(data: unknown): UserFile {
  if (!isUserFile(data)) {
    throw new TypeError("Invalid user file format");
  }
  return data; // Now properly typed
}

// Type guard implementation
function isUserFile(value: unknown): value is UserFile {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "url" in value
  );
}
```

### ⚠️ **Level 4: Satisfies Operator** (Use Sparingly)

```typescript
// ACCEPTABLE: For const assertions with type checking
const config = {
  apiUrl: "https://api.vana.org",
  timeout: 5000,
} as const satisfies Config;

// ACCEPTABLE: For ensuring object literals match interface
const permissions = {
  read: true,
  write: false,
} satisfies Record<string, boolean>;
```

### ❌ **Level 5: As Type** (Avoid)

```typescript
// AVOID: Only when absolutely necessary with comment
const mockTransport = {} as Transport; // TODO: Create proper transport mock

// NEVER: Don't cascade type assertions
const result = (data as any).property as SomeType; // ❌ Double assertion
```

### ☠️ **Level 6: As Any/Never** (Forbidden)

```typescript
// FORBIDDEN: These bypass all type checking
someFunction(data as any); // ❌ Complete type erasure
mockFunction.mockResolvedValue(result as never); // ❌ Nonsensical type
```

## 3. Patterns for Common Scenarios

### Testing: Mock Creation

```typescript
// ❌ BAD: Type assertion workaround
const mockClient = {
  getChainId: vi.fn().mockResolvedValue(1),
} as any as WalletClient;

// ✅ GOOD: Factory with proper types
export function createMockWalletClient(
  overrides?: Partial<WalletClient>,
): WalletClient {
  return {
    account: createMockAccount(),
    chain: mainnet,
    mode: "wallet",
    transport: {} as WalletClient["transport"], // Complex unused property
    getChainId: vi.fn().mockResolvedValue(1),
    ...overrides,
  } as WalletClient;
}
```

### Testing: Library Mocking

```typescript
// ❌ BAD: Fighting with library types
vi.mocked(openpgp.encrypt).mockResolvedValue("encrypted" as never);

// ✅ GOOD: Port pattern with clean interface
interface PgpPort {
  encrypt(input: PgpEncryptInput): Promise<PgpResult>;
}

class FakePgpPort implements PgpPort {
  async encrypt(input: PgpEncryptInput): Promise<PgpResult> {
    return { data: `encrypted:${input.text}` };
  }
}
```

### Global Manipulation

```typescript
// ❌ BAD: Loose typing
(global as any).Buffer = undefined;

// ⚠️ ACCEPTABLE: Explicit about what we're doing
Reflect.deleteProperty(global, "Buffer");

// ✅ GOOD: Type-safe global extension
declare global {
  var Buffer: typeof Buffer | undefined;
}
global.Buffer = undefined;
```

### Complex Library Types

```typescript
// ❌ BAD: Wrestling with viem's transaction types
const tx = result as TransactionResult<never, never>;

// ✅ GOOD: Create domain-specific types
interface PendingTransaction {
  hash: Hash;
  wait(): Promise<TransactionReceipt>;
}

function toPendingTransaction(result: unknown): PendingTransaction {
  // Validate and transform
}
```

## 4. Test Mocking Strategies

Testing is where type assertions most commonly appear. Here's the hierarchy of solutions:

### Level 1: Use Vitest's Built-in Type Support

```typescript
// ✅ BEST: Let vi.mocked handle the types
import { openpgp } from "openpgp";

vi.mock("openpgp");

// vi.mocked preserves all type information
vi.mocked(openpgp.encrypt).mockResolvedValue(mockEncryptedMessage);
```

### Level 2: Create Test Fakes (No Mocking Needed)

```typescript
// ✅ EXCELLENT: Fake implementations instead of mocks
class FakeStorageService implements StoragePort {
  private files = new Map<string, Uint8Array>();

  async upload(data: Uint8Array): Promise<string> {
    const id = `file-${this.files.size + 1}`;
    this.files.set(id, data);
    return id;
  }

  async download(id: string): Promise<Uint8Array> {
    const data = this.files.get(id);
    if (!data) throw new Error("File not found");
    return data;
  }
}

// Usage in tests - no mocking needed!
const storage = new FakeStorageService();
const controller = new DataController({ storage });
```

### Level 3: Mock Factories with Proper Types

```typescript
// ✅ GOOD: Centralized mock creation
export function createMockPublicClient(
  overrides?: Partial<PublicClient>,
): PublicClient {
  const base: PublicClient = {
    // Required properties with test defaults
    chain: mainnet,
    transport: {} as PublicClient["transport"], // Complex, unused in tests

    // Methods with default implementations
    getBlockNumber: vi.fn().mockResolvedValue(BigInt(1000)),
    getTransaction: vi.fn(),

    // Allow overrides for specific tests
    ...overrides,
  };

  return base;
}

// Usage - type-safe and reusable
const client = createMockPublicClient({
  getBlockNumber: vi.fn().mockResolvedValue(BigInt(2000)),
});
```

### Level 4: Partial Mocks for Complex Objects

```typescript
// ⚠️ ACCEPTABLE: When you only need part of an interface
type MockedMethods<T, K extends keyof T> = Pick<T, K> & {
  [P in K]: T[P] extends (...args: any[]) => any ? Mock : T[P];
};

function createPartialMock<T, K extends keyof T>(
  methods: K[],
): MockedMethods<T, K> {
  const mock = {} as MockedMethods<T, K>;
  for (const method of methods) {
    (mock as any)[method] = vi.fn();
  }
  return mock;
}

// Usage
const mockClient = createPartialMock<WalletClient>([
  "getChainId",
  "writeContract",
]);
```

### When Mocking External Libraries

```typescript
// ❌ BAD: Fighting with library types
vi.mock("viem", () => ({
  createWalletClient: vi.fn().mockReturnValue({
    // Trying to mock entire client...
  } as any), // Give up and use any
}));

// ✅ GOOD: Mock only what you use
vi.mock("viem", async () => {
  const actual = await vi.importActual("viem");
  return {
    ...actual,
    createWalletClient: vi.fn(() => createMockWalletClient()),
  };
});

// ✅ BETTER: Use dependency injection
class MyService {
  constructor(private clientFactory: () => WalletClient = createWalletClient) {}
}

// In tests, inject mock factory
const service = new MyService(() => createMockWalletClient());
```

### Testing Without Mocking (Preferred)

```typescript
// ✅ BEST: Real objects with test data
describe("UserFile processing", () => {
  it("should process valid files", () => {
    // Create real objects - no mocking needed
    const file: UserFile = {
      id: 1,
      url: "https://example.com/file.json",
      owner: "0x123...",
      encrypted: false,
    };

    const result = processUserFile(file);
    expect(result.processed).toBe(true);
  });
});

// ✅ BEST: Use test builders for complex objects
const file = new UserFileBuilder().withOwner("0x456...").encrypted().build();
```

### Mock Type Helpers

```typescript
// Create a dedicated test types file
// src/tests/types.ts

import type { Mock } from "vitest";

// Helper to mock async functions with proper types
export type MockAsync<T extends (...args: any[]) => Promise<any>> = Mock<
  Parameters<T>,
  ReturnType<T>
>;

// Helper to deeply mock an object
export type DeepMocked<T> = {
  [P in keyof T]: T[P] extends (...args: any[]) => any
    ? Mock<Parameters<T[P]>, ReturnType<T[P]>>
    : T[P] extends object
      ? DeepMocked<T[P]>
      : T[P];
};

// Usage
type MockedClient = DeepMocked<WalletClient>;
```

## 5. Architectural Solutions to Type Problems

### Problem: Complex External Library Types

**Solution: Port/Adapter Pattern**

```typescript
// Define simple port interface
interface StoragePort {
  upload(data: Uint8Array): Promise<string>;
  download(url: string): Promise<Uint8Array>;
}

// Implement adapter hiding library complexity
class IpfsStorageAdapter implements StoragePort {
  constructor(private ipfs: IPFSClient) {}

  async upload(data: Uint8Array): Promise<string> {
    // Hide all IPFS type complexity here
    const result = await this.ipfs.add(data);
    return result.path;
  }
}
```

### Problem: Test Data Creation

**Solution: Builder Pattern**

```typescript
class UserFileBuilder {
  private file: Partial<UserFile> = {};

  withId(id: number): this {
    this.file.id = id;
    return this;
  }

  withUrl(url: string): this {
    this.file.url = url;
    return this;
  }

  build(): UserFile {
    return {
      id: this.file.id ?? 1,
      url: this.file.url ?? "https://example.com/file",
      // ... other required fields with defaults
    };
  }
}

// Usage
const file = new UserFileBuilder()
  .withId(42)
  .withUrl("https://ipfs.io/...")
  .build();
```

### Problem: Discriminated Union Handling

**Solution: Exhaustive Pattern Matching**

```typescript
type Result<T> =
  | { status: "success"; data: T }
  | { status: "error"; error: Error }
  | { status: "pending" };

function handleResult<T>(result: Result<T>): string {
  switch (result.status) {
    case "success":
      return `Success: ${JSON.stringify(result.data)}`;
    case "error":
      return `Error: ${result.error.message}`;
    case "pending":
      return "Operation pending...";
    default:
      // TypeScript ensures this is unreachable
      const _exhaustive: never = result;
      throw new Error(`Unhandled case: ${_exhaustive}`);
  }
}
```

## 5. Type Documentation Standards

### Document Non-Obvious Types

```typescript
/**
 * Permission ID as bigint for blockchain compatibility.
 * Convert from number using BigInt(fileId).
 */
type PermissionId = bigint;

/**
 * User address in checksummed format (0x prefixed, 42 chars).
 * @example "0x742d35Cc6634c0532925a3b844Bc9e8e1ee3b2De"
 */
type UserAddress = `0x${string}`;
```

### Use Type Aliases for Clarity

```typescript
// ❌ BAD: Inline complex types
function process(
  data: Array<{ id: number; meta: Record<string, unknown> }>,
): Promise<{ success: boolean; results: Array<{ id: number }> }> {
  // ...
}

// ✅ GOOD: Named types for clarity
type DataItem = {
  id: number;
  meta: Record<string, unknown>;
};

type ProcessResult = {
  success: boolean;
  results: Array<{ id: number }>;
};

function process(data: DataItem[]): Promise<ProcessResult> {
  // ...
}
```

## 6. Migration Strategy

When fixing type assertions in existing code:

1. **Identify the Root Cause**
   - Is this a mocking problem? → Use port pattern
   - Is this a data creation problem? → Use builder/factory
   - Is this a library type problem? → Create adapter

2. **Apply the Smallest Fix First**
   - Can you use `Partial<T>`? → Do it
   - Can you use indexed access? → Do it
   - Can you extract the return type? → Do it

3. **Document When You Can't Fix**
   ```typescript
   // TODO(TYPES): Complex viem type - needs port pattern
   transport: {} as any,
   ```

## 7. Type Testing

### Test Your Type Guards

```typescript
describe("Type Guards", () => {
  describe("isUserFile", () => {
    it("should accept valid user files", () => {
      const valid = { id: 1, url: "https://example.com" };
      expect(isUserFile(valid)).toBe(true);
    });

    it("should reject invalid data", () => {
      expect(isUserFile(null)).toBe(false);
      expect(isUserFile({})).toBe(false);
      expect(isUserFile({ id: "not-a-number" })).toBe(false);
    });
  });
});
```

### Test Generic Constraints

```typescript
// Ensure your generics work with expected types
type TestSubject = ProcessResult<UserFile>;
type TestConstraint = ProcessResult<string>; // Should also work

// Use type-level tests
type _TestExtends = UserFile extends DataItem ? true : false;
const _testExtends: _TestExtends = true; // Compile-time assertion
```

## 8. Common Anti-Patterns to Avoid

### ❌ Double Assertions

```typescript
// NEVER DO THIS
const result = (data as any).property as SpecificType;

// DO THIS INSTEAD
function getProperty(data: unknown): SpecificType {
  // Validate and return with proper type
}
```

### ❌ String Type Parameters

```typescript
// AVOID
type Container<T extends string> = {
  type: T;
  data: T extends "user" ? User : T extends "file" ? File : never;
};

// PREFER: Discriminated unions
type Container = { type: "user"; data: User } | { type: "file"; data: File };
```

### ❌ Excessive Generics

```typescript
// AVOID: Over-engineering
function process<T extends U, U extends V, V extends object>(
  data: T,
): Result<T, U, V> {}

// PREFER: Simple and clear
function process<T extends DataItem>(data: T): ProcessResult<T> {}
```

## 9. Enforcement Through Tooling

### ESLint Rules

```json
{
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/no-unsafe-assignment": "error",
  "@typescript-eslint/no-unsafe-member-access": "error",
  "@typescript-eslint/no-unsafe-call": "error",
  "@typescript-eslint/no-unsafe-return": "error",
  "@typescript-eslint/no-unnecessary-type-assertion": "error",
  "@typescript-eslint/consistent-type-assertions": [
    "error",
    {
      "assertionStyle": "as",
      "objectLiteralTypeAssertions": "never"
    }
  ]
}
```

### TypeScript Config

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "useUnknownInCatchVariables": true,
    "noUncheckedIndexedAccess": true
  }
}
```

## 10. Decision Framework

When encountering a type problem, ask in order:

1. **Can I avoid the assertion entirely?**
   - Let TypeScript infer
   - Use proper initialization

2. **Can I use a utility type?**
   - `Partial<T>`, `Required<T>`, `Pick<T, K>`
   - `ReturnType<T>`, `Awaited<T>`
   - `T['property']` indexed access

3. **Can I create an abstraction?**
   - Port interface
   - Factory function
   - Builder pattern

4. **Can I use unknown with validation?**
   - Type guard
   - Runtime validation
   - Zod schema

5. **Must I use a type assertion?**
   - Document why
   - Create tech debt ticket
   - Add TODO comment

## Remember: Types Serve the Code, Not the Other Way Around

The goal is not type perfection but code that is:

- **Correct**: Catches real errors at compile time
- **Clear**: Types document intent
- **Maintainable**: Next developer can understand and modify
- **Simple**: No clever type gymnastics

When in doubt, choose the simpler type that provides adequate safety over the complex type that provides theoretical perfection.

---

_"It is better to have 100 functions operate on one data structure than 10 functions on 10 data structures."_ - Alan Perlis

Keep your types simple, your data explicit, and your boundaries clear.
