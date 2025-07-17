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

```typescript
import { Vana } from "@opendatalabs/vana-sdk";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mokshaTestnet } from "@opendatalabs/vana-sdk";

// Create wallet client
const account = privateKeyToAccount("0x...");
const walletClient = createWalletClient({
  account,
  chain: mokshaTestnet,
  transport: http("https://rpc.moksha.vana.org"),
});

// Initialize SDK
const vana = new Vana({
  walletClient,
  relayerUrl: "https://relayer.moksha.vana.org",
});

// Grant gasless permission
const txHash = await vana.permissions.grant({
  to: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
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
  to: applicationAddress,
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

// Upload encrypted file
const result = await vana.data.uploadEncryptedFile({
  data: encryptedBlob,
  schemaId: 123,
  filename: "user-data.json",
});
```

### Flexible Storage

Abstract storage layer supporting IPFS, Google Drive, and custom providers.

```typescript
import { StorageManager, PinataStorage } from "@opendatalabs/vana-sdk";

const storageManager = new StorageManager();
storageManager.register(
  "ipfs",
  new PinataStorage({
    apiKey: process.env.PINATA_API_KEY,
    secretKey: process.env.PINATA_SECRET_KEY,
  }),
);
```

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
const vana = new Vana({
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
} from "@opendatalabs/vana-sdk";

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

### Complete Permission Flow

```typescript
import {
  Vana,
  generateEncryptionKey,
  encryptUserData,
} from "@opendatalabs/vana-sdk";

async function grantDataPermission() {
  const vana = new Vana({ walletClient });

  // 1. Encrypt user data
  const encryptionKey = await generateEncryptionKey(walletClient);
  const userData = new Blob([JSON.stringify({ data: "sensitive info" })]);
  const encryptedData = await encryptUserData(userData, encryptionKey);

  // 2. Upload encrypted file
  const uploadResult = await vana.data.uploadEncryptedFile({
    data: encryptedData,
    schemaId: 123,
    filename: "user-data.json",
  });

  // 3. Grant permission
  const permissionTx = await vana.permissions.grant({
    to: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
    operation: "ai_training",
    parameters: {
      files: [uploadResult.fileId],
      model: "llm-v1",
    },
  });

  return permissionTx;
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
// Grant permission
await vana.permissions.grant({
  to: Address,
  operation: string,
  parameters: object,
  expiresAt?: number
}): Promise<Hash>

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

// Upload encrypted file
await vana.data.uploadEncryptedFile({
  data: Blob,
  schemaId?: number,
  filename?: string
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
