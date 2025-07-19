# Crypto Cross-Platform Compatibility Testing

## Overview

This directory contains tools to test the reliability of cross-platform crypto operations between the Node.js (`eccrypto`) and browser (`eccrypto-js`) implementations.

## Critical Issue Discovered

**🚨 5.7% Failure Rate Detected**

Our testing has revealed a serious production issue:

- **57 out of 1000 tests fail** when running cross-platform crypto compatibility tests
- This represents a **5.7% failure rate** in real-world usage
- Users will experience data decryption failures approximately **1 in every 17-18 operations**

## Impact

- **Data Loss Risk**: Users cannot decrypt their own data
- **Cross-Platform Failures**: Data encrypted on server cannot be read on client
- **Intermittent Errors**: Random "Bad MAC" errors in production
- **User Trust**: Unreliable crypto operations damage product credibility

## Testing Script

### `test-failure-rate-parallel.js`

A parallel testing script that runs crypto compatibility tests across multiple worker threads to efficiently measure failure rates.

#### Usage

```bash
# Run 1000 tests across 8 parallel workers
node test-failure-rate-parallel.js 1000 8

# Run 100 tests with default worker count
node test-failure-rate-parallel.js 100

# Run with defaults (1000 tests)
node test-failure-rate-parallel.js
```

#### Sample Output

```
🧪 Testing crypto compatibility failure rate over 1000 iterations...
🚀 Using 8 parallel workers (125 tests per worker)

📊 RESULTS:
===========
Total runs: 1000
Passes: 943 (94.3%)
Failures: 57 (5.7%)

💡 CONCLUSIONS:
===============
🔥 Moderate failure rate (5-10%) - serious production issue

Failure rate: 5.70%
Estimated production impact: IMMEDIATE FIX REQUIRED

🚨 RECOMMENDATION:
- DO NOT deploy current crypto implementation to production
- Switch to single crypto library for both platforms
- Add extensive error logging and monitoring
- Consider data recovery mechanisms for affected users
```

## Root Cause

The issue stems from incompatibilities between two different ECDH encryption libraries:

- **Node.js**: Uses `eccrypto` library
- **Browser**: Uses `eccrypto-js` library

While both implement the same cryptographic standards, subtle differences in:

- MAC calculation algorithms
- Key format handling
- Random parameter generation
- Buffer processing

Lead to encrypted data that cannot be consistently decrypted across platforms.

## Recommended Solutions

1. **Use Single Library**: Adopt `eccrypto-js` for both platforms (it works in Node.js too)
2. **Add Fallback Mechanisms**: Implement retry logic with error recovery
3. **Extensive Testing**: Run compatibility tests in CI/CD before any crypto changes
4. **Monitoring**: Add telemetry to track crypto operation success rates in production

## Previous Security Fix

This issue was discovered after fixing a security vulnerability where the browser adapter was using fixed IV values. The fix exposed the underlying compatibility problem that was previously masked.

## Files

- `test-failure-rate-parallel.js` - Parallel testing script
- `src/tests/crypto-cross-platform-compatibility.test.ts` - Core compatibility tests
- `src/platform/browser.ts` - Browser crypto implementation
- `src/platform/node.ts` - Node.js crypto implementation

## Next Steps

1. **Do not merge** crypto-related changes until this is resolved
2. **Audit existing encrypted data** for corruption
3. **Plan migration strategy** to single crypto library
4. **Implement monitoring** for production crypto failures
