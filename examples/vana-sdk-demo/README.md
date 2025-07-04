# Vana SDK Demo

A demonstration of the Vana SDK showcasing major features including real relayer service, IPFS storage, canonical encryption, and permission management.

## ✨ Complete SDK Features Demonstrated

### 🔐 Canonical Encryption Protocol

- **Real OpenPGP Encryption**: Uses the standard Vana encryption protocol
- **Signature-Based Keys**: Signs "Please sign to retrieve your encryption key"
- **Parameter Encryption**: Demonstrates encrypting permission parameters
- **Protocol Compliance**: Compatible with all existing Vana encrypted data

### ⚡ Gasless Relayer Service

- **Real EIP-712 Signatures**: Proper signature verification
- **Blockchain Submission**: Actual PermissionRegistry contract interactions
- **Gas Payment**: Relayer covers transaction costs
- **Health Monitoring**: Real-time relayer status

### 🌐 IPFS Storage Integration

- **Pinata Integration**: Real decentralized storage
- **Parameter Storage**: Encrypted parameters stored on IPFS
- **Fallback Handling**: Graceful degradation when IPFS unavailable
- **Debug Endpoints**: IPFS monitoring and testing

### 📊 Data Management

- **User Files**: Real subgraph integration for file discovery
- **Permission Management**: Grant/revoke permissions with real blockchain calls
- **Clickable Data**: Interactive blockchain explorer links
- **Permission Display**: Shows current granted permissions

### 🎨 Modern UI with shadcn/ui

- **Professional Design**: Dark theme with consistent components
- **Responsive Layout**: Mobile-first approach
- **Loading States**: Proper UX feedback during operations
- **Accessibility**: Built-in ARIA support

## 🚀 Quick Start

```bash
# Install dependencies
npm install --legacy-peer-deps

# Set up environment (copy and configure)
cp .env.local.example .env.local

# Start development server
npm run dev

# Visit http://localhost:3000
```

## 🔧 Configuration

### Required Environment Variables

```bash
# Relayer Configuration
RELAYER_PRIVATE_KEY=0x3f572ac0f0671db5231100918c22296306be0ed77d4353f80ad8b4ea9317cf51

# Blockchain
CHAIN_RPC_URL=https://rpc.moksha.vana.org
CHAIN_ID=14800

# Subgraph
NEXT_PUBLIC_SUBGRAPH_URL=https://api.goldsky.com/api/public/project_cm168cz887zva010j39il7a6p/subgraphs/vana/7.0.1/gn

# Pinata IPFS (for real storage)
PINATA_JWT=your_pinata_jwt_token_here
PINATA_GATEWAY_URL=https://gateway.pinata.cloud
```

### Pinata Setup

1. Sign up at [pinata.cloud](https://app.pinata.cloud)
2. Create API key with permissions:
   - ✅ Files - Write
   - ✅ Gateways - Read
   - ✅ pinFileToIPFS
   - ✅ pinByHash
3. Copy JWT token to `PINATA_JWT`

## 🏗️ Architecture

### Core Components

- **Demo Page**: Main application demonstrating all SDK features
- **Relayer API**: Backend endpoints for gasless transactions
- **IPFS Storage**: Real decentralized parameter storage
- **Encryption Utils**: Canonical Vana protocol implementation

### SDK Integration

- **Provider Setup**: Vana SDK with wallet client integration
- **Real Operations**: No mocked data - all live blockchain interactions
- **Error Handling**: Comprehensive error states and user feedback
- **Type Safety**: Full TypeScript support throughout

## 📱 Features Showcase

### 1. Wallet Connection

- Rainbow Kit integration
- Real-time connection status
- Relayer health monitoring

### 2. Data Discovery

- Subgraph-powered file listing
- User-specific file filtering
- Clickable blockchain data (blocks, transactions, IPFS)

### 3. Permission Granting

- **Real Encryption**: Parameters encrypted with canonical Vana protocol
- **IPFS Storage**: Encrypted parameters stored on Pinata
- **Blockchain Submission**: Actual PermissionRegistry calls
- **Gas Coverage**: Relayer pays all fees

### 4. Permission Management

- View current permissions
- Interactive permission display
- Real blockchain data

## 🔬 Technical Highlights

### Encryption Implementation

```typescript
// Generate encryption key (canonical Vana protocol)
const encryptionKey = await generateEncryptionKey(walletClient);

// Encrypt parameters
const encryptedParams = await encryptUserData(parameterBlob, encryptionKey);

// Store on IPFS
const ipfsHash = await storeOnIPFS(encryptedParams);
```

### Real Relayer Service

```typescript
// EIP-712 signature verification
const isValid = await verifySignature(signature, address, data);

// Blockchain submission
const txHash = await submitToContract(validatedData);
```

## 🎯 Development Benefits

### For SDK Users

- **Complete Reference**: See all SDK features in action
- **Real Implementation**: No mocked data or placeholder functions
- **Copy-Paste Ready**: Use code patterns directly in your app
- **Best Practices**: Demonstrates proper SDK usage

### For Protocol Development

- **Integration Testing**: Real blockchain and IPFS interactions
- **User Experience**: Complete user journey from wallet to permissions
- **Performance Monitoring**: Real-world usage patterns
- **Debugging Tools**: Health checks and monitoring endpoints

This demo serves as both a showcase and a reference implementation for building complete Vana-powered applications.
