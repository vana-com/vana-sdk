# Test Output Strategy

This document explains the simple test output strategy implemented in the Vana SDK test suite.

## Overview

The test output strategy is simple: **all tests run silently by default**. Console output is automatically mocked during tests to keep output clean.

## How It Works

- **Automatic silencing**: Console methods (`console.log`, `console.warn`, etc.) are automatically mocked to `vi.fn()` during tests
- **Clean output**: No console noise during test runs
- **Preserved functionality**: Console methods can still be spied on for assertions if needed

## Usage

### Silent Tests (Default)

All tests run silently by default:

```typescript
it("should encrypt data correctly", async () => {
  const result = await encryptData(testData);
  expect(result).toBeDefined();
  // No console output - clean test output
});
```

### Testing Console Output

If you need to verify that code calls console methods:

```typescript
import { consoleMocks } from "./setup";

it("should log appropriate messages", async () => {
  await someFunctionThatLogs();

  const logCalls = consoleMocks.getLogCalls();
  expect(logCalls).toHaveLength(1);
  expect(logCalls[0][0]).toBe("Expected message");
});
```

## Best Practices

### ✅ Do

- Write tests that use proper assertions instead of console.log
- Use `consoleMocks` utilities if you need to verify logging behavior
- Keep tests focused on behavior, not implementation details

### ❌ Don't

- Add console.log to tests for debugging - use proper assertions instead
- Use console.log to show progress - tests should be fast and silent
- Leave debug output in committed code

## Why This Approach?

1. **Simplicity** - No complex configuration needed
2. **Consistency** - All tests behave the same way
3. **Performance** - No overhead from complex output management
4. **Maintainability** - Easy to understand and modify

## Migration

If you have tests with console.log statements:

1. **Replace with assertions** - Instead of `console.log("step 1")`, add `expect(something).toBe(expected)`
2. **Use proper test structure** - Break complex tests into smaller, focused tests
3. **Remove debug code** - Don't commit debugging console.log statements

## Examples

### Before (Poor)

```typescript
it("should complete workflow", async () => {
  console.log("Step 1: Starting...");
  const result1 = await step1();
  console.log("Step 2: Processing...");
  const result2 = await step2(result1);
  console.log("Step 3: Complete!");
  expect(result2).toBeDefined();
});
```

### After (Good)

```typescript
it("should complete workflow", async () => {
  const result1 = await step1();
  expect(result1).toBeDefined();

  const result2 = await step2(result1);
  expect(result2).toBeDefined();
  expect(result2.status).toBe("complete");
});
```
