# Vana SDK

TypeScript SDK for building applications on the Vana Network with gasless permissions, privacy-preserving storage, and user-owned data.

[![npm version](https://img.shields.io/npm/v/vana-sdk)](https://www.npmjs.com/package/vana-sdk)
[![Downloads](https://img.shields.io/npm/dm/vana-sdk)](https://www.npmjs.com/package/vana-sdk)
[![License](https://img.shields.io/npm/l/vana-sdk)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![semantic-release: conventionalcommits](https://img.shields.io/badge/semantic--release-conventionalcommits-e10079?logo=semantic-release)](https://github.com/semantic-release/semantic-release)

---

## Quick Start
 
```bash
npm install vana-sdk
```

```typescript
import { Vana, mokshaTestnet } from "@opendatalabs/vana-sdk/browser";
import { createWalletClient, http } from "viem";

// 1. Initialize with your wallet
const vana = new Vana({
  walletClient: createWalletClient({
    chain: mokshaTestnet,
    transport: http(),
  }),
});

// 2. Grant gasless data permissions
const txHash = await vana.permissions.grant({
  to: "0x1234...", // Application address
  operation: "llm_inference",
  files: [12, 15, 28],
  parameters: { prompt: "Analyze my data for insights" },
});

// 3. Manage user data files
const files = await vana.data.getUserFiles({ owner: userAddress });
```

---

## Features

**Privacy-First Data Ownership:** Users own their data while applications access it with explicit permissions.

**Gasless Transactions:** Permission granting and data management without user transaction fees via relayer network.

**Developer-Friendly:** Built on [viem](https://viem.sh) with TypeScript-first design and comprehensive error handling.

**Extensible Architecture:** Modular storage providers, custom relayers, and direct contract access.

---

## Core Features

**Available:**

- Gasless Permissions (EIP-712 based permission granting)
- Data File Management (query and organize user data)
- Storage Abstraction (IPFS, Google Drive, custom providers)
- Encryption Protocol (canonical Vana encryption/decryption)
- Type-Safe Contracts (direct access to protocol contracts)

**Coming Soon:**

- DataDAO Management
- TEE Integration
- Advanced Querying
- Framework Hooks (React, Vue, Svelte)
- Multi-Chain Support

---

## Use Cases

**AI Training DataDAOs:** Pool user data for AI model training with privacy preservation and incentives.

**Privacy-Preserving Analytics:** Analyze user data without compromising individual privacy.

**Personal Data Wallets:** Comprehensive data management applications with encryption and storage.

**Secure Data Marketplaces:** Data trading platforms with built-in privacy controls and access rules.

---

## Architecture

Resource-oriented architecture mapping to Vana ecosystem concepts:

```typescript
const vana = new Vana({ walletClient });

vana.permissions.*  // Manage data access permissions
vana.data.*         // Handle user data files and encryption
vana.storage.*      // Abstract storage providers (IPFS, Google Drive, etc.)
vana.protocol.*     // Low-level contract access
```

**Design Principles:**

- Progressive disclosure (simple by default, powerful when needed)
- Type safety (full TypeScript support with comprehensive error handling)
- Modularity (custom storage, relayers, and providers)
- Compatibility (built on viem, works with existing web3 tooling)

---

## Installation & Setup

### Prerequisites

- Node.js 16+
- A Viem-compatible wallet client
- Network access to Vana (Moksha testnet or mainnet)

### Installation

```bash
# Using npm
npm install vana-sdk

# Using yarn
yarn add vana-sdk

# Using pnpm
pnpm add vana-sdk
```

### Basic Configuration

```typescript
// Browser/Client-side usage
import { Vana, mokshaTestnet } from '@opendatalabs/vana-sdk/browser';
// OR Server-side/Node.js usage  
// import { Vana, mokshaTestnet } from '@opendatalabs/vana-sdk/node';

import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// 1. Set up your wallet client (using viem)
const account = privateKeyToAccount('0x...');
const walletClient = createWalletClient({
  account,
  chain: mokshaTestnet,
  transport: http('https://rpc.moksha.vana.org')
});

// 2. Initialize Vana SDK
const vana = new Vana({
  walletClient,
  // Optional: custom relayer for gasless transactions
  relayerUrl: 'https://custom-relayer.com',
  // Optional: configure storage providers
  storage: {
    providers: {
      ipfs: new IPFSStorage({ ... }),
      drive: new GoogleDriveStorage({ ... })
    },
    defaultProvider: 'ipfs'
  }
});
```

### Supported Networks

| Network            | Chain ID | RPC URL                     | Explorer                   |
| ------------------ | -------- | --------------------------- | -------------------------- |
| **Moksha Testnet** | 14800    | https://rpc.moksha.vana.org | https://moksha.vanascan.io |
| **Vana Mainnet**   | 1480     | https://rpc.vana.org        | https://vanascan.io        |

---

## Examples

### Grant Data Access Permission

```typescript
try {
  const txHash = await vana.permissions.grant({
    to: "0x742d35Cc6634C0532925a3b8D84C20CEed3F89B7", // DLP address
    operation: "llm_inference",
    files: [12, 15, 28], // File IDs to grant access to
    parameters: {
      prompt: "Analyze my transaction patterns for budgeting insights",
      model: "gpt-4",
      maxTokens: 1000,
      outputFormat: "structured_json",
    },
  });

  console.log("Permission granted! Transaction:", txHash);
} catch (error) {
  if (error instanceof UserRejectedRequestError) {
    console.log("User cancelled the signature request");
  } else if (error instanceof RelayerError) {
    console.log("Gasless transaction failed:", error.message);
  }
}
```

### Upload Encrypted Data

```typescript
// 1. Encrypt user data with their wallet signature
const encryptionKey = await vana.encryption.generateKey(walletClient);
const userData = new Blob(["sensitive personal data"], { type: "text/plain" });
const encrypted = await vana.encryption.encrypt(userData, encryptionKey);

// 2. Upload to decentralized storage
const uploadResult = await vana.storage.upload(encrypted, "personal-data.enc");

// 3. Register on blockchain (gasless)
const fileId = await vana.data.registerFile({
  url: uploadResult.url,
  metadata: {
    originalName: "personal-data.txt",
    size: uploadResult.size,
    contentType: "text/plain",
  },
});

console.log(`File registered with ID: ${fileId}`);
```

### Query User Data

```typescript
// Get all files owned by a user
const userFiles = await vana.data.getUserFiles({
  owner: "0x...",
});

// Filter by criteria
const recentFiles = userFiles.filter(
  (file) => file.addedAtBlock > BigInt(1000000),
);

// Get specific file details
const fileDetails = await vana.data.getFileById(12);
console.log("File URL:", fileDetails.url);
console.log("Added at block:", fileDetails.addedAtBlock);
```

### Access Low-Level Contracts

```typescript
// Get contract information for advanced usage
const DataPermissions = vana.protocol.getContract("DataPermissions");
const dataRegistry = vana.protocol.getContract("DataRegistry");

// Use with viem for custom contract interactions
import { createPublicClient, http } from "viem";

const publicClient = createPublicClient({
  chain: mokshaTestnet,
  transport: http(),
});

// Direct contract read
const userNonce = await publicClient.readContract({
  address: DataPermissions.address,
  abi: DataPermissions.abi,
  functionName: "userNonce",
  args: [userAddress],
});
```

---

## Error Handling

The SDK provides comprehensive error handling with specific error types:

```typescript
import {
  RelayerError,
  UserRejectedRequestError,
  InvalidConfigurationError,
  ContractNotFoundError,
  NetworkError,
  EncryptionError,
} from "@opendatalabs/vana-sdk/browser";

try {
  await vana.permissions.grant(params);
} catch (error) {
  switch (true) {
    case error instanceof UserRejectedRequestError:
      // User cancelled wallet signature
      showUserMessage("Transaction cancelled");
      break;

    case error instanceof RelayerError:
      // Gasless service unavailable
      console.log("Relayer error:", error.statusCode, error.message);
      // Fallback to user-paid transaction
      break;

    case error instanceof NetworkError:
      // Network connectivity issues
      showRetryMessage();
      break;

    case error instanceof EncryptionError:
      // Encryption/decryption failed
      console.log("Encryption error:", error.message);
      break;

    default:
      // Unknown error
      console.error("Unexpected error:", error);
  }
}
```

---

## Documentation

📚 **[Complete Documentation](https://docs.vana.org/vana-sdk)**
🎯 **[API Reference](https://vana-com.github.io/vana-sdk)**
🔧 **[Integration Guides](https://docs.vana.org/vana-sdk/guides)**
💡 **[Examples Repository](./examples/)**

### Quick Links

- [Getting Started Guide](https://docs.vana.org/vana-sdk/getting-started)
- [Permission Management](https://docs.vana.org/vana-sdk/permissions)
- [Storage Configuration](https://docs.vana.org/vana-sdk/storage)
- [Encryption Protocol](https://docs.vana.org/vana-sdk/encryption)
- [Error Handling](https://docs.vana.org/vana-sdk/error-handling)
- [Migration from v0.x](https://docs.vana.org/vana-sdk/migration)

---

## Demo Application

Reference implementation in [`/examples/vana-sdk-demo`](./examples/vana-sdk-demo):

```bash
cd examples/vana-sdk-demo
npm install
npm run dev
```

**Features demonstrated:**

- Wallet connection and SDK initialization
- Gasless permission granting and management
- File upload, encryption, and decryption
- Storage provider integration (IPFS, Google Drive)
- Real-time data querying and management
- Comprehensive error handling and user feedback

---

## Development Workflow

Professional monorepo with clean architectural boundaries. The SDK compiles itself, demo apps consume the compiled output.

### Two-Terminal Setup

**Terminal 1: SDK Watcher**

```bash
cd packages/vana-sdk
npm run dev
```

**Terminal 2: Demo App Server**

```bash
npm run dev:demo
```

### How It Works

1. Edit SDK code in `packages/vana-sdk/src/`
2. Terminal 1 rebuilds `packages/vana-sdk/dist/`
3. Terminal 2 detects changes via symlink in `node_modules/vana-sdk`
4. HMR triggers, changes appear in browser

### Benefits

- Development environment mirrors production builds
- Prevents Node.js code imports in browser applications
- Eliminates "works in dev, breaks in production" bugs
- Demo app tests actual compiled SDK output

### Commands

| Command                 | Description                          |
| ----------------------- | ------------------------------------ |
| `npm run dev:demo`      | Start demo app development server    |
| `npm run build`         | Build all packages                   |
| `npm run test:coverage` | Run tests with coverage              |
| `npm run lint`          | ESLint check                         |
| `npm run typecheck`     | TypeScript validation                |
| `npm run validate`      | Run lint + typecheck + test:coverage |

### Project Structure

```
packages/vana-sdk/     # Core SDK package
  src/                 # Source code
  dist/                # Compiled output
examples/vana-sdk-demo/ # Demo application
```

---

## Community & Support

### Get Help

- **Discord:** [Join our developer community](https://discord.gg/vanabuilders)
- **GitHub Issues:** [Report bugs and request features](https://github.com/vana-com/vana-sdk/issues)
- **Documentation:** [docs.vana.org](https://docs.vana.org)
- **Email:** developers@vana.org

### Contributing

Contributions welcome. See [Contributing Guide](./CONTRIBUTING.md) and [Code of Conduct](./CODE_OF_CONDUCT.md).

```bash
git clone https://github.com/vana-com/vana-sdk.git
cd vana-sdk
npm install
npm run build
npm test
```

### Built With

- [viem](https://viem.sh) - TypeScript interface for EVM blockchains
- [TypeScript](https://www.typescriptlang.org/) - Type-safe development
- [OpenPGP.js](https://openpgpjs.org/) - Encryption protocol implementation
- [Vitest](https://vitest.dev/) - Fast unit testing

---

## License

[ISC License](./LICENSE)

---

[Get started with the docs](https://docs.vana.org/vana-sdk/getting-started) • [Try the demo](./examples/vana-sdk-demo) • [Join our community](https://discord.gg/vanabuilders)
