# Vana SDK

A TypeScript library for interacting with Vana Network smart contracts, focusing on gasless data portability and permissions management.

## 📦 Installation

```bash
npm install vana-sdk
```

[![npm version](https://img.shields.io/npm/v/vana-sdk)](https://www.npmjs.com/package/vana-sdk)

➡️ [View on npm](https://www.npmjs.com/package/vana-sdk)

## Features

### ✅ **Data Portability & Permissions (v1.0)**
- **Gasless Permission Grants:** Complete EIP-712 based permission flow with relayer support
- **Permission Revocation:** Secure gasless permission revocation
- **Data File Management:** Query and manage user data files
- **Type-Safe Contracts:** Low-level access to all Vana protocol contracts with full TypeScript support

### 🔄 **Upcoming Features**
- **Data Contribution Workflow:** Submit data to DLPs and request validation
- **Data Liquidity Pool Management:** Create and manage DLPs
- **Query & Access Control:** Advanced data querying capabilities
- **TEE Integration:** Direct TEE computation workflows

## Architecture

The Vana SDK v1.0 follows a **resource-oriented architecture** with three main controllers:

- **`vana.permissions`** - Gasless permission grants and revocations
- **`vana.data`** - User data file management  
- **`vana.protocol`** - Low-level contract access for advanced use cases

## Quick Start

```typescript
import { Vana } from 'vana-sdk'
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mokshaTestnet } from 'vana-sdk/chains'

// 1. Set up your wallet client
const account = privateKeyToAccount('0x...')
const walletClient = createWalletClient({
  account,
  chain: mokshaTestnet,
  transport: http('https://rpc.moksha.vana.org')
})

// 2. Initialize the Vana SDK
const vana = new Vana({
  walletClient,
  // relayerUrl: 'https://custom-relayer.com' // Optional, defaults to production
})

// 3. Grant permission for data access (gasless!)
const txHash = await vana.permissions.grant({
  to: '0x1234...', // Application address
  operation: 'llm_inference',
  parameters: {
    prompt: 'Analyze my data for insights',
    maxTokens: 1000,
    files: [12, 15, 28] // File IDs
  }
})

console.log('Permission granted!', txHash)

// 4. Get user data files
const files = await vana.data.getUserFiles({
  owner: '0x...' // User address
})

console.log('User files:', files)

// 5. Revoke a permission
await vana.permissions.revoke({
  grantId: '0xgrant...' // Grant ID to revoke
})

// 6. Access low-level contracts (escape hatch)
const dataRegistry = vana.protocol.getContract('DataRegistry')
console.log('DataRegistry:', dataRegistry.address, dataRegistry.abi)
```

## Core Concepts

### Gasless Permissions

The heart of Vana SDK v1.0 is the gasless permission system. Users can grant applications access to their data without paying gas fees:

```typescript
// The complete flow is handled automatically:
// 1. Parameter serialization & hashing  
// 2. Off-chain storage via relayer
// 3. Nonce retrieval from PermissionRegistry
// 4. EIP-712 signature composition  
// 5. User signature via wallet
// 6. Transaction relay & gas payment
// 7. Return transaction hash

const txHash = await vana.permissions.grant({
  to: applicationAddress,
  operation: 'data_analysis', 
  parameters: {
    // Any structured data for the operation
    model: 'llm-v1',
    prompt: 'Summarize my data',
    outputFormat: 'json'
  }
})
```

### Data Management

Query user data files with a simple interface:

```typescript
const files = await vana.data.getUserFiles({ owner: userAddress })

files.forEach(file => {
  console.log(`File ${file.id}: ${file.url}`)
  console.log(`Added at block: ${file.addedAtBlock}`)
})
```

*Note: `getUserFiles` returns mock data in v1.0. Real data querying will be available in a future version.*

### Low-Level Access

For advanced use cases, access any Vana contract directly:

```typescript
// Get contract info
const permissionRegistry = vana.protocol.getContract('PermissionRegistry')
const dataRegistry = vana.protocol.getContract('DataRegistry') 

// Use with viem for custom interactions
import { createPublicClient, http } from 'viem'

const publicClient = createPublicClient({
  chain: vana.walletClient.chain,
  transport: http()
})

const nonce = await publicClient.readContract({
  address: permissionRegistry.address,
  abi: permissionRegistry.abi,
  functionName: 'userNonce',
  args: [userAddress]
})
```

## Error Handling

The SDK provides comprehensive error handling with specific error types:

```typescript
import { 
  RelayerError, 
  UserRejectedRequestError, 
  InvalidConfigurationError,
  ContractNotFoundError 
} from 'vana-sdk'

try {
  await vana.permissions.grant(params)
} catch (error) {
  if (error instanceof UserRejectedRequestError) {
    console.log('User rejected the signature request')
  } else if (error instanceof RelayerError) {
    console.log('Relayer service error:', error.statusCode)
  } else {
    console.log('Unexpected error:', error.message)
  }
}
```

## Configuration

### Supported Networks

- **Moksha Testnet**: Chain ID `14800`
- **Vana Mainnet**: Chain ID `1480`

### Relayer Configuration

```typescript
const vana = new Vana({
  walletClient,
  relayerUrl: 'https://custom-relayer.com' // Optional
})

// Default relayer URLs:
// Production: https://relayer.vana.org  
// Moksha: https://relayer.moksha.vana.org
```

### Environment Setup

Add network to your wallet:

```
Network Name: VANA - Moksha  
RPC URL: https://rpc.moksha.vana.org
Chain ID: 14800
Currency: VANA
Explorer: https://moksha.vanascan.io
```

## Demo Application

See the complete reference implementation at `/examples/data-wallet-reference` that demonstrates:

- Wallet connection with RainbowKit
- SDK initialization and configuration
- Permission grant and revoke flows
- Data file management
- Error handling and user feedback

```bash
cd examples/data-wallet-reference
npm install
npm run dev
```

## Storage API

The Vana SDK includes a powerful storage abstraction layer that provides a unified interface for different storage providers. This allows applications to seamlessly switch between storage backends without changing their code.

### Supported Storage Providers

- **IPFS** - Decentralized storage via Pinata or other IPFS services
- **Google Drive** - Cloud storage with OAuth2 authentication (coming soon)

### Basic Usage

```typescript
import { StorageManager, IPFSStorage } from 'vana-sdk'

// Initialize storage manager
const storageManager = new StorageManager()

// Register IPFS provider
const ipfsStorage = new IPFSStorage({
  apiEndpoint: '/api/ipfs/upload', // Your IPFS upload endpoint
  gatewayUrl: 'https://gateway.pinata.cloud/ipfs'
})
storageManager.register('ipfs', ipfsStorage, true) // true = default provider

// Upload file
const file = new Blob(['encrypted data'], { type: 'application/octet-stream' })
const result = await storageManager.upload(file, 'my-file.encrypted')

console.log('File uploaded:', result.url)
```

### Google Drive Integration

```typescript
import { GoogleDriveStorage } from 'vana-sdk'

// Configure Google Drive storage (requires OAuth setup)
const googleDriveStorage = new GoogleDriveStorage({
  accessToken: 'oauth2_access_token',
  refreshToken: 'oauth2_refresh_token',
  clientId: 'your_client_id',
  clientSecret: 'your_client_secret',
  folderId: 'optional_folder_id' // Upload to specific folder
})

storageManager.register('google-drive', googleDriveStorage)

// Upload to Google Drive specifically
const result = await storageManager.upload(file, 'my-file.dat', 'google-drive')
```

### Storage Provider Interface

All storage providers implement the same interface:

```typescript
interface StorageProvider {
  upload(file: Blob, filename?: string): Promise<StorageUploadResult>
  download(url: string): Promise<Blob>
  list(options?: StorageListOptions): Promise<StorageFile[]>
  delete(url: string): Promise<boolean>
  getConfig(): StorageProviderConfig
}
```

### Storage with Encryption

The storage API integrates seamlessly with the Vana encryption protocol:

```typescript
import { generateEncryptionKey, encryptUserData } from 'vana-sdk'

// Generate encryption key
const encryptionKey = await generateEncryptionKey(walletClient)

// Encrypt data
const plainData = new Blob(['sensitive user data'])
const encryptedData = await encryptUserData(plainData, encryptionKey)

// Upload encrypted data
const result = await storageManager.upload(encryptedData, 'encrypted-file.bin')

// Later: download and decrypt
const downloadedData = await storageManager.download(result.url)
const decryptedData = await decryptUserData(downloadedData, encryptionKey)
```

## API Reference

### `Vana`

Main SDK class and entry point.

```typescript
const vana = new Vana(config: VanaConfig)
```

### `vana.permissions`

Permission management controller.

```typescript
await vana.permissions.grant(params: GrantPermissionParams): Promise<Hash>
await vana.permissions.revoke(params: RevokePermissionParams): Promise<Hash>
```

### `vana.data`

Data file management controller.

```typescript
await vana.data.getUserFiles(params: { owner: Address }): Promise<UserFile[]>
```

### `vana.protocol`

Low-level contract access controller.

```typescript
vana.protocol.getContract(contractName: VanaContract): ContractInfo
vana.protocol.getAvailableContracts(): VanaContract[]
```

## Migration from v0.x

If upgrading from previous versions:

1. Replace `VanaProvider` with `Vana`
2. Update wallet client configuration
3. Use new resource-oriented API (`vana.permissions.grant` vs direct contract calls)
4. Update error handling for new error types

## Contributing

We welcome contributions! Please:

- Open an issue for discussion before major changes
- Follow existing code style and patterns  
- Add tests for new functionality
- Update documentation as needed

## License

ISC
