# ECIES API Design Review

## Current API Surface

### Public Interface

```typescript
interface ECIESProvider {
  encrypt(publicKey: Buffer, message: Buffer): Promise<ECIESEncrypted>;
  decrypt(privateKey: Buffer, encrypted: ECIESEncrypted): Promise<Buffer>;
}
```

## Design Strengths

### 1. Simplicity

- Only two public methods
- Clear, focused responsibility
- Easy to understand and use

### 2. Type Safety

- Strong TypeScript types
- Custom error types with codes
- Comprehensive JSDoc documentation

### 3. Backward Compatibility

- Maintains eccrypto format
- Drop-in replacement for existing code
- No breaking changes required

### 4. Platform Abstraction

- Single interface for Node and Browser
- Implementation details hidden
- Consistent behavior across platforms

## Areas for Improvement

### 1. Synchronous vs Asynchronous

**Current**: All operations are async

```typescript
await ecies.encrypt(publicKey, message);
```

**Consideration**: Some operations could be synchronous

- Pro: Simpler API for some use cases
- Con: Inconsistent API, blocks event loop
- **Recommendation**: Keep async for consistency

### 2. Options Support

**Current**: No configuration options

```typescript
encrypt(publicKey: Buffer, message: Buffer): Promise<ECIESEncrypted>
```

**Potential Enhancement**:

```typescript
interface ECIESOptions {
  ephemeralKeyReuse?: boolean;  // For batch operations
  compressionLevel?: number;     // For large messages
  streamingMode?: boolean;       // For huge messages
}

encrypt(publicKey: Buffer, message: Buffer, options?: ECIESOptions): Promise<ECIESEncrypted>
```

**Recommendation**: Add options parameter for future extensibility

### 3. Error Handling

**Current**: Throws ECIESError with codes

```typescript
throw new ECIESError("message", "ERROR_CODE");
```

**Enhancement**: Add error recovery hints

```typescript
class ECIESError {
  constructor(
    message: string,
    code: string,
    cause?: Error,
    hint?: string, // Recovery suggestion
  ) {}
}
```

### 4. Streaming Support

**Current**: Buffer-based API only

```typescript
encrypt(publicKey: Buffer, message: Buffer): Promise<ECIESEncrypted>
```

**Enhancement**: Add streaming API

```typescript
interface ECIESStreamProvider extends ECIESProvider {
  encryptStream(publicKey: Buffer, input: ReadableStream): ReadableStream;
  decryptStream(privateKey: Buffer, input: ReadableStream): ReadableStream;
}
```

### 5. Key Management

**Current**: No key generation or management

```typescript
// Users must generate keys externally
const privateKey = eccrypto.generatePrivate();
```

**Enhancement**: Add key utilities

```typescript
interface ECIESKeyUtils {
  generateKeyPair(): { privateKey: Buffer; publicKey: Buffer };
  validatePrivateKey(key: Buffer): boolean;
  validatePublicKey(key: Buffer): boolean;
  compressPublicKey(key: Buffer): Buffer;
  decompressPublicKey(key: Buffer): Buffer;
}
```

## Usability Enhancements

### 1. Convenience Methods

```typescript
// String encryption convenience
async encryptString(publicKey: Buffer, message: string): Promise<ECIESEncrypted> {
  return this.encrypt(publicKey, Buffer.from(message, 'utf8'));
}

async decryptString(privateKey: Buffer, encrypted: ECIESEncrypted): Promise<string> {
  const buffer = await this.decrypt(privateKey, encrypted);
  return buffer.toString('utf8');
}
```

### 2. Serialization Helpers

```typescript
// Already implemented but could be exposed
serializeECIES(encrypted: ECIESEncrypted): string;
deserializeECIES(hex: string): ECIESEncrypted;
```

### 3. Factory Pattern Enhancement

**Current**:

```typescript
const provider = new NodeECIESProvider();
```

**Enhancement**:

```typescript
// Auto-detect environment
const provider = ECIESProvider.create();

// With options
const provider = ECIESProvider.create({
  platform: "node",
  caching: true,
  validation: "strict",
});
```

## Breaking Change Considerations

### If We Were Starting Fresh

1. **Use Uint8Array instead of Buffer**: More universal
2. **Make ECIESEncrypted use Uint8Array**: Consistency
3. **Add async key generation**: Built-in support
4. **Support multiple curves**: Not just secp256k1
5. **Add metadata support**: Version, algorithm info

### Migration Path

```typescript
// v1 (current) - Buffer-based
encrypt(publicKey: Buffer, message: Buffer): Promise<ECIESEncrypted>

// v2 (future) - Uint8Array with compatibility layer
encrypt(publicKey: Uint8Array | Buffer, message: Uint8Array | Buffer): Promise<ECIESEncrypted>

// v3 (future) - Pure Uint8Array
encrypt(publicKey: Uint8Array, message: Uint8Array): Promise<ECIESEncryptedV2>
```

## Developer Experience (DX) Improvements

### 1. Better Type Inference

```typescript
// Current
const encrypted = await ecies.encrypt(publicKey, message);

// Enhanced with overloads
const encrypted = await ecies.encrypt(publicKey, "string message"); // Auto Buffer.from
const encrypted = await ecies.encrypt(publicKey, uint8Array); // Auto convert
```

### 2. Chaining API

```typescript
const result = await ecies
  .withPublicKey(publicKey)
  .encrypt(message)
  .then((encrypted) => ecies.serialize(encrypted));
```

### 3. Debug Mode

```typescript
const provider = ECIESProvider.create({ debug: true });
// Logs: Key validation, encryption steps, performance metrics
```

## Testing & Documentation

### Current Strengths

- Comprehensive test coverage
- Cross-platform compatibility tests
- Performance benchmarks
- JSDoc documentation

### Improvements

1. Add example code in documentation
2. Create interactive playground
3. Add migration guide from eccrypto
4. Include security best practices guide

## Recommendations

### Immediate (Non-Breaking)

1. ✅ Add validation caching (already implemented)
2. Export serialization utilities
3. Add convenience methods for strings
4. Improve error messages with hints

### Future (Minor Version)

1. Add options parameter for extensibility
2. Implement streaming support
3. Add key management utilities
4. Create environment auto-detection

### Long-term (Major Version)

1. Migrate to Uint8Array throughout
2. Support multiple curves
3. Add metadata/versioning
4. Implement batch operations

## Conclusion

The current API design is solid with:

- Clean, simple interface
- Good type safety
- Excellent backward compatibility

Main opportunities:

- Add convenience methods
- Support streaming for large data
- Improve key management
- Enhanced error recovery guidance
