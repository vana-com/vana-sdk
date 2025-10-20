# Vana SDK

TypeScript SDK for building user-owned data applications on the Vana Network.

[![npm version](https://img.shields.io/npm/v/@opendatalabs/vana-sdk)](https://www.npmjs.com/package/@opendatalabs/vana-sdk)
[![Downloads](https://img.shields.io/npm/dm/@opendatalabs/vana-sdk)](https://www.npmjs.com/package/@opendatalabs/vana-sdk)
[![License](https://img.shields.io/npm/l/@opendatalabs/vana-sdk)](./LICENSE)

> Production-ready and stable. APIs may evolve in minor versions as we gather feedback and expand functionality.

## Installation

```bash
npm install @opendatalabs/vana-sdk
```

## Quick Start

```typescript
import { Vana } from "@opendatalabs/vana-sdk/browser";
import { createWalletClient, custom } from "viem";
import { mokshaTestnet } from "@opendatalabs/vana-sdk/browser";

// Initialize with wallet
const walletClient = createWalletClient({
  chain: mokshaTestnet,
  transport: custom(window.ethereum),
});

const vana = Vana({ walletClient });

// Grant data access permission
const result = await vana.permissions.grant({
  grantee: "0x742d35Cc6634C0532925a3b8D84C20CEed3F89B7", // App address
  operation: "llm_inference",
  files: [12, 15, 28],
  parameters: { prompt: "Analyze my data: {{data}}" },
});
console.log("Permission granted! ID:", result.permissionId);
```

## Import Guide

```typescript
// Browser/React applications
import { Vana } from "@opendatalabs/vana-sdk/browser";

// Node.js/Backend applications
import { Vana } from "@opendatalabs/vana-sdk/node";
```

## Authentication

Complete setup with wallet configuration:

```typescript
import { createWalletClient, custom, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Vana, mokshaTestnet } from "@opendatalabs/vana-sdk/browser";

// Browser with MetaMask
const walletClient = createWalletClient({
  chain: mokshaTestnet,
  transport: custom(window.ethereum),
});

// Node.js with private key
const account = privateKeyToAccount("0x...");
const walletClient = createWalletClient({
  account,
  chain: mokshaTestnet,
  transport: http(),
});

const vana = Vana({ walletClient });
```

## Example: Grant Data Access

```typescript
const result = await vana.permissions.grant({
  grantee: "0x742d35Cc6634C0532925a3b8D84C20CEed3F89B7",
  operation: "llm_inference",
  files: [12, 15, 28],
  parameters: {
    prompt: "Analyze my transaction patterns for insights",
    model: "gpt-4",
    maxTokens: 1000,
  },
});
```

## Example Applications

This monorepo includes example applications demonstrating SDK usage:

```bash
# Install dependencies
npm install

# Run the SDK console (comprehensive demo)
npm run dev:console

# Run the Vibes demo (social features)
npm run dev:vibes
```

The demos start on http://localhost:3000 and http://localhost:3001 respectively.

## Documentation

- [Complete Documentation](https://docs.vana.org/sdk)
- [API Reference](https://vana-com.github.io/vana-sdk)
- [Discord Community](https://discord.gg/vanabuilders)

## Development

See [CLAUDE.md](./CLAUDE.md) for development setup and workflow.

## License

[ISC](./LICENSE)
