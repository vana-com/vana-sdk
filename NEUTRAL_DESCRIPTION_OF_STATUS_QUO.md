# Vana SDK Relayer Pattern Technical Specification

## Overview

The Vana SDK implements a relayer pattern through optional callback functions configured at SDK initialization. This pattern enables blockchain transaction submission via an intermediary server that maintains a funded wallet for gas fee payment.

## Architecture

### Component Roles

**Client SDK:** Prepares transactions, collects user signatures, invokes configured callbacks.

**Developer-Implemented Transport:** HTTP endpoints, WebSocket connections, or other communication mechanisms between client and server.

**Server SDK:** Verifies signatures, constructs blockchain transactions, submits using server wallet.

**Blockchain:** Receives transactions from server wallet, executes smart contract methods.

### Configuration Model

The pattern is enabled through the `relayerCallbacks` configuration object during SDK initialization:

```typescript
const vana = Vana({
  walletClient: WalletClient,
  relayerCallbacks: RelayerCallbacks,
});
```

## Type Definitions

### Core Interfaces

```typescript
interface RelayerCallbacks {
  // EIP-712 Signed Operations (7 callbacks)
  submitPermissionGrant?: (
    typedData: PermissionGrantTypedData,
    signature: Hash,
  ) => Promise<Hash>;
  submitPermissionRevoke?: (
    typedData: GenericTypedData,
    signature: Hash,
  ) => Promise<Hash>;
  submitTrustServer?: (
    typedData: TrustServerTypedData,
    signature: Hash,
  ) => Promise<Hash>;
  submitUntrustServer?: (
    typedData: UntrustServerTypedData,
    signature: Hash,
  ) => Promise<Hash>;
  submitAddAndTrustServer?: (
    typedData: AddAndTrustServerTypedData,
    signature: Hash,
  ) => Promise<Hash>;
  submitAddPermission?: (
    typedData: GenericTypedData,
    signature: Hash,
  ) => Promise<Hash>;
  submitAddServerFilesAndPermissions?: (
    typedData: ServerFilesAndPermissionTypedData,
    signature: Hash,
  ) => Promise<Hash>;

  // Non-Signed Operations (4 callbacks)
  submitFileAddition?: (
    url: string,
    userAddress: string,
  ) => Promise<{ fileId: number; transactionHash: Hash }>;
  submitFileAdditionWithPermissions?: (
    url: string,
    userAddress: string,
    permissions: Array<{ account: string; key: string }>,
  ) => Promise<{ fileId: number; transactionHash: Hash }>;
  submitFileAdditionComplete?: (params: {
    url: string;
    userAddress: Address;
    permissions: Array<{ account: Address; key: string }>;
    schemaId: number;
    ownerAddress?: Address;
  }) => Promise<{ fileId: number; transactionHash: Hash }>;
  storeGrantFile?: (grantData: GrantFile) => Promise<string>;
}
```

### Type Aliases

```typescript
type Hash = `0x${string}`;
type Address = `0x${string}`;
```

### Typed Data Base Structure

```typescript
interface GenericTypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, any>;
}
```

## Operation Categories

The SDK supports eleven relayer operations divided into two categories based on their signature requirements.

### Category 1: EIP-712 Signed Operations

Seven operations utilize EIP-712 typed data signatures. These operations share a common server-side entry point and routing mechanism.

#### Server Entry Point

All EIP-712 operations are processed through a single server-side function:

```typescript
handleRelayerRequest(
  sdk: VanaInstance,
  payload: {
    typedData: GenericTypedData;
    signature: Hash;
    expectedUserAddress?: Address;
  }
): Promise<TransactionResult>
```

#### Processing Steps

1. **Signature Recovery:** `recoverTypedDataAddress` extracts the signer's address from the signature
2. **Address Validation:** If `expectedUserAddress` is provided, verifies it matches the recovered signer
3. **Operation Routing:** Uses `typedData.primaryType` field to route to the appropriate SDK method

#### Routing Table

| primaryType                  | Server SDK Method                                            |
| ---------------------------- | ------------------------------------------------------------ |
| `"Permission"`               | `sdk.permissions.submitSignedGrant()`                        |
| `"RevokePermission"`         | `sdk.permissions.submitSignedRevoke()`                       |
| `"TrustServer"`              | `sdk.permissions.submitSignedTrustServer()`                  |
| `"UntrustServer"`            | `sdk.permissions.submitSignedUntrustServer()`                |
| `"AddServer"`                | `sdk.permissions.submitSignedAddAndTrustServer()`            |
| `"RegisterGrantee"`          | `sdk.permissions.submitSignedRegisterGrantee()`              |
| `"ServerFilesAndPermission"` | `sdk.permissions.submitSignedAddServerFilesAndPermissions()` |

### Category 2: Non-Signed Operations

Four operations that do not require user signatures. The server directly executes transactions using its own wallet.

## Detailed Operation Specifications

### EIP-712 Operations

#### 1. Permission Grant

**Client Invocation:** `vana.permissions.grant(params: GrantPermissionParams)`

**Callback:** `submitPermissionGrant`

**Typed Data:**

```typescript
{
  domain: {
    name: "VanaDataPortabilityPermissions",
    version: "1",
    chainId: number,
    verifyingContract: Address
  },
  types: {
    Permission: [
      { name: "nonce", type: "uint256" },
      { name: "granteeId", type: "uint256" },
      { name: "grant", type: "string" },
      { name: "fileIds", type: "uint256[]" }
    ]
  },
  primaryType: "Permission",
  message: {
    nonce: bigint,
    granteeId: bigint,
    grant: string,        // IPFS URL containing grant parameters
    fileIds: bigint[]
  }
}
```

**Contract Method:** `DataPortabilityPermissions.addPermission(permissionInput, signature)`

#### 2. Permission Revoke

**Client Invocation:** `vana.permissions.revoke(params: RevokePermissionParams)`

**Callback:** `submitPermissionRevoke`

**Typed Data:**

```typescript
{
  domain: { /* same as Permission Grant */ },
  types: {
    RevokePermission: [
      { name: "nonce", type: "uint256" },
      { name: "permissionId", type: "uint256" }
    ]
  },
  primaryType: "RevokePermission",
  message: {
    nonce: bigint,
    permissionId: bigint
  }
}
```

**Contract Method:** `DataPortabilityPermissions.revokePermission(revokePermissionInput, signature)`

#### 3. Trust Server

**Client Invocation:** `vana.permissions.trustServer(params: TrustServerParams)`

**Callback:** `submitTrustServer`

**Typed Data:**

```typescript
{
  domain: {
    name: "DataPortabilityGrantees",
    version: "1",
    chainId: number,
    verifyingContract: Address
  },
  types: {
    TrustServer: [
      { name: "nonce", type: "uint256" },
      { name: "serverAddress", type: "address" }
    ]
  },
  primaryType: "TrustServer",
  message: {
    nonce: bigint,
    serverAddress: Address
  }
}
```

**Contract Method:** `DataPortabilityGrantees.trustServer(trustServerInput, signature)`

#### 4. Untrust Server

**Client Invocation:** `vana.permissions.untrustServer(params: UntrustServerParams)`

**Callback:** `submitUntrustServer`

**Typed Data:**

```typescript
{
  domain: { /* same as Trust Server */ },
  types: {
    UntrustServer: [
      { name: "nonce", type: "uint256" },
      { name: "serverAddress", type: "address" }
    ]
  },
  primaryType: "UntrustServer",
  message: {
    nonce: bigint,
    serverAddress: Address
  }
}
```

**Contract Method:** `DataPortabilityGrantees.untrustServer(untrustServerInput, signature)`

#### 5. Add and Trust Server

**Client Invocation:** `vana.permissions.addAndTrustServer(params: AddAndTrustServerParams)`

**Callback:** `submitAddAndTrustServer`

**Typed Data:**

```typescript
{
  domain: { /* same as Trust Server */ },
  types: {
    AddServer: [
      { name: "nonce", type: "uint256" },
      { name: "serverAddress", type: "address" },
      { name: "serverURL", type: "string" },
      { name: "serverKYCAddress", type: "address" }
    ]
  },
  primaryType: "AddServer",
  message: {
    nonce: bigint,
    serverAddress: Address,
    serverURL: string,
    serverKYCAddress: Address
  }
}
```

**Contract Method:** `DataPortabilityGrantees.addAndTrustServer(addServerInput, signature)`

#### 6. Register Grantee

**Client Invocation:** `vana.permissions.registerGrantee(params: RegisterGranteeParams)`

**Callback:** `submitAddPermission`

**Typed Data:**

```typescript
{
  domain: { /* same as Trust Server */ },
  types: {
    RegisterGrantee: [
      { name: "nonce", type: "uint256" }
    ]
  },
  primaryType: "RegisterGrantee",
  message: {
    nonce: bigint
  }
}
```

**Contract Method:** `DataPortabilityGrantees.registerGrantee(registerGranteeInput, signature)`

#### 7. Server Files and Permissions

**Client Invocation:** `vana.permissions.addServerFilesAndPermissions(params: ServerFilesAndPermissionsParams)`

**Callback:** `submitAddServerFilesAndPermissions`

**Typed Data:**

```typescript
{
  domain: { /* same as Permission Grant */ },
  types: {
    ServerFilesAndPermission: [
      { name: "nonce", type: "uint256" },
      { name: "serverAddress", type: "address" },
      { name: "grant", type: "string" },
      { name: "fileIds", type: "uint256[]" }
    ]
  },
  primaryType: "ServerFilesAndPermission",
  message: {
    nonce: bigint,
    serverAddress: Address,
    grant: string,
    fileIds: bigint[]
  }
}
```

**Contract Method:** `DataPortabilityPermissions.addServerFilesAndPermissions(serverFilesAndPermissionInput, signature)`

### Non-Signed Operations

#### 8. File Addition (Deprecated)

**Client Invocation:** `vana.data.addFile(url: string)`

**Callback:** `submitFileAddition`

**Parameters:**

- `url`: string
- `userAddress`: string

**Server Execution:** `vana.data.addFileWithPermissions(url, userAddress, [])`

**Contract Method:** `DataRegistry.addFileWithEncryptedPermissions(url, encryptedPermissions)`

**Return Structure:** `{ fileId: number; transactionHash: Hash }`

#### 9. File Addition with Permissions (Deprecated)

**Client Invocation:** `vana.data.addFileWithPermissions(url: string, permissions: Array)`

**Callback:** `submitFileAdditionWithPermissions`

**Parameters:**

- `url`: string
- `userAddress`: string
- `permissions`: Array<{ account: string; key: string }>

**Server Execution:** `vana.data.addFileWithPermissions(url, userAddress, permissions)`

**Contract Method:** `DataRegistry.addFileWithEncryptedPermissions(url, encryptedPermissions)`

**Return Structure:** `{ fileId: number; transactionHash: Hash }`

#### 10. File Addition Complete

**Client Invocation:** `vana.data.addFileWithEncryptedPermissionsAndSchema(url, ownerAddress, permissions, schemaId)`

**Callback:** `submitFileAdditionComplete`

**Parameters:**

```typescript
{
  url: string;
  userAddress: Address;
  permissions: Array<{ account: Address; key: string }>;
  schemaId: number;
  ownerAddress?: Address;
}
```

**Server Execution:** `vana.data.addFileWithEncryptedPermissionsAndSchema(url, ownerAddress, permissions, schemaId)`

**Contract Method:** `DataRegistry.addFileWithEncryptedPermissionsAndSchema(url, ownerAddress, encryptedPermissions, schemaId)`

**Return Structure:** `{ fileId: number; transactionHash: Hash }`

#### 11. Grant File Storage

**Client Invocation:** Called internally when `grantUrl` parameter is not provided

**Callback:** `storeGrantFile`

**Parameters:**

- `grantData`: GrantFile object

**Server Execution:** Stores JSON-serialized grant data to storage system

**Return Value:** String URL (typically `ipfs://...`)

## Transaction Flows

### EIP-712 Operation Flow

1. Client SDK method invocation with parameters
2. SDK retrieves user nonce from blockchain
3. SDK constructs typed data structure
4. User signs typed data via wallet
5. SDK invokes configured callback with typedData and signature
6. Developer's callback implementation transmits to server
7. Server invokes `handleRelayerRequest` with received data
8. Server SDK recovers and validates signer address
9. Server SDK routes to operation-specific method based on primaryType
10. Server SDK constructs contract transaction parameters
11. Server wallet signs and submits blockchain transaction
12. Server returns transaction hash to client
13. Client SDK returns TransactionResult object

### Non-Signed Operation Flow

1. Client SDK method invocation with parameters
2. SDK invokes configured callback with operation parameters
3. Developer's callback implementation transmits to server
4. Server invokes corresponding SDK method directly
5. Server SDK constructs contract transaction
6. Server wallet signs and submits blockchain transaction
7. Server returns operation result to client
8. Client SDK returns result to application

## Network Configuration

### Supported Networks

| Network        | Chain ID | RPC Endpoint    |
| -------------- | -------- | --------------- |
| Moksha Testnet | 14800    | Default via SDK |
| Vana Mainnet   | 1480     | Default via SDK |

### Contract Resolution

Contracts are resolved dynamically using `getContractAddress(chainId, contractName)`:

| Contract Name                | Purpose                             |
| ---------------------------- | ----------------------------------- |
| `DataPortabilityPermissions` | Permission management operations    |
| `DataPortabilityGrantees`    | Grantee and server trust operations |
| `DataRegistry`               | File registration operations        |

### EIP-712 Domains

Two domain configurations are utilized:

**Permissions Domain:**

- name: `"VanaDataPortabilityPermissions"`
- version: `"1"`
- chainId: Network-specific
- verifyingContract: DataPortabilityPermissions address

**Grantees Domain:**

- name: `"DataPortabilityGrantees"`
- version: `"1"`
- chainId: Network-specific
- verifyingContract: DataPortabilityGrantees address

## Data Transformations

### Typed Data to Contract Parameters

The `message` fields in typed data structures map to contract method parameters:

| Operation                    | Typed Data Message                                      | Contract Parameter                     |
| ---------------------------- | ------------------------------------------------------- | -------------------------------------- |
| Permission Grant             | `{ nonce, granteeId, grant, fileIds }`                  | `PermissionInput` struct               |
| Permission Revoke            | `{ nonce, permissionId }`                               | `RevokePermissionInput` struct         |
| Trust Server                 | `{ nonce, serverAddress }`                              | `TrustServerInput` struct              |
| Untrust Server               | `{ nonce, serverAddress }`                              | `UntrustServerInput` struct            |
| Add and Trust Server         | `{ nonce, serverAddress, serverURL, serverKYCAddress }` | `AddServerInput` struct                |
| Register Grantee             | `{ nonce }`                                             | `RegisterGranteeInput` struct          |
| Server Files and Permissions | `{ nonce, serverAddress, grant, fileIds }`              | `ServerFilesAndPermissionInput` struct |

### Grant Parameter Handling

For operations involving permissions, the actual grant parameters are stored externally:

1. Client constructs GrantFile object with permission details
2. GrantFile is serialized to JSON and stored (typically IPFS)
3. Storage URL is included in typed data as the `grant` field
4. Contract stores the URL reference, not the full grant data

## Implementation Requirements

### Client Requirements

- Wallet connection for user signatures
- Implementation of RelayerCallbacks interface
- HTTP client or transport mechanism for server communication

### Server Requirements

- Funded wallet with native tokens for gas fees
- Access to server-side SDK (`@vana/sdk/node`)
- Implementation of endpoints corresponding to client callbacks
- For file operations: Storage system access (IPFS, S3, etc.)

### Security Considerations

**Signature Verification:** All EIP-712 operations verify that the signature corresponds to the typed data.

**Address Validation:** Optional `expectedUserAddress` parameter enables verification that the signer matches the expected user.

**Nonce Management:** Each user maintains a nonce to prevent replay attacks.

**Domain Separation:** Different contract operations use distinct EIP-712 domains to prevent cross-contract signature reuse.

## Deprecation Notes

The following callbacks are marked deprecated as of v2.0.0:

- `submitFileAddition`: Use `submitFileAdditionComplete`
- `submitFileAdditionWithPermissions`: Use `submitFileAdditionComplete`

Deprecated callbacks remain functional but will be removed in v3.0.0.
