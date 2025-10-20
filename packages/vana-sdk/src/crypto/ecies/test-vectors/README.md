# ECIES Test Vectors

## Purpose

These test vectors ensure that our ECIES implementation maintains **100% compatibility with the eccrypto library** that was previously used in the Vana SDK.

## Why This Matters

- **Backward Compatibility**: Existing encrypted data in the Vana network was encrypted using eccrypto
- **Interoperability**: Other services may still use eccrypto and need to decrypt our data (and vice versa)
- **Format Specification**: We follow the exact same format as eccrypto to ensure seamless migration

## Format Specification

The eccrypto format for ECIES encrypted data is:

```
[iv (16 bytes)] [ephemPublicKey (65 bytes)] [ciphertext (variable)] [mac (32 bytes)]
```

### Components:

- **IV**: 16-byte initialization vector for AES-256-CBC
- **Ephemeral Public Key**: 65-byte uncompressed secp256k1 public key
- **Ciphertext**: Variable-length AES-256-CBC encrypted payload
- **MAC**: 32-byte HMAC-SHA256 authentication tag

### Cryptographic Details:

- **Curve**: secp256k1
- **KDF**: SHA-512(ECDH shared secret) → encryption key (32B) || mac key (32B)
- **Cipher**: AES-256-CBC with PKCS7 padding
- **MAC**: HMAC-SHA256(mac_key, iv || ephemPublicKey || ciphertext)

## Test Vector Generation

The test vectors in `eccrypto-vectors.json` were generated on 2025-08-17 using:

- **Library**: eccrypto v1.1.6
- **Script**: `scripts/generate-test-vectors.js`
- **Purpose**: Capture real eccrypto output for compatibility testing

To regenerate (if needed):

```bash
# Temporarily install eccrypto
npm install --no-save eccrypto@1.1.6

# Generate vectors
node scripts/generate-test-vectors.js

# Remove eccrypto
npm uninstall eccrypto
```

## Test Coverage

The vectors cover:

1. **Simple text messages** - Basic ASCII text
2. **Binary data** - Random binary payloads
3. **Large data** - 1KB+ payloads
4. **UTF-8 with special characters** - Emojis, accented characters, CJK
5. **Known keys** - Deterministic test with fixed private key

## Compatibility Requirements

Our ECIES implementation MUST:

1. Decrypt all eccrypto-encrypted test vectors correctly
2. Produce encrypted output in the exact same format
3. Use the same cryptographic parameters (KDF, cipher, MAC)
4. Handle both compressed and uncompressed public keys (eccrypto uses uncompressed)
