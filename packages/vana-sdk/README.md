# Vana SDK

The Vana SDK is a comprehensive TypeScript library for building applications on the Vana Network. It provides simple, powerful APIs for gasless data permissions, file management, and secure data portability.

[![npm version](https://img.shields.io/npm/v/vana-sdk)](https://www.npmjs.com/package/vana-sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)](https://www.typescriptlang.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-green.svg)](https://opensource.org/licenses/ISC)

[Documentation](https://vana-com.github.io/vana-sdk) • [Examples](#examples) • [API Reference](https://vana-com.github.io/vana-sdk)

## Why Vana SDK?

- **🔐 Gasless Permissions**: EIP-712 based permission system with zero gas fees for users
- **📁 Data Management**: Query, upload, and manage encrypted user data files
- **🔄 Flexible Relaying**: Callback-based relay system supporting any gasless transaction infrastructure
- **📊 Schema Validation**: Built-in JSON Schema and SQLite schema validation with AJV
- **🔧 Type-Safe**: Full TypeScript support with comprehensive type definitions
- **🎯 Production Ready**: Battle-tested with comprehensive error handling and retry mechanisms

## Installation

```bash
# npm
npm install vana-sdk

# yarn
yarn add vana-sdk

# pnpm
pnpm add vana-sdk
```

**Peer Dependencies:**

```bash
npm install viem@^2.31.7
```

## Quick Start

### Basic Setup

```typescript
import { Vana } from "vana-sdk";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mokshaTestnet } from "vana-sdk/chains";

// Create wallet client
const account = privateKeyToAccount("0x...");
const walletClient = createWalletClient({
  account,
  chain: mokshaTestnet,
  transport: http("https://rpc.moksha.vana.org"),
});

// Initialize Vana SDK
const vana = new Vana({
  walletClient,
  // Optional: configure gasless relayer
  relayerUrl: "https://relayer.moksha.vana.org",
});
```

### Grant Data Permission (Gasless)

```typescript
// Grant permission for an AI application to access user data
const txHash = await vana.permissions.grant({
  to: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36", // Application address
  operation: "llm_inference",
  parameters: {
    prompt: "Analyze my browsing data for insights",
    maxTokens: 1000,
    files: [12, 15, 28], // Specific file IDs
    model: "gpt-4",
  },
  expiresAt: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
});

console.log("Permission granted:", txHash);
```

### Query User Data Files

```typescript
// Get all files owned by a user
const files = await vana.data.getUserFiles({
  user: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
});

files.forEach((file) => {
  console.log(`File ${file.id}: ${file.url}`);
  console.log(`Schema: ${file.schemaId}, Added: ${file.addedAtBlock}`);
});
```

### Upload Encrypted File

```typescript
// Generate encryption key from wallet
const encryptionKey = await generateEncryptionKey(walletClient);

// Encrypt user data
const userData = new Blob([
  JSON.stringify({
    browsing_history: [{ url: "https://example.com", timestamp: Date.now() }],
  }),
]);

const encryptedData = await encryptUserData(userData, encryptionKey);

// Upload to IPFS and register on-chain
const result = await vana.data.uploadEncryptedFile({
  data: encryptedData,
  schemaId: 123, // JSON schema for browsing data
  filename: "browsing-data.json",
});

console.log("File uploaded:", result.fileId, result.url);
```

## Architecture

The Vana SDK follows a resource-oriented architecture with five main controllers:

### Core Controllers

| Controller             | Purpose                                 | Key Methods                                                       |
| ---------------------- | --------------------------------------- | ----------------------------------------------------------------- |
| **`vana.permissions`** | Gasless permission grants & revocations | `grant()`, `revoke()`, `getUserPermissions()`                     |
| **`vana.data`**        | Data file management & encryption       | `getUserFiles()`, `uploadEncryptedFile()`, `validateDataSchema()` |
| **`vana.server`**      | Trusted server management               | `trustServer()`, `untrustServer()`, `processWithTrustedServer()`  |
| **`vana.protocol`**    | Low-level contract access               | `getContract()`, `getAvailableContracts()`                        |

### Configuration Options

```typescript
const vana = new Vana({
  // Required: Wallet client for signing
  walletClient,

  // Optional: Gasless transaction relay
  relayerUrl: "https://custom-relayer.com",

  // Optional: Custom callback-based relaying
  relayerCallbacks: {
    submitPermissionGrant: async (typedData, signature) => {
      // Custom relay implementation
      return await customRelayer.submit(typedData, signature);
    },
  },

  // Optional: Storage configuration
  storageManager: new StorageManager({
    defaultProvider: "ipfs",
    providers: {
      ipfs: new PinataStorage({ apiKey: "...", secretKey: "..." }),
    },
  }),

  // Optional: Subgraph for efficient data queries
  subgraphUrl: "https://api.thegraph.com/subgraphs/name/vana/moksha",
});
```

## Core Concepts

### Gasless Permissions

The Vana SDK enables applications to request data access permissions without users paying gas fees:

```typescript
// Complete gasless permission flow
const permission = await vana.permissions.grant({
  to: applicationAddress,
  operation: "data_analysis",
  parameters: {
    // Structured parameters for the operation
    analysisType: "sentiment",
    outputFormat: "json",
    maxDataPoints: 1000,
  },
});

// The SDK handles:
// 1. Parameter serialization & IPFS storage
// 2. EIP-712 typed data creation
// 3. User signature via wallet
// 4. Relayer submission & gas payment
// 5. On-chain permission registration
```

### Data File Management

Query and manage encrypted user data files using the subgraph for efficiency:

```typescript
// Efficiently query user files (no contract scanning)
const files = await vana.data.getUserFiles({
  user: userAddress,
  // Optional: override subgraph URL
  subgraphUrl: "https://custom-subgraph.com/graphql",
});

// Files are automatically deduplicated by ID
// Latest timestamp wins for duplicate file IDs
console.log(`Found ${files.length} unique files`);
```

### Schema Validation

Built-in support for validating data schemas and user data:

```typescript
// Validate a data schema against Vana meta-schema
const schema = {
  name: "Instagram Export",
  version: "1.0.0",
  dialect: "json",
  schema: {
    type: "object",
    properties: {
      posts: { type: "array" },
      profile: { type: "object" },
    },
  },
};

vana.data.validateDataSchema(schema);

// Validate user data against the schema
const userData = { posts: [], profile: { username: "alice" } };
vana.data.validateDataAgainstSchema(userData, schema);
```

### Flexible Relay System

Configure gasless transactions using callbacks instead of fixed HTTP APIs:

```typescript
const vana = new Vana({
  walletClient,
  relayerCallbacks: {
    // Custom permission grant relaying
    submitPermissionGrant: async (typedData, signature) => {
      const response = await fetch("/api/relay/grant", {
        method: "POST",
        body: JSON.stringify({ typedData, signature }),
      });
      const result = await response.json();
      return result.transactionHash;
    },

    // Custom revocation relaying
    submitPermissionRevoke: async (typedData, signature) => {
      return await myCustomRelayer.revoke(typedData, signature);
    },
  },
});
```

## API Reference

### Permissions Controller

```typescript
// Grant permission (gasless)
await vana.permissions.grant({
  to: Address,                    // Application address
  operation: string,              // Operation type
  parameters: object,             // Operation parameters
  expiresAt?: number             // Optional expiration timestamp
}): Promise<Hash>

// Revoke permission (gasless)
await vana.permissions.revoke({
  grantId: string,               // Grant ID to revoke
  nonce?: bigint                 // Optional nonce override
}): Promise<Hash>

// Query user permissions
await vana.permissions.getUserPermissions({
  user: Address,                 // User address
  subgraphUrl?: string          // Optional subgraph override
}): Promise<GrantedPermission[]>

// Trust a server
await vana.permissions.trustServer({
  serverAddress: Address,        // Server's address
  serverUrl: string             // Server's URL
}): Promise<Hash>
```

### Data Controller

```typescript
// Get user files
await vana.data.getUserFiles({
  user: Address,                 // File owner address
  subgraphUrl?: string          // Optional subgraph override
}): Promise<UserFile[]>

// Upload encrypted file
await vana.data.uploadEncryptedFile({
  data: Blob,                   // Encrypted file data
  schemaId?: number,            // Optional schema ID
  filename?: string             // Optional filename
}): Promise<UploadEncryptedFileResult>

// Validate data schema
vana.data.validateDataSchema(
  schema: unknown             // Schema to validate
): asserts schema is DataSchema

// Validate data against schema
vana.data.validateDataAgainstSchema(
  data: unknown,                // Data to validate
  schema: DataSchema        // Data schema
): void

// Fetch and validate remote schema
await vana.data.fetchAndValidateSchema(
  url: string                   // Schema URL
): Promise<DataSchema>
```

### Server Controller

```typescript
// Process data with trusted server
await vana.server.processWithTrustedServer({
  serverUrl: string,            // Trusted server URL
  operation: string,            // Operation to perform
  parameters: object            // Operation parameters
}): Promise<any>

// Check server trust status
await vana.server.isServerTrusted({
  user: Address,                // User address
  serverAddress: Address        // Server address
}): Promise<boolean>
```

### Protocol Controller

```typescript
// Get contract information
vana.protocol.getContract(
  contractName: VanaContract    // Contract name
): ContractInfo

// List available contracts
vana.protocol.getAvailableContracts(): VanaContract[]

// Get contract addresses for chain
vana.protocol.getChainContracts(
  chainId: number              // Chain ID
): Record<VanaContract, Address>
```

## Storage Integration

The SDK includes a powerful storage abstraction supporting multiple providers:

### IPFS Storage

```typescript
import { StorageManager, PinataStorage } from "vana-sdk";

const storageManager = new StorageManager();

// Configure Pinata IPFS
const pinataStorage = new PinataStorage({
  apiKey: process.env.PINATA_API_KEY,
  secretKey: process.env.PINATA_SECRET_KEY,
  gatewayUrl: "https://gateway.pinata.cloud/ipfs",
});

storageManager.register("ipfs", pinataStorage, true); // Default provider

// Upload file
const result = await storageManager.upload(encryptedBlob, "encrypted-data.bin");
```

### Custom Storage Provider

```typescript
class CustomStorage implements StorageProvider {
  async upload(file: Blob, filename?: string): Promise<StorageUploadResult> {
    // Custom upload logic
    return { url: "custom://uploaded-file", size: file.size };
  }

  async download(url: string): Promise<Blob> {
    // Custom download logic
  }

  // ... other required methods
}

storageManager.register("custom", new CustomStorage());
```

## Error Handling

The SDK provides comprehensive error handling with specific error types:

```typescript
import {
  RelayerError,
  UserRejectedRequestError,
  SchemaValidationError,
  InvalidConfigurationError,
  NetworkError,
} from "vana-sdk";

try {
  await vana.permissions.grant(params);
} catch (error) {
  if (error instanceof UserRejectedRequestError) {
    // User rejected the signature request
    console.log("User cancelled transaction");
  } else if (error instanceof RelayerError) {
    // Relayer service error
    console.log(`Relayer error (${error.statusCode}): ${error.message}`);
  } else if (error instanceof SchemaValidationError) {
    // Schema validation failed
    console.log(`Schema error: ${error.message}`);
  } else if (error instanceof NetworkError) {
    // Network connectivity issue
    console.log(`Network error: ${error.message}`);
  } else {
    // Unexpected error
    console.error("Unexpected error:", error);
  }
}
```

## Supported Networks

| Network            | Chain ID | RPC URL                       | Explorer                                         |
| ------------------ | -------- | ----------------------------- | ------------------------------------------------ |
| **Vana Mainnet**   | `1480`   | `https://rpc.vana.org`        | [vanascan.io](https://vanascan.io)               |
| **Moksha Testnet** | `14800`  | `https://rpc.moksha.vana.org` | [moksha.vanascan.io](https://moksha.vanascan.io) |

### Adding Networks to Wallet

**Moksha Testnet:**

```
Network Name: Vana Moksha Testnet
RPC URL: https://rpc.moksha.vana.org
Chain ID: 14800
Currency Symbol: VANA
Block Explorer: https://moksha.vanascan.io
```

## Examples

### Complete Permission Flow

```typescript
import { Vana, generateEncryptionKey, encryptUserData } from "vana-sdk";

async function completePermissionFlow() {
  // 1. Initialize SDK
  const vana = new Vana({ walletClient });

  // 2. Encrypt user data
  const encryptionKey = await generateEncryptionKey(walletClient);
  const userData = new Blob([JSON.stringify({ data: "sensitive info" })]);
  const encryptedData = await encryptUserData(userData, encryptionKey);

  // 3. Upload encrypted file
  const uploadResult = await vana.data.uploadEncryptedFile({
    data: encryptedData,
    schemaId: 123,
    filename: "user-data.json",
  });

  // 4. Grant permission to access the file
  const permissionTx = await vana.permissions.grant({
    to: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
    operation: "ai_training",
    parameters: {
      files: [uploadResult.fileId],
      model: "llm-v1",
      maxTokens: 500,
    },
  });

  console.log("Permission granted:", permissionTx);
}
```

### Schema Validation Example

```typescript
// Define a data schema
const instagramSchema = {
  name: "Instagram Export",
  version: "1.0.0",
  description: "User's Instagram profile and posts data",
  dialect: "json",
  schema: {
    type: "object",
    properties: {
      profile: {
        type: "object",
        properties: {
          username: { type: "string" },
          followers: { type: "number" },
          verified: { type: "boolean" },
        },
        required: ["username"],
      },
      posts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            likes: { type: "number" },
            caption: { type: "string" },
          },
        },
      },
    },
    required: ["profile"],
  },
};

// Validate the schema
vana.data.validateDataSchema(instagramSchema);

// Validate user data against the schema
const userData = {
  profile: { username: "alice_smith", followers: 1500, verified: false },
  posts: [{ id: "post_123", likes: 42, caption: "Beautiful sunset! 🌅" }],
};

vana.data.validateDataAgainstSchema(userData, instagramSchema);
```

## Contributing

We welcome contributions to the Vana SDK! Please see our [Contributing Guide](../../CONTRIBUTING.md) for details.

### Development Setup

```bash
git clone https://github.com/vana-com/vana-sdk.git
cd vana-sdk
npm install
npm run build
npm test
```

### Running Examples

```bash
cd examples/vana-sdk-demo
npm install
npm run dev
```

## Documentation

- [📚 API Documentation](https://vana-com.github.io/vana-sdk) - Complete TypeDoc API reference
- [🚀 Getting Started Guide](https://docs.vana.org/vana-sdk) - Step-by-step setup
- [🏗️ Architecture Guide](https://docs.vana.org/vana-sdk/architecture) - SDK design and patterns
- [🔧 Configuration Guide](https://docs.vana.org/vana-sdk/configuration) - All configuration options
- [🔒 Security Guide](https://docs.vana.org/vana-sdk/security) - Best practices and security

## Support

- **📖 Documentation**: [API Reference](https://vana-com.github.io/vana-sdk)
- **💬 Discord**: [Join our community](https://discord.gg/vana)
- **🐛 Issues**: [GitHub Issues](https://github.com/vana-com/vana-sdk/issues)
- **📧 Email**: [support@vana.org](mailto:support@vana.org)

## License

[ISC License](LICENSE) © Vana Foundation
