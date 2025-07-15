# Vana SDK

<div align="center">
  <h3>TypeScript SDK for User-Owned Data</h3>
  <p>Build applications on the Vana Network with gasless permissions, privacy-preserving storage, and seamless data ownership.</p>

[![npm version](https://img.shields.io/npm/v/vana-sdk)](https://www.npmjs.com/package/vana-sdk)
[![Downloads](https://img.shields.io/npm/dm/vana-sdk)](https://www.npmjs.com/package/vana-sdk)
[![License](https://img.shields.io/npm/l/vana-sdk)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![semantic-release: conventionalcommits](https://img.shields.io/badge/semantic--release-conventionalcommits-e10079?logo=semantic-release)](https://github.com/semantic-release/semantic-release)

</div>

---

## Quick Start

```bash
npm install vana-sdk
```

```typescript
import { Vana } from "vana-sdk";
import { createWalletClient, http } from "viem";
import { mokshaTestnet } from "vana-sdk/chains";

// 1. Initialize with your wallet
const vana = await Vana.create({
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

**🎯 Result:** Your app now supports user-owned data with privacy-preserving permissions—no gas fees required for users.

---

## Why Vana SDK?

### 🔐 **Privacy-First Data Ownership**

Enable users to truly own their data while allowing applications to access it with explicit permissions.

### ⚡ **Gasless User Experience**

Users grant permissions and manage data without paying transaction fees—powered by our relayer network.

### 🛠️ **Developer-Friendly**

Built on [viem](https://viem.sh) with TypeScript-first design, comprehensive error handling, and familiar patterns.

### 🔌 **Extensible Architecture**

Modular storage providers, custom relayers, and low-level contract access for advanced use cases.

---

## Core Features

<table>
<tr>
<td width="50%">

### ✅ **Available Now**

- **Gasless Permissions** - EIP-712 based permission granting
- **Data File Management** - Query and organize user data
- **Storage Abstraction** - IPFS, Google Drive, and custom providers
- **Encryption Protocol** - Canonical Vana encryption/decryption
- **Type-Safe Contracts** - Direct access to all protocol contracts

</td>
<td width="50%">

### 🔄 **Coming Soon**

- **DataDAO Management** - Create and operate Data Liquidity Pools
- **TEE Integration** - Trusted execution environment workflows
- **Advanced Querying** - Sophisticated data access patterns
- **Framework Hooks** - React, Vue, and Svelte integrations
- **Multi-Chain Support** - Deploy across EVM networks

</td>
</tr>
</table>

---

## What You Can Build

<details>
<summary><strong>🤖 AI Training DataDAOs</strong></summary>

```typescript
// Enable users to pool data for AI model training
const dataDAO = await vana.dataDAOs.create({
  name: "Medical Research DAO",
  purpose: "Train privacy-preserving medical AI models",
  incentives: { rewardPerContribution: "100" },
});

await vana.data.contribute({
  dataDAOId: dataDAO.id,
  files: encryptedMedicalData,
  metadata: { dataType: "anonymized_patient_records" },
});
```

</details>

<details>
<summary><strong>📊 Privacy-Preserving Analytics</strong></summary>

```typescript
// Analyze user data without compromising privacy
const insights = await vana.analytics.computeInsights({
  query: "demographics_summary",
  permissions: await vana.permissions.getUserPermissions(),
  privacyLevel: "k_anonymity_5",
});
```

</details>

<details>
<summary><strong>💾 Personal Data Wallets</strong></summary>

```typescript
// Build comprehensive data management applications
const userData = await vana.data.getUserFiles({ owner: userAddress });
const encrypted = await vana.encryption.encryptFile(userData[0]);
const stored = await vana.storage.upload(encrypted, "personal-data.enc");
```

</details>

<details>
<summary><strong>🔐 Secure Data Marketplaces</strong></summary>

```typescript
// Create data trading platforms with built-in privacy
const listing = await vana.marketplace.createListing({
  dataFiles: selectedFiles,
  price: ethers.parseEther("0.1"),
  accessRules: { duration: "30_days", usageType: "research_only" },
});
```

</details>

---

## Architecture

The Vana SDK uses a **resource-oriented architecture** that maps to logical concepts in the Vana ecosystem:

```typescript
const vana = new Vana({ walletClient });

// Resource controllers
vana.permissions.*  // Manage data access permissions
vana.data.*         // Handle user data files and encryption
vana.storage.*      // Abstract storage providers (IPFS, Google Drive, etc.)
vana.protocol.*     // Low-level contract access (escape hatch)
```

**Design Philosophy:**

- **Progressive Disclosure:** Simple by default, powerful when needed
- **Type Safety:** Full TypeScript support with comprehensive error handling
- **Modularity:** Plug in custom storage, relayers, and providers
- **Compatibility:** Built on viem, works with existing web3 tooling

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
import { Vana } from 'vana-sdk';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mokshaTestnet } from 'vana-sdk/chains';

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
} from "vana-sdk";

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

Explore the complete reference implementation in [`/examples/vana-sdk-demo`](./examples/vana-sdk-demo):

```bash
cd examples/vana-sdk-demo
npm install
npm run dev
```

**Features demonstrated:**

- 🔐 Wallet connection and SDK initialization
- ⚡ Gasless permission granting and management
- 📁 File upload, encryption, and decryption
- 🏪 Storage provider integration (IPFS, Google Drive)
- 🔍 Real-time data querying and management
- ⚠️ Comprehensive error handling and user feedback

---

## Community & Support

### 💬 Get Help

- **Discord:** [Join our developer community](https://discord.gg/vana)
- **GitHub Issues:** [Report bugs and request features](https://github.com/vana-com/vana-sdk/issues)
- **Documentation:** [docs.vana.org](https://docs.vana.org)
- **Email:** developers@vana.org

### 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) and [Code of Conduct](./CODE_OF_CONDUCT.md).

**Quick start for contributors:**

```bash
git clone https://github.com/vana-com/vana-sdk.git
cd vana-sdk
npm install
npm run build
npm test
```

### 🏗️ Built With

- **[viem](https://viem.sh)** - TypeScript interface for EVM blockchains
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe development
- **[OpenPGP.js](https://openpgpjs.org/)** - Encryption protocol implementation
- **[Vitest](https://vitest.dev/)** - Fast unit testing

---

## License

[ISC License](./LICENSE) - feel free to use this in your projects!

---

<div align="center">
  <p>
    <strong>Ready to build the future of user-owned data?</strong><br>
    <a href="https://docs.vana.org/vana-sdk/getting-started">Get started with the docs</a> •
    <a href="./examples/vana-sdk-demo">Try the demo</a> •
    <a href="https://discord.gg/vana">Join our community</a>
  </p>
</div>
