# **Vana SDK: Product Requirements Document (PRD)**

- **Version:** 1.0
- **Status:** Final
- **Author:** Protocol Architect
- **Stakeholders:** Data Wallet Team, Protocol Engineering, Developer Experience

## 1. Overview

### 1.1. Executive Summary

This document specifies the architecture and functional requirements for the Vana SDK v1.0. The SDK's purpose is to provide a world-class developer experience for the Vana Protocol by abstracting its underlying technological heterogeneity—blockchain, Trusted Execution Environments (TEEs), relayers, and decentralized storage—into a single, coherent TypeScript library.

The initial version will focus exclusively on enabling the **Gasless Data Portability Permission Flow** required by the Data Wallet team. The architecture is explicitly designed to be a durable, scalable foundation that will accommodate all future protocol features.

### 1.2. Guiding Principles

The Vana SDK will not be a thin wrapper around our contracts, nor will it be a monolithic, opinionated framework. It will adhere to a set of core principles derived from best-in-class developer tools:

- **Product-Centric Abstraction (The Stripe Philosophy):** The SDK's public API will be organized by logical protocol **resources** (`permissions`, `data`), not by the underlying technology. Developers will interact with intuitive concepts, hiding the complex orchestration of on-chain and off-chain systems.
- **Best-in-Class Engine (The Viem Philosophy):** The SDK will not reinvent any part of the blockchain interaction layer. It will use a `viem` `WalletClient`, provided by the developer, as its dedicated engine for all on-chain signing and communication. The SDK will be a consumer of `viem`, not a replacement for it.
- **The Orchestration Client Model:** The SDK will be implemented as a primary `Vana` class. This class is not a `viem` client, but a higher-level **orchestrator** that uses a `viem` client for its on-chain needs. This correctly models the relationship where Vana is a complete ecosystem that _has_ a blockchain, rather than being _just_ a blockchain.
- **Progressive Disclosure:** Provide high-level abstractions for 95% of use cases. For the other 5%, provide clean, documented "escape hatches" to the lower-level protocol primitives (contract addresses, ABIs).

### 1.3. Target Audience

This document is for the engineer assigned to build the SDK. It assumes a high degree of technical competence but makes no assumptions about prior knowledge of the Vana Protocol's internal mechanics. Every requirement is specified with the detail and context necessary to ensure a correct, robust, and philosophically-aligned implementation.

## 2. The Strategic Imperative

An application developer building on Vana today faces an unacceptable level of friction. A single logical workflow, like granting a permission, requires manual interaction with multiple smart contracts, off-chain services, and complex cryptographic sequences. This is the single greatest impediment to ecosystem adoption.

The SDK's strategic purpose is to solve this by transforming the developer experience from a complex, error-prone chore into a simple, elegant, and secure process. The success of this SDK is measured by the velocity at which new, innovative applications can be built on the Vana Protocol.

## 3. Architectural Blueprint

### 3.1. The `Vana` Class: The Public Entry Point

The SDK will expose a single primary class, `Vana`. This class is the developer's sole entry point into the Vana ecosystem. It is an orchestrator, configured with the necessary context to interact with all parts of the protocol.

**Constructor and Configuration:**
The class will be instantiated with a configuration object.

- `new Vana(config: VanaConfig)`
  - **`config.walletClient`**: A `viem` `WalletClient`. This is a **required** dependency. The SDK uses this client to derive the user's address, access the chain ID, and request signatures for all on-chain actions.
  - **`config.relayerUrl?`**: `string`. An optional URL for the Vana Relayer Service. This MUST default to the canonical production URL if not provided.

### 3.2. Resource Controllers: Logical API Organization

To ensure the SDK is scalable and intuitive, its functionality will be structured into internal **resource controllers**. The main `Vana` class will instantiate these controllers and expose them as namespaced, read-only properties. This provides the "Stripe-like" logical separation.

```typescript
class Vana {
  public readonly permissions: PermissionsController;
  public readonly data: DataController;
  public readonly protocol: ProtocolController;

  constructor(config: VanaConfig) {
    const sharedContext = {
      /* walletClient, relayerUrl, etc. */
    };
    this.permissions = new PermissionsController(sharedContext);
    this.data = new DataController(sharedContext);
    this.protocol = new ProtocolController(sharedContext);
  }
}
```

## 4. Functional Requirements

### 4.1. `vana.permissions`: The Permissions Controller

This controller handles all workflows related to granting and revoking data access.

#### `async grant(params: GrantPermissionParams): Promise<Hash>`

- **Description:** Implements the complete, multi-stage Gasless Verifiable Permissions Flow. This is the most critical and complex method in v1.0.
- **Parameters:** See Appendix A.
- **Return Value:** A `Promise` resolving to the final `Hash` of the on-chain transaction.
- **Required Internal Sequence:**
  1.  **Parameter Serialization:** Serialize the `params.parameters` object into a stable, canonical JSON string.
  2.  **Cryptographic Commitment:** Compute the `keccak256` hash of the serialized parameters from Step 1. This is the `parametersHash`.
  3.  **Off-Chain Storage:** Make a `POST` request to the configured `relayerUrl`'s parameter storage endpoint. The request body must contain the full, serialized parameters. The relayer will store this data (e.g., on IPFS) and return a content-addressable `grantUrl`.
  4.  **Nonce Retrieval:** Using the `walletClient`, make a read-only `eth_call` to the `PermissionRegistry` contract to fetch the user's current `nonce` for their address.
  5.  **EIP-712 Message Composition:** Construct the precise `PermissionGrant` EIP-712 typed data object, as defined in Appendix B. This object includes the `grantUrl`, `parametersHash`, and `nonce`.
  6.  **User Signature:** Call the `walletClient.signTypedData` method with the composed domain and message. This will prompt the user's wallet for a signature.
  7.  **Relay for Execution:** Make a `POST` request to the `relayerUrl`'s transaction submission endpoint. The request body must contain the `PermissionGrant` message from Step 5 and the `signature` from Step 6.
  8.  **Return Transaction Hash:** The relayer service is responsible for submitting the transaction and paying the gas. The SDK must await the relayer's response, which will contain the final on-chain transaction hash. This hash is then returned to the developer.

#### `async revoke(params: RevokePermissionParams): Promise<Hash>`

- **Description:** Implements the gasless flow for revoking a previously granted permission.
- **Parameters:** See Appendix A.
- **Return Value:** A `Promise` resolving to the `Hash` of the on-chain revocation transaction.
- **Required Internal Sequence:** This method will follow a similar sign-and-relay pattern. It will construct a typed EIP-712 message for revocation, request a user signature via the `walletClient`, and submit the signed payload to the relayer.

### 4.2. `vana.data`: The Data Controller

This controller handles workflows related to a user's data assets.

#### `async getUserFiles(params: { owner: Address }): Promise<UserFile[]>`

- **Description:** Retrieves a list of data files registered to a specific owner address.
- **Parameters:** See Appendix A.
- **Return Value:** A `Promise` resolving to an array of `UserFile` objects.
- **v1.0 Implementation Detail:** The backing data source (subgraph) for this query is not yet available. This function **MUST be stubbed**. It will not perform any network requests and will return a hardcoded, static array of mock `UserFile` objects immediately. This is a critical requirement to unblock the Data Wallet team. See Appendix C for the required mock data structure.

### 4.3. `vana.protocol`: The Protocol Controller

This controller serves as the designated "escape hatch" for advanced developers.

#### `getContract(contractName: VanaContract): { address: Address, abi: Abi }`

- **Description:** Provides direct, low-level access to the addresses and ABIs of Vana's canonical smart contracts.
- **Action:** This function will look up the requested contract's details from an internal registry maintained within the SDK and return them. This allows a developer to construct their own `viem` contract interactions if the high-level abstractions are insufficient for their use case.

## 5. The Demo Application: The Reference Implementation

A core, non-negotiable deliverable for this project is a minimal but complete demo application. This serves as a living, unambiguous reference for how to use the SDK.

- **Location:** `/examples/data-wallet-reference` within the SDK monorepo.
- **Technology:** A simple, standalone React + Vite application.
- **Required Functionality:**
  1.  **Wallet Connection:** A button to connect a wallet (using a library like RainbowKit).
  2.  **SDK Instantiation:** The demo must show the correct way to instantiate the `Vana` class using the `walletClient` derived from the wallet connection. The instantiated `vana` object should be visible in the app's state.
  3.  **Data Display:** A button that calls `vana.data.getUserFiles` and displays the (mocked) results in a selectable list.
  4.  **Grant Permission Flow:** A "Grant Permission" button that uses the selected file IDs to call `vana.permissions.grant`. The UI must log the process (`"Awaiting signature..."`, `"Relaying transaction..."`) and display the final transaction hash with a link to the block explorer.
  5.  **Revoke Permission Flow:** A simple UI (e.g., an input field and a button) to demonstrate the `vana.permissions.revoke` action.

## 6. Non-Functional Requirements

- **Type Safety:** The SDK must be written in TypeScript with strict mode enabled. All public methods and types must be exported.
- **Error Handling:** The SDK must define and throw custom, typed errors for predictable failure modes (e.g., `RelayerError`, `UserRejectedRequestError`, `InvalidConfigurationError`).
- **Testing:** A comprehensive test suite using `vitest` must be implemented, covering the internal logic of the controllers and mocking external network requests.
- **Documentation:** All public classes, methods, and types must have full JSDoc comments. The `README.md` must be updated with a clear Quick Start guide reflecting the final architecture.

## 7. Scope Definition (v1.0)

#### In Scope:

- The `Vana` class architecture with resource controllers.
- Full implementation of the gasless `grant` and `revoke` permission flows.
- A stubbed implementation of `getUserFiles` returning mock data.
- The low-level `getContract` utility.
- The complete demo application as specified.

#### Out of Scope:

- Any direct interaction with TEEs.
- Any data upload or file management utilities.
- A stateful `User` model (`vana.me()`).
- Any user-paid (non-relayed) transaction flows.
- Performance caching layers.

---

## Appendix A: Core Data Structures (Public Types)

```typescript
import type { WalletClient, Address, Hash, Abi } from 'viem';

// The configuration object for the main Vana class.
export interface VanaConfig {
  walletClient: WalletClient;
  relayerUrl?: string;
}

// Represents a user's registered data file.
export interface UserFile {
  id: number;
  url: string;
  ownerAddress: Address;
  addedAtBlock: bigint;
}

// Parameters for the `vana.permissions.grant` method.
export interface GrantPermissionParams {
  to: Address;                   // The on-chain identity of the application.
  operation: string;             // The class of computation, e.g., "llm_inference".
  parameters: Record<string, any>; // The full, off-chain parameters (e.g., LLM prompt).
}

// Parameters for the `vana.permissions.revoke` method.
export interface RevokePermissionParams {
  grantId: Hash; // The keccak256 hash of the original PermissionGrant struct to revoke.
}

// A union type of all canonical Vana contract names.
export type VanaContract = "PermissionRegistry" | "DataRegistry" | "TEEPoool" | /* ...etc. */;
```

## Appendix B: EIP-712 `PermissionGrant` Definition

The SDK MUST construct and sign data conforming to this structure for `vana.permissions.grant`.

- **Domain:**
  ```json
  {
    "name": "Vana Permission Registry",
    "version": "1",
    "chainId": 14800, // or other chainId from the walletClient
    "verifyingContract": "0x...PermissionRegistryAddress"
  }
  ```
- **Types:**
  ```json
  {
    "PermissionGrant": [
      { "name": "from", "type": "address" },
      { "name": "to", "type": "address" },
      { "name": "operation", "type": "string" },
      { "name": "grantUrl", "type": "string" },
      { "name": "parametersHash", "type": "bytes32" },
      { "name": "nonce", "type": "uint256" }
    ]
  }
  ```

## Appendix C: Mock Data for `getUserFiles` Stub

The stubbed `vana.data.getUserFiles` method MUST return the following structure and data:

```typescript
[
  {
    id: 12,
    url: "ipfs://Qm...",
    ownerAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    addedAtBlock: 123456n,
  },
  {
    id: 15,
    url: "googledrive://file_id/12345",
    ownerAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    addedAtBlock: 123490n,
  },
  {
    id: 28,
    url: "https://user-data.com/gmail_export.json",
    ownerAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    addedAtBlock: 123900n,
  },
];
```
