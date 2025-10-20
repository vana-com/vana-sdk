# Vana SDK

Build user-owned data applications with gasless permissions, encrypted data management, and privacy-preserving infrastructure.

[![npm version](https://img.shields.io/npm/v/@opendatalabs/vana-sdk)](https://www.npmjs.com/package/@opendatalabs/vana-sdk)
[![Downloads](https://img.shields.io/npm/dm/@opendatalabs/vana-sdk)](https://www.npmjs.com/package/@opendatalabs/vana-sdk)
[![License](https://img.shields.io/npm/l/@opendatalabs/vana-sdk)](https://opensource.org/licenses/ISC)

The SDK is production-ready. APIs may evolve in minor versions as we incorporate feedback and expand functionality.

## Get Started

### 1. Install

```bash
npm install @opendatalabs/vana-sdk viem
```

### 2. Set up your client

Choose the build for your environment:

**Browser:**

```typescript
import { Vana, mokshaTestnet } from "@opendatalabs/vana-sdk/browser";
import { createWalletClient, custom } from "viem";

const walletClient = createWalletClient({
  chain: mokshaTestnet,
  transport: custom(window.ethereum),
});

const vana = Vana({ walletClient });
```

**Node.js:**

```typescript
import { Vana, mokshaTestnet } from "@opendatalabs/vana-sdk/node";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount("0x...");
const vana = Vana({
  walletClient: createWalletClient({
    account,
    chain: mokshaTestnet,
    transport: http("https://rpc.moksha.vana.org"),
  }),
  relayerUrl: "https://relayer.moksha.vana.org",
});
```

### 3. Use the SDK

```typescript
// Grant gasless data access permission
await vana.permissions.grant({
  grantee: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
  operation: "llm_inference",
  parameters: {
    prompt: "Analyze my data for insights",
    maxTokens: 1000,
  },
  expiresAt: Math.floor(Date.now() / 1000) + 86400,
});

// Upload encrypted file with decryption permissions
await vana.data.upload({
  content: "Sensitive user data",
  filename: "data.json",
  schemaId: 123,
  permissions: [
    {
      account: "0xServerAddress...",
      publicKey: "0x04ServerKey...",
    },
  ],
});

// Query user files
const files = await vana.data.getUserFiles({
  owner: "0x742d35Cc6558Fd4D9e9E0E888F0462ef6919Bd36",
});
```

## Features

The SDK provides six main controllers:

| Controller    | Purpose                                      |
| ------------- | -------------------------------------------- |
| `permissions` | Grant and revoke gasless data access         |
| `data`        | Upload, query, and decrypt encrypted files   |
| `schemas`     | Validate data against schemas                |
| `server`      | Interact with trusted servers                |
| `protocol`    | Direct smart contract access                 |
| `operations`  | Track and poll transaction status            |

## Configuration

Configure storage, relay, and subgraph services:

```typescript
import { StorageManager, PinataStorage } from "@opendatalabs/vana-sdk/node";

const vana = Vana({
  walletClient,
  relayerUrl: "https://relayer.moksha.vana.org",
  storageManager: new StorageManager().register(
    "ipfs",
    new PinataStorage({
      apiKey: process.env.PINATA_API_KEY,
      secretKey: process.env.PINATA_SECRET_KEY,
    })
  ),
  subgraphUrl: "https://api.thegraph.com/subgraphs/name/vana/moksha",
});
```

## Networks

| Network        | Chain ID | RPC URL                     |
| -------------- | -------- | --------------------------- |
| Vana Mainnet   | 1480     | https://rpc.vana.org        |
| Moksha Testnet | 14800    | https://rpc.moksha.vana.org |

## Learn More

- [Documentation](https://docs.vana.org/docs/sdk) - Comprehensive guides and tutorials
- [API Reference](https://vana-com.github.io/vana-sdk) - Complete TypeScript documentation
- [Examples](https://github.com/vana-com/vana-sdk/tree/main/examples) - Full demo applications
- [Discord](https://discord.gg/vanabuilders) - Community support

## Support

Report issues on [GitHub Issues](https://github.com/vana-com/vana-sdk/issues).

## License

[ISC](https://opensource.org/licenses/ISC)
