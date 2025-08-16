# Build System Investigation

## Date: 2025-08-16

## Branch: fix/build-system-platform-separation

## Initial Findings

### Test Setup

Created a minimal Vite project at `packages/vana-sdk/test-builds` to test browser build compatibility.

### Build Results

The production build completes but with critical warnings:

1. **Node.js Modules Externalized**:
   - `crypto` module externalized (imported by `/workspace/node_modules/eccrypto-js/dist/cjs/lib/node.js`)
   - `stream` module externalized (imported by multiple dependencies):
     - `/workspace/node_modules/pbkdf2/node_modules/hash-base/index.js`
     - `/workspace/node_modules/cipher-base/index.js`
     - `/workspace/node_modules/hash-base/index.js`

### Root Causes Identified

1. **eccrypto-js using Node.js path**: The library is importing from `/dist/cjs/lib/node.js` which is the Node.js-specific implementation
2. **pbkdf2 and related crypto libraries**: These are using Node.js streams which don't exist in browsers

### Impact

While the build succeeds, the externalized modules mean:

- The built application will fail at runtime when trying to access `crypto` or `stream`
- Users must manually configure polyfills for these Node.js modules
- Bundle size is unnecessarily large due to incompatible dependencies

## Next Steps

### Priority 1: Fix eccrypto-js Import

The SDK should be using the browser-compatible version of eccrypto-js, not the Node.js version.

### Priority 2: Replace Node.js Crypto Dependencies

Replace pbkdf2 and related dependencies with browser-compatible alternatives or ensure proper platform-specific imports.

### Priority 3: Verify Platform Isolation

Ensure the `/browser` entry point properly excludes all Node.js-specific code paths.
