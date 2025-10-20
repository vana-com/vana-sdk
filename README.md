# Vana SDK

TypeScript SDK for building user-owned data applications on the Vana Network.

[![npm version](https://img.shields.io/npm/v/@opendatalabs/vana-sdk)](https://www.npmjs.com/package/@opendatalabs/vana-sdk)
[![Downloads](https://img.shields.io/npm/dm/@opendatalabs/vana-sdk)](https://www.npmjs.com/package/@opendatalabs/vana-sdk)
[![License](https://img.shields.io/npm/l/@opendatalabs/vana-sdk)](./LICENSE)

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

Permission granting with automatic gas handling:

```typescript
// Grant permission for data analysis
const result = await vana.permissions.grant({
  grantee: "0x742d35Cc6634C0532925a3b8D84C20CEed3F89B7", // DataDAO address
  operation: "llm_inference",
  files: [12, 15, 28], // User's file IDs
  parameters: {
    prompt: "Analyze my transaction patterns for insights",
    model: "gpt-4",
    maxTokens: 1000,
  },
});

console.log("Permission granted! Transaction:", result.transactionHash);
```

## Running Example Applications

This monorepo includes two example applications demonstrating SDK usage:

```bash
# Install dependencies (from root directory)
npm install

# Run the main SDK demo (includes data permissions, file management, and more)
npm run dev:demo

# Run the Vana Vibes demo (social features demonstration)
npm run dev:vibes
```

The demos will start on:

- SDK Demo: http://localhost:3000
- Vibes Demo: http://localhost:3001

## Resources

- **[Complete Documentation](https://docs.vana.org/sdk)** - Comprehensive guides and API reference
- **[Console Application](./examples/vana-console)** - Full-featured example implementation
- **[API Reference](https://vana-com.github.io/vana-sdk)** - Auto-generated TypeScript docs
- **[Discord Community](https://discord.gg/vanabuilders)** - Get help and share feedback

## Development

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and workflow.

## License

[ISC](./LICENSE)
