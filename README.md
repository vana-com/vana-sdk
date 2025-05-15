# Vana SDK

A TypeScript library for interacting with Vana Network smart contracts, enabling data contributions, validations, and queries in a simple way.

## Features (Current & Planned)

- **Wallet and Network Integration:** Connect to Vana networks (supports Vana Mainnet `1480` and Moksha Testnet `14800` out of the box) with easy provider configuration.
- **Data Contribution Workflow:** Submit data to a DLP and request validation:
  - Register encrypted data files on-chain (DataRegistry) and give the DLP access.
  - Trigger the Satya TEE network to validate your contribution (TeePool).
  - Claim your reward tokens from the DLP after successful validation.
- **Data Liquidity Pool Management:** _(Upcoming)_ For DLP owners:
  - Create a new DLP (via factory or registry) and configure its parameters.
  - Register the validation logic (refiner) for your DLP in the DataRefinerRegistry.
  - Update DLP settings (pause/unpause contracts, update trusted forwarder or public key, etc.).
- **Data Query & Access:** _(Upcoming)_ Enable data buyers to run queries on contributed data securely:
  - Set query permissions with prices (through QueryEngine).
  - Approve or revoke query requests (for DLP/refiner owners).
  - Automatically handle payments and result retrieval via TEE ComputeEngine.
- **Utilities:** Helper functions for encryption, key management, and result decoding to abstract away the cryptographic details of interacting with the Vana network.

## 📦 Installation

```bash
npm install vana-sdk
```

[![npm version](https://img.shields.io/npm/v/vana-sdk)](https://www.npmjs.com/package/vana-sdk)

➡️ [View on npm](https://www.npmjs.com/package/vana-sdk)


## Quick Start Example

```typescript
import { VanaProvider } from "vana-sdk";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, http } from "viem";
import { mokshaTestnet } from "vana-sdk/chains";

// Create your viem clients
const publicClient = createPublicClient({
  chain: mokshaTestnet,
  transport: http("https://rpc.moksha.vana.org"),
});

const signer = privateKeyToAccount("0x..."); // Your private key
const walletClient = createWalletClient({
  chain: mokshaTestnet,
  transport: http("https://rpc.moksha.vana.org"),
  account: signer,
});

// Connect to Vana
const vana = new VanaProvider({
  chainId: mokshaTestnet.id,
  rpcUrl: "https://rpc.moksha.vana.org",
  signer,
});

// Example file URL and encryption key
const fileUrl = "https://example.com/mydata.csv";
const dlpAddress = vana.getContractAddress("DataLiquidityPoolProxy");
const encryptedKey = await encryptFileKey(myFileEncryptionKey, dlpPublicKey);
const signerAddress = await vana.signerAddress();

// Register file in the DataRegistry with permissions
await walletClient.writeContract({
  address: vana.contracts.dataRegistry.address,
  abi: vana.contracts.dataRegistry.abi,
  functionName: "addFileWithPermissions",
  args: [
    fileUrl,
    signerAddress,
    dlpAddress,
    [{ account: dlpAddress, key: encryptedKey }],
  ],
});

// Get file ID from DataRegistry
const fileId = await publicClient.readContract({
  address: vana.contracts.dataRegistry.address,
  abi: vana.contracts.dataRegistry.abi,
  functionName: "fileIdByUrl",
  args: [fileUrl],
});

// Request TEE validation
await walletClient.writeContract({
  address: vana.contracts.teePool.address,
  abi: vana.contracts.teePool.abi,
  functionName: "requestContributionProof",
  args: [fileId],
});

// Wait for validation (in a real app, listen for events)
// ...wait for ProofAdded event...

// Claim reward for contribution
await walletClient.writeContract({
  address: vana.contracts.dataLiquidityPool.address,
  abi: vana.contracts.dataLiquidityPool.abi,
  functionName: "claimReward",
  args: [fileId],
});
```

## Interacting with Contracts

The SDK provides a streamlined way to interact with Vana smart contracts through the `VanaProvider` class, which gives you access to contract addresses and ABIs, while leveraging viem's client interface for actual blockchain interactions.

### Using Contracts with Viem Clients

The Vana SDK uses a simple pattern for contract interaction:

1. Use the `VanaProvider` to access contract information (address and ABI)
2. Use viem's `publicClient` for read operations and `walletClient` for write operations

```typescript
import { VanaProvider } from "vana-sdk";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, http } from "viem";
import { mokshaTestnet } from "vana-sdk/chains";

// Create viem clients
const publicClient = createPublicClient({
  chain: mokshaTestnet,
  transport: http("https://rpc.moksha.vana.org"),
});

const signer = privateKeyToAccount("0x...");
const walletClient = createWalletClient({
  chain: mokshaTestnet,
  transport: http("https://rpc.moksha.vana.org"),
  account: signer,
});

// Initialize Vana provider
const vana = new VanaProvider({
  chainId: mokshaTestnet.id,
  rpcUrl: "https://rpc.moksha.vana.org",
  signer,
});

// Read operations
const fileId = await publicClient.readContract({
  address: vana.contracts.dataRegistry.address,
  abi: vana.contracts.dataRegistry.abi,
  functionName: "fileIdByUrl",
  args: [fileUrl],
});

// Write operations
await walletClient.writeContract({
  address: vana.contracts.dataRegistry.address,
  abi: vana.contracts.dataRegistry.abi,
  functionName: "addFile",
  args: [fileUrl, owner],
});

await walletClient.writeContract({
  address: vana.contracts.teePool.address,
  abi: vana.contracts.teePool.abi,
  functionName: "requestContributionProof",
  args: [fileId],
});
```

### Available Contracts

The `VanaProvider` gives you access to the following contracts:

- `dataRegistry`: For registering and managing data files
- `teePool`: For managing TEE computation and validation
- `dataLiquidityPool`: For managing token rewards
- `computeEngine`: For execution of data analytics

## TypeScript ABI Pattern

The SDK uses a type-safe approach for contract ABIs:

1. **Contract ABI Definitions**: All contract ABIs are defined as TypeScript files in the `src/abi` directory.

2. **Central Registry**: The `abi/index.ts` file provides a central registry of all available contract ABIs.

3. **Type Safety**: The SDK leverages TypeScript's type system to ensure you can only request ABIs for supported contracts:

```typescript
// Access a contract's ABI
import { getAbi } from "vana-sdk";
const dataRegistryAbi = getAbi("DataRegistry");
```

This pattern makes it easy to extend the SDK with new contracts while maintaining full type safety.

## Extending the SDK

You can extend the SDK with custom contract wrappers using the `BaseContractClient` if needed:

```typescript
import { BaseContractClient, VanaProvider } from "vana-sdk";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, http } from "viem";

// Create a custom client for a contract
export class MyCustomContractClient extends BaseContractClient<"DataRegistry"> {
  constructor(provider: VanaProvider) {
    super("DataRegistry", provider);
  }

  // Use with a provider
  static withProvider(privateKey: string, rpcUrl: string) {
    const signer = privateKeyToAccount(privateKey);
    const provider = new VanaProvider({
      chainId: 14800,
      rpcUrl,
      signer,
    });
    return new MyCustomContractClient(provider);
  }

  // Add custom methods
  async addFileWithNotification(fileUrl: string, owner: string): Promise<any> {
    const walletClient = createWalletClient({
      transport: http(this.provider.rpcUrl),
      account: this.provider.signer,
    });

    // Call a write function on the contract
    const hash = await walletClient.writeContract({
      address: this.contract.address,
      abi: this.contract.abi,
      functionName: "addFile",
      args: [fileUrl, owner],
    });

    // Custom logic, like sending a notification
    console.log(`File added with transaction: ${hash}`);
    return hash;
  }
}
```

## Project Structure

- **`src/abi`** – TypeScript definitions of contract ABIs for type-safe interaction.
- **`src/config`** – Network configuration (contract addresses, chains).
- **`src/core`** – Core SDK classes (provider setup, client configuration).
- **`src/contracts`** – Base contract interfaces and controllers.
- **`src/utils`** – Utility functions (encryption helpers, formatters).

## Contributing

We welcome contributions! If you want to add support for a new feature or contract:

- **Open an issue** or **draft a proposal** for discussion if it's a significant addition.
- Follow the coding style (run `npm run lint` to ensure ESLint passes).
- Add unit tests for any new modules if possible.

## TODOs and Future Plans

- [ ] **Implement specialized contract client classes** for common operations.
- [ ] **Implement DataRefinerRegistry module:** allow DLP owners to register and update data refiners.
- [ ] **Implement QueryEngine and ComputeEngine modules:** enabling the data query flow (permissions, payments, result handling).
- [ ] **Event listening utilities:** e.g. a helper to wait for a `ProofAdded` event or query completion events instead of manual polling.
- [ ] **DLP Factory support:** add functions to create new DLPs via the DLP root contract, and to look up existing DLPs by ID or owner.
- [ ] **Comprehensive Testing:** create a suite of tests (using Hardhat or Foundry scripts with Moksha testnet or local fork).
- [ ] **Documentation Site:** expand the README into a full documentation site with guides.
