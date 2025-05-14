# Vana SDK

A TypeScript library for interacting with Vana Network smart contracts, enabling data contributions, validations, and queries in a simple way.

## Features (Current & Planned)

* **Wallet and Network Integration:** Connect to Ethereum-compatible networks (supports Vana Mainnet `1480` and Moksha Testnet `14800` out of the box) with easy provider configuration.
* **Data Contribution Workflow:** Submit data to a DLP and request validation:
  * `addFile(fileUrl, encryptedKey)` – Register an encrypted data file on-chain (DataRegistry) and give the DLP access.
  * `requestContributionProof(fileId)` – Trigger the Satya TEE network to validate your contribution (TeePool).
  * `claimReward(fileId)` – Claim your reward tokens from the DLP after successful validation.
* **Data Liquidity Pool Management:** *(Upcoming)* For DLP owners:
  * Create a new DLP (via factory or registry) and configure its parameters.
  * `addRefiner(dlpId, name, schemaUrl, instructionUrl, pubKey)` – Register the validation logic (refiner) for your DLP in the DataRefinerRegistry.
  * Update DLP settings (pause/unpause contracts, update trusted forwarder or public key, etc.).
* **Data Query & Access:** *(Upcoming)* Enable data buyers to run queries on contributed data securely:
  * Set query permissions with prices (through QueryEngine).
  * Approve or revoke query requests (for DLP/refiner owners).
  * Automatically handle payments and result retrieval via TEE ComputeEngine.
* **Utilities:** Helper functions for encryption, key management, and result decoding to abstract away the cryptographic details of interacting with the Vana network.

## Installation

```bash
npm install vana-sdk
```

## Quick Start Example

```typescript
import { VanaProvider, DataRegistryClient, TeePoolClient, DataLiquidityPoolClient, encryptFileKey } from 'vana-sdk';

// Connect to Vana
const vana = new VanaProvider({ 
  chainId: 14800,  // Moksha Testnet
  rpcUrl: 'https://rpc.moksha.vana.org',
  signer: myEthereumSigner  // Your ethers.js signer
});

const dataRegistry = new DataRegistryClient(vana);
const teePool = new TeePoolClient(vana);
const dlp = new DataLiquidityPoolClient(vana);

// Add a new file to the DLP and request validation
const fileUrl = "https://example.com/mydata.csv";
const dlpInfo = await dlp.getPoolInfo();
const encryptedKey = await encryptFileKey(myFileEncryptionKey, dlpInfo.publicKey);

// Register file in the DataRegistry
await dataRegistry.addFileWithPermissions(
  fileUrl, 
  await vana.signerAddress(), 
  vana.getContractAddress('DataLiquidityPoolProxy'), 
  encryptedKey
);

// Get file ID and request TEE validation
const fileId = await dataRegistry.getFileId(fileUrl);
await teePool.requestContributionProof(fileId);

// Wait for validation (in a real app, listen for events)
// ...wait for ProofAdded event...

// Claim reward for contribution
await dlp.claimReward(fileId);
```

## TypeScript ABI Pattern

The SDK uses a type-safe approach to work with contract ABIs:

1. **Contract ABI Definitions**: All contract ABIs are defined as TypeScript files in the `src/abi` directory, providing full type safety for contract interactions.

2. **Central Registry**: The `abi/index.ts` file provides a central registry of all available contract ABIs and their mappings to contract names:

```typescript
// Example of accessing a contract ABI
import { getAbi } from 'vana-sdk';

// Get the ABI for a specific contract
const dataRegistryAbi = getAbi('DataRegistryProxy');
```

3. **Type Safety**: The SDK uses TypeScript's type system to ensure you can only request ABIs for supported contracts:

```typescript
// VanaContract type ensures only valid contract names can be used
import { VanaContract } from 'vana-sdk';
const contractName: VanaContract = 'DataRegistryProxy';
```

This pattern makes it easy to extend the SDK with new contracts while maintaining full type safety.

## Project Structure

* **`src/contracts`** – Source for each contract wrapper (DataRegistry, TeePool, etc.), providing typed methods to interact with the blockchain.
* **`src/config`** – Network configuration (contract addresses, ABIs).
* **`src/core`** – Core SDK classes (provider setup, base contract handling).
* **`src/utils`** – Utility functions (encryption helpers, formatters).
* **`src/abi`** – TypeScript definitions of contract ABIs for type-safe interaction.

## Contributing

We welcome contributions! If you want to add support for a new feature or contract:

* **Open an issue** or **draft a proposal** for discussion if it's a significant addition.
* Follow the coding style (run `npm run lint` to ensure ESLint passes).
* Add unit tests for any new modules if possible.

## TODOs and Future Plans

* [ ] **Implement DataRefinerRegistry module:** allow DLP owners to register and update data refiners.
* [ ] **Implement QueryEngine and ComputeEngine modules:** enabling the data query flow (permissions, payments, result handling).
* [ ] **Event listening utilities:** e.g. a helper to wait for a `ProofAdded` event or query completion events instead of manual polling.
* [ ] **DLP Factory support:** add functions to create new DLPs via the DLP root contract, and to look up existing DLPs by ID or owner.
* [ ] **Comprehensive Testing:** create a suite of tests (using Hardhat or Foundry scripts with Moksha testnet or local fork).
* [ ] **Documentation Site:** expand the README into a full documentation site with guides.