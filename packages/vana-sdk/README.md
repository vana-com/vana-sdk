# Vana SDK

> **⚠️ ALPHA SOFTWARE - EXPERIMENTAL USE ONLY**
>
> This SDK is in early alpha development and is **NOT SUITABLE FOR PRODUCTION USE**.
> Features may change without notice, and data loss or unexpected behavior may occur.
> Use at your own risk and avoid using with mainnet assets or critical operations.

A TypeScript SDK for building data-driven applications on the Vana Network. Enable users to grant gasless permissions, manage encrypted data, and interact with privacy-preserving infrastructure.

[![npm version](https://img.shields.io/npm/v/@opendatalabs/vana-sdk)](https://www.npmjs.com/package/@opendatalabs/vana-sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)](https://www.typescriptlang.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-green.svg)](https://opensource.org/licenses/ISC)

[API Documentation](https://vana-com.github.io/vana-sdk) • [Examples](#examples) • [Configuration](#configuration)

## Installation

```bash
npm install @opendatalabs/vana-sdk
```

**Peer Dependencies:**

```bash
npm install viem@^2.31.7
```

## Quick Start

The Vana SDK provides optimized builds for different environments:

| Build          | Use Case                          | Crypto Implementation              | Configuration     |
| -------------- | --------------------------------- | ---------------------------------- | ----------------- |
| **`/browser`** | Browser apps (React, Vue)         | Pure JavaScript (@noble/secp256k1) | **Zero config** ✓ |
| **`/node`**    | Server-side (Node.js, API routes) | Native bindings (secp256k1)        | Zero config ✓     |

### Browser Applications

The browser build uses pure JavaScript cryptography and requires **no special configuration**:

```typescript
// Browser build - works out of the box with any bundler
import { Vana, mokshaTestnet } from "@opendatalabs/vana-sdk/browser";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Create wallet client
const account = privateKeyToAccount("0x...");
const walletClient = createWalletClient({
  account,
  chain: mokshaTestnet,
  transport: http("https://rpc.moksha.vana.org"),
});

// Initialize SDK
const vana = Vana({
  walletClient,
  relayerUrl: "https://relayer.moksha.vana.org",
});
```

### Server-side Applications (Node.js)

The Node.js build uses native secp256k1 bindings for optimal performance:

```typescript
// For server-side applications (Next.js API routes, Express)
import { Vana, mokshaTestnet } from "@opendatalabs/vana-sdk/node";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Create wallet client
const account = privateKeyToAccount("0x...");
const walletClient = createWalletClient({
  account,
  chain: mokshaTestnet,
  transport: http("https://rpc.moksha.vana.org"),
});

// Initialize SDK
const vana = Vana({
  walletClient,
  relayerUrl: "https://relayer.moksha.vana.org",
});

// Grant gasless permission
const txHash = await vana.permissions.grant({
  grantee: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
  operation: "llm_inference",
  parameters: {
    prompt: "Analyze my data for insights",
    maxTokens: 1000,
  },
  expiresAt: Math.floor(Date.now() / 1000) + 86400, // 24 hours
});
```

## Core Features

### Gasless Permissions

Users can grant data access permissions without paying gas fees through EIP-712 signatures and relay infrastructure.

```typescript
// Grant permission with custom parameters
await vana.permissions.grant({
  grantee: applicationAddress,
  operation: "data_analysis",
  parameters: {
    analysisType: "sentiment",
    files: [12, 15, 28],
    model: "gpt-4",
  },
});
```

### Encrypted Data Management

Upload, query, and manage encrypted user data files with built-in schema validation.

```typescript
// Query user files
const files = await vana.data.getUserFiles({
  owner: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
});

// Upload encrypted file with decryption permissions
const result = await vana.data.upload({
  content: "Sensitive user data",
  filename: "user-data.json",
  schemaId: 123,
  permissions: [
    {
      account: "0xServerAddress...", // Who can decrypt
      publicKey: "0x04ServerKey...", // Their public key
    },
  ],
});
```

### Flexible Storage

Abstract storage layer supporting IPFS, Google Drive, and custom providers.

```typescript
// For browser applications
import { StorageManager, PinataStorage } from "@opendatalabs/vana-sdk/browser";
// OR for server-side applications
// import { StorageManager, PinataStorage } from "@opendatalabs/vana-sdk/node";

const storageManager = new StorageManager();
storageManager.register(
  "ipfs",
  new PinataStorage({
    apiKey: process.env.PINATA_API_KEY,
    secretKey: process.env.PINATA_SECRET_KEY,
  }),
);
```

## Migration Guide

### Migrating from Previous SDK Versions

If you're upgrading from an older version that used `eccrypto`:

1. **Update imports** - Change from default export to specific build:

   ```typescript
   // Old
   import { Vana } from "@opendatalabs/vana-sdk";

   // New - choose based on environment
   import { Vana } from "@opendatalabs/vana-sdk/browser"; // Browser
   import { Vana } from "@opendatalabs/vana-sdk/node"; // Node.js
   ```

2. **No API changes** - The SDK API remains unchanged, only the import path differs

3. **Bundle size improvements** - The new browser build is ~40% smaller than the previous version

### Troubleshooting

If you encounter Buffer-related errors in browser environments:

1. **Missing polyfill**: Add Buffer polyfill to your bundler configuration (see examples above)
2. **Content Security Policy**: Ensure your CSP is configured correctly for crypto operations
3. **Next.js SSR**: The SDK handles SSR automatically with proper exports

## Architecture

The SDK provides four main controllers:

| Controller    | Purpose                        | Key Methods                                                       |
| ------------- | ------------------------------ | ----------------------------------------------------------------- |
| `permissions` | Gasless permission management  | `grant()`, `revoke()`, `getUserPermissions()`                     |
| `data`        | File management and validation | `getUserFiles()`, `uploadEncryptedFile()`, `validateDataSchema()` |
| `server`      | Trusted server operations      | `trustServer()`, `processWithTrustedServer()`                     |
| `protocol`    | Contract interaction           | `getContract()`, `getAvailableContracts()`                        |

## Configuration

```typescript
const vana = Vana({
  walletClient,

  // Gasless transaction relay
  relayerUrl: "https://relayer.moksha.vana.org",

  // Custom relay callbacks
  relayerCallbacks: {
    submitPermissionGrant: async (typedData, signature) => {
      return await customRelayer.submit(typedData, signature);
    },
  },

  // Storage configuration
  storageManager: new StorageManager({
    defaultProvider: "ipfs",
    providers: {
      ipfs: new PinataStorage({ apiKey: "...", secretKey: "..." }),
    },
  }),

  // Subgraph for efficient queries
  subgraphUrl: "https://api.thegraph.com/subgraphs/name/vana/moksha",
});
```

## Error Handling

The SDK provides specific error types for different failure scenarios:

```typescript
import {
  RelayerError,
  UserRejectedRequestError,
  SchemaValidationError,
  NetworkError,
} from "@opendatalabs/vana-sdk/browser";
// OR for server-side applications
// } from "@opendatalabs/vana-sdk/node";

try {
  await vana.permissions.grant(params);
} catch (error) {
  if (error instanceof UserRejectedRequestError) {
    // User cancelled transaction
  } else if (error instanceof RelayerError) {
    // Relayer service error
  } else if (error instanceof SchemaValidationError) {
    // Schema validation failed
  }
}
```

## Supported Networks

| Network            | Chain ID | RPC URL                       |
| ------------------ | -------- | ----------------------------- |
| **Vana Mainnet**   | `1480`   | `https://rpc.vana.org`        |
| **Moksha Testnet** | `14800`  | `https://rpc.moksha.vana.org` |

## Examples

### Complete Data Sharing Flow

```typescript
import { Vana } from "@opendatalabs/vana-sdk/browser";
// OR for server-side applications
// } from "@opendatalabs/vana-sdk/node";

async function shareDataWithServer() {
  const vana = Vana({ walletClient });

  // Step 1: Upload encrypted file with decryption permissions
  const uploadResult = await vana.data.upload({
    content: { data: "sensitive medical records" },
    filename: "health-data.json",
    schemaId: 123,
    permissions: [
      {
        // Grant decryption access to the AI server
        account: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
        publicKey: "0x04abc...", // Server's public key for encryption
      },
    ],
  });

  // Step 2: Grant operation permissions for what the server can do
  const permissionResult = await vana.permissions.grant({
    grantee: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
    fileIds: [BigInt(uploadResult.fileId)],
    operation: "medical_analysis",
    parameters: {
      model: "medical-ai-v2",
      analysisType: "comprehensive",
    },
  });

  return { uploadResult, permissionResult };
}
```

### Schema Validation

```typescript
// Define data schema
const schema = {
  name: "Social Media Export",
  version: "1.0.0",
  dialect: "json",
  schema: {
    type: "object",
    properties: {
      posts: { type: "array" },
      profile: { type: "object" },
    },
    required: ["profile"],
  },
};

// Validate schema
vana.data.validateDataSchema(schema);

// Validate user data
const userData = {
  profile: { username: "alice" },
  posts: [],
};
vana.data.validateDataAgainstSchema(userData, schema);
```

## API Reference

### Permissions

```typescript
// Grant operation permission
await vana.permissions.grant({
  grantee: Address,
  fileIds: bigint[],
  operation: string,
  parameters: object,
  expiresAt?: number
}): Promise<PermissionGrantResult>

// Revoke permission
await vana.permissions.revoke({
  grantId: string
}): Promise<Hash>

// Get user permissions
await vana.permissions.getUserPermissions({
  owner: Address
}): Promise<GrantedPermission[]>
```

### Data

```typescript
// Get user files
await vana.data.getUserFiles({
  owner: Address
}): Promise<UserFile[]>

// Upload data with automatic encryption
await vana.data.upload({
  content: string | Blob | Buffer,
  filename?: string,
  schemaId?: number,
  permissions?: Array<{
    account: Address,     // Who can decrypt
    publicKey: string     // Their public key
  }>,
  encrypt?: boolean       // Default: true
}): Promise<UploadResult>

// Validate schema
vana.data.validateDataSchema(schema: unknown): void

// Validate data against schema
vana.data.validateDataAgainstSchema(data: unknown, schema: DataSchema): void
```

## Documentation

- [API Documentation](https://vana-com.github.io/vana-sdk) - Complete TypeDoc API reference
- [Getting Started](https://vana-com.github.io/vana-sdk/getting-started) - Step-by-step setup guide
- [Architecture](https://vana-com.github.io/vana-sdk/architecture) - SDK design and patterns
- [Configuration](https://vana-com.github.io/vana-sdk/configuration) - All configuration options
- [Security](https://vana-com.github.io/vana-sdk/security) - Best practices and security

## Support

- **Documentation**: [vana-com.github.io/vana-sdk](https://vana-com.github.io/vana-sdk)
- **Issues**: [GitHub Issues](https://github.com/vana-com/vana-sdk/issues)
- **Discord**: [Join our community](https://discord.gg/vanabuilders)

## Generated Code

The SDK includes automatically generated code from various sources to provide type-safe interfaces. All generated files are located in `src/generated/` and should **never be edited manually**.

### Code Generation Scripts

| Script                       | Purpose                                | Generated Files             |
| ---------------------------- | -------------------------------------- | --------------------------- |
| `npm run fetch-abis`         | Smart contract ABIs from blockchain    | `src/generated/abi/*.ts`    |
| `npm run fetch-server-types` | Personal server API types from OpenAPI | `src/generated/server/*.ts` |
| `npm run codegen:subgraph`   | GraphQL types from subgraph schema     | `src/generated/subgraph.ts` |

### Network-Specific Generation

Some generation scripts support different networks:

```bash
# Generate subgraph types for different networks
npm run codegen:subgraph:moksha   # Moksha testnet (default)
npm run codegen:subgraph:mainnet  # Vana mainnet

# Generate ABIs for different networks
npm run fetch-abis moksha         # Moksha testnet (default)
npm run fetch-abis mainnet        # Vana mainnet
```

### Development Workflow

When working with the SDK:

1. **Never edit generated files** - They are overwritten on regeneration
2. **Regenerate after schema changes** - Run generation scripts when external schemas change
3. **Generated files are committed** - They're included in version control for consistency
4. **ESLint ignores generated code** - Style rules don't apply to generated files

```bash
# Regenerate all code after schema updates
npm run fetch-abis
npm run fetch-server-types
npm run codegen:subgraph
```

## Development

```bash
git clone https://github.com/vana-com/vana-sdk.git
cd vana-sdk
npm install
npm run build
npm test
```

## License

[ISC License](LICENSE) © Vana Foundation
