# validateGrant Usage Examples

The consolidated `validateGrant` function provides flexible validation with strict TypeScript typing.

## Basic Usage

### Schema-Only Validation (Default)

```typescript
import { validateGrant } from "vana-sdk";

const grantFile = {
  grantee: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
  operation: "llm_inference",
  files: [1, 2, 3],
  parameters: { prompt: "Analyze this data" },
  expires: 1736467579,
};

// Returns GrantFile or throws GrantSchemaError
const validGrant = validateGrant(grantFile);
```

### Full Business Logic Validation

```typescript
// Validate schema + business rules
const validGrant = validateGrant(grantFile, {
  grantee: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
  operation: "llm_inference",
  files: [1, 2],
});
```

## Advanced Usage

### Non-Throwing Validation

```typescript
// Get detailed results without exceptions
const result = validateGrant(grantFile, {
  grantee: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
  operation: "llm_inference",
  files: [1, 2, 99], // Invalid file
  throwOnError: false,
});

if (!result.valid) {
  result.errors.forEach((error) => {
    console.log(`${error.type} error in ${error.field}: ${error.message}`);

    // Handle specific error types
    if (error.error instanceof FileAccessDeniedError) {
      console.log("Unauthorized files:", error.error.unauthorizedFiles);
    }
  });
}
```

### Testing with Custom Time

```typescript
// Override current time for expiry testing
const futureTime = Math.floor(Date.now() / 1000) + 7200; // 2 hours from now

try {
  validateGrant(grantFile, {
    currentTime: futureTime, // Grant will appear expired
  });
} catch (error) {
  if (error instanceof GrantExpiredError) {
    console.log(
      `Grant expired at ${error.expires}, current time: ${error.currentTime}`,
    );
  }
}
```

### Performance Optimization

```typescript
// Skip expensive schema validation for trusted data
const trustedGrant = validateGrant(trustedData, {
  schema: false,
  grantee: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
});
```

## Error Handling

### Specific Error Types

```typescript
try {
  validateGrant(grantFile, {
    grantee: "0x999...",
    operation: "wrong_op",
    files: [99],
  });
} catch (error) {
  if (error instanceof GranteeMismatchError) {
    console.log(`Expected ${error.grantee}, got ${error.requestingAddress}`);
  } else if (error instanceof OperationNotAllowedError) {
    console.log(
      `Operation ${error.requestedOperation} not allowed, granted: ${error.grantedOperation}`,
    );
  } else if (error instanceof FileAccessDeniedError) {
    console.log(`Access denied to files: ${error.unauthorizedFiles}`);
  } else if (error instanceof GrantExpiredError) {
    console.log(`Grant expired at ${new Date(error.expires * 1000)}`);
  } else if (error instanceof GrantSchemaError) {
    console.log("Schema validation failed:", error.schemaErrors);
  }
}
```

## TypeScript Benefits

### Strict Return Types

```typescript
// TypeScript knows this returns GrantFile
const grant = validateGrant(data);
grant.grantee; // ✅ Type: Address

// TypeScript knows this returns GrantValidationResult
const result = validateGrant(data, { throwOnError: false });
result.valid; // ✅ Type: boolean
result.errors; // ✅ Type: ValidationError[]
```

### Flattened Options API

```typescript
// Clean, flat options interface
validateGrant(data, {
  grantee: "0x...", // Top-level, not nested
  operation: "llm_inference",
  files: [1, 2, 3],
  currentTime: 1234567890,
  throwOnError: false,
});
```

## Migration from Old Functions

### Replace validateGrantFileAgainstSchema

```typescript
// OLD
const grant = validateGrantFileAgainstSchema(data);

// NEW
const grant = validateGrant(data);
```

### Replace validateGrantForRequest

```typescript
// OLD
validateGrantForRequest(grant, grantee, operation, files);

// NEW
validateGrant(grant, { grantee, operation, files });
```

### Replace validateGrantFile

```typescript
// OLD
if (validateGrantFile(data)) {
  // Use data
}

// NEW
const result = validateGrant(data, { throwOnError: false });
if (result.valid) {
  // Use result.grant
}
```
