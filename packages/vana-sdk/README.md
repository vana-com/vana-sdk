# Vana SDK

TypeScript SDK for building user-owned data applications on the Vana Network.

[![npm version](https://img.shields.io/npm/v/@opendatalabs/vana-sdk)](https://www.npmjs.com/package/@opendatalabs/vana-sdk)
[![Downloads](https://img.shields.io/npm/dm/@opendatalabs/vana-sdk)](https://www.npmjs.com/package/@opendatalabs/vana-sdk)
[![License](https://img.shields.io/npm/l/@opendatalabs/vana-sdk)](https://opensource.org/licenses/ISC)

> The SDK is production-ready and stable. APIs may evolve in minor versions as we incorporate community feedback and expand functionality.

## Installation

```bash
npm install @opendatalabs/vana-sdk viem@^2.31.7
```

## Quick Start

The SDK provides platform-specific builds optimized for your environment:

**Browser Applications**

```typescript
import { Vana, mokshaTestnet } from "@opendatalabs/vana-sdk/browser";
import { createWalletClient, custom } from "viem";

const walletClient = createWalletClient({
  chain: mokshaTestnet,
  transport: custom(window.ethereum),
});

const vana = Vana({ walletClient });
```

**Node.js Applications**

```typescript
import { Vana, mokshaTestnet } from "@opendatalabs/vana-sdk/node";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount("0x...");
const walletClient = createWalletClient({
  account,
  chain: mokshaTestnet,
  transport: http("https://rpc.moksha.vana.org"),
});

const vana = Vana({
  walletClient,
  relayerUrl: "https://relayer.moksha.vana.org",
});
```

## Core Features

### Gasless Permissions

Grant data access permissions without gas fees using EIP-712 signatures and relay infrastructure.

```typescript
await vana.permissions.grant({
  grantee: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
  operation: "llm_inference",
  parameters: {
    prompt: "Analyze my data for insights",
    maxTokens: 1000,
  },
  expiresAt: Math.floor(Date.now() / 1000) + 86400,
});
```

### Encrypted Data Management

Upload, query, and manage encrypted files with schema validation.

```typescript
// Query user files
const files = await vana.data.getUserFiles({
  owner: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
});

// Upload with encryption and decryption permissions
const result = await vana.data.upload({
  content: "Sensitive user data",
  filename: "user-data.json",
  schemaId: 123,
  permissions: [
    {
      account: "0xServerAddress...",
      publicKey: "0x04ServerKey...",
    },
  ],
});
```

### Flexible Storage

Abstract storage layer supporting multiple backends: IPFS, Pinata, Google Drive, Dropbox, or custom providers.

```typescript
import { StorageManager, PinataStorage } from "@opendatalabs/vana-sdk/node";

const storage = new StorageManager();
storage.register(
  "ipfs",
  new PinataStorage({
    apiKey: process.env.PINATA_API_KEY,
    secretKey: process.env.PINATA_SECRET_KEY,
  })
);

const vana = Vana({ walletClient, storageManager: storage });
```

## API Overview

The SDK organizes functionality into domain-focused controllers:

| Controller    | Purpose                          |
| ------------- | -------------------------------- |
| `permissions` | Gasless permission management    |
| `data`        | File operations and encryption   |
| `schemas`     | Data validation and schemas      |
| `server`      | Trusted server interactions      |
| `protocol`    | Direct contract access           |
| `operations`  | Transaction tracking and polling |

## Configuration

```typescript
const vana = Vana({
  walletClient,
  relayerUrl: "https://relayer.moksha.vana.org",
  storageManager: new StorageManager({ defaultProvider: "ipfs" }),
  subgraphUrl: "https://api.thegraph.com/subgraphs/name/vana/moksha",
});
```

## Networks

| Network          | Chain ID | RPC URL                       |
| ---------------- | -------- | ----------------------------- |
| Vana Mainnet     | 1480     | https://rpc.vana.org          |
| Moksha Testnet   | 14800    | https://rpc.moksha.vana.org   |

## Documentation

- [Complete Documentation](https://docs.vana.org/sdk) - Guides, tutorials, and conceptual overviews
- [API Reference](https://vana-com.github.io/vana-sdk) - Generated TypeScript API documentation
- [Examples](https://github.com/vana-com/vana-sdk/tree/main/examples) - Full example applications

## Support

- [GitHub Issues](https://github.com/vana-com/vana-sdk/issues) - Bug reports and feature requests
- [Discord Community](https://discord.gg/vanabuilders) - Community support and discussion

## License

[ISC](https://opensource.org/licenses/ISC) - See [LICENSE](https://github.com/vana-com/vana-sdk/blob/main/LICENSE)
