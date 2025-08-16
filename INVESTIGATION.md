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

## Solution Implemented

### Fixed eccrypto-js Import Issues
- **Problem**: eccrypto-js was importing Node.js-specific modules (secp256k1, crypto) even in browser builds
- **Solution**: Replaced eccrypto-js with @noble/secp256k1, a pure JavaScript implementation that works in browsers
- **Implementation**: Created browser-crypto.ts with ECIES encryption using @noble/secp256k1 and Web Crypto API

### Browser Build Now Clean
- **Before**: Multiple warnings about externalized Node.js modules (crypto, stream)
- **After**: Clean build with no warnings, fully self-contained browser bundle
- **Result**: SDK can be used in browser environments without any polyfills or additional configuration

### Files Modified
1. `src/platform/browser-crypto.ts` - New browser-compatible crypto implementation
2. `src/platform/browser.ts` - Updated to use new crypto implementation
3. `tsup-browser.config.ts` - Custom build configuration for browser
4. `package.json` - Updated build script and added @noble dependencies
