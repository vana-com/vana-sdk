# Vana SDK Demo

<div align="center">
  <h3>Complete Reference Implementation</h3>
  <p>A production-quality example showcasing all Vana SDK features with real blockchain interactions, encryption, and storage providers.</p>

  <img src="https://img.shields.io/badge/Next.js-14.x-blue" alt="Next.js 14" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vana%20SDK-1.x-purple" alt="Vana SDK" />
  <img src="https://img.shields.io/badge/shadcn%2Fui-Latest-green" alt="shadcn/ui" />
</div>

---

## 🎯 What This Demo Demonstrates

This is **not a toy example**—it's a comprehensive reference implementation that showcases every major Vana SDK feature with real production infrastructure:

### ✅ **Core SDK Features**

- **Gasless Permissions** - Real EIP-712 signatures and blockchain transactions
- **Data Management** - Live subgraph integration for file discovery
- **Encryption Protocol** - Complete encrypt-upload-decrypt workflows
- **Storage Integration** - Multiple providers (IPFS, Google Drive)
- **Error Handling** - Production-grade error states and user feedback

### 🏗️ **Production Infrastructure**

- **Real Relayer Service** - Actual gasless transaction submission
- **Live IPFS Integration** - Pinata storage with real decentralized hosting
- **Subgraph Queries** - Real-time blockchain data indexing
- **Health Monitoring** - Service status and performance tracking

### 🎨 **Professional UI/UX**

- **Modern Design** - shadcn/ui components with dark theme
- **Responsive Layout** - Mobile-first design approach
- **Loading States** - Proper UX feedback during async operations
- **Interactive Elements** - Real-time data updates and user interactions

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+** and npm
- **MetaMask** or compatible wallet
- **Test ETH** on Moksha testnet (get from faucet)

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Set up environment (copy and customize)
cp .env.local.example .env.local

# 3. Start development server
npm run dev

# 4. Open in browser
open http://localhost:3000
```

**⚡ Result:** Full-featured data wallet with encryption, gasless transactions, and IPFS storage.

---

## 🔧 Configuration

### Required Environment Variables

```bash
# Relayer Configuration (for gasless transactions)
RELAYER_PRIVATE_KEY=0x3f572ac0f0671db5231100918c22296306be0ed77d4353f80ad8b4ea9317cf51

# Blockchain Configuration
CHAIN_RPC_URL=https://rpc.moksha.vana.org
CHAIN_ID=14800

# Data Discovery (Subgraph)
NEXT_PUBLIC_SUBGRAPH_URL=https://api.goldsky.com/api/public/project_cm168cz887zva010j39il7a6p/subgraphs/vana/7.0.1/gn

# IPFS Storage (Pinata)
PINATA_JWT=your_pinata_jwt_token_here
PINATA_GATEWAY_URL=https://gateway.pinata.cloud
```

### Optional Configuration

```bash
# For user-managed IPFS (optional)
NEXT_PUBLIC_PINATA_JWT=user_pinata_jwt_for_client_side_uploads

# Custom styling (optional)
NEXT_PUBLIC_THEME=dark
```

---

## 🏗️ Architecture

### Application Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # Backend API routes
│   │   ├── health/        # Relayer health check
│   │   ├── ipfs/          # IPFS upload endpoint
│   │   ├── relay/         # Gasless transaction relay
│   │   └── v1/            # Vana protocol endpoints
│   ├── demo-page.tsx      # Main demo application
│   └── providers.tsx      # React context providers
├── components/            # UI components
│   ├── ui/                # shadcn/ui base components
│   ├── AddressDisplay.tsx # Blockchain address display
│   ├── FileCard.tsx       # Interactive file management
│   └── PermissionDisplay.tsx # Permission visualization
└── lib/                   # Utility libraries
    ├── blockchain.ts      # Blockchain helper functions
    ├── chains.ts          # Network configurations
    ├── explorer.ts        # Block explorer integration
    ├── relayer.ts         # Relayer service integration
    └── utils.ts           # General utilities
```

### Key Design Patterns

#### **1. Real Infrastructure Integration**

```typescript
// Real relayer service with health monitoring
const relayerHealth = await fetch("/api/health");

// Live subgraph queries for user data
const files = await vana.data.getUserFiles({
  owner: userAddress,
  subgraphUrl: process.env.NEXT_PUBLIC_SUBGRAPH_URL,
});
```

#### **2. Comprehensive Error Handling**

```typescript
try {
  const txHash = await vana.permissions.grant(params);
} catch (error) {
  if (error instanceof UserRejectedRequestError) {
    setStatus("User cancelled signature request");
  } else if (error instanceof RelayerError) {
    setStatus(`Relayer error: ${error.statusCode}`);
  }
}
```

#### **3. Progressive Enhancement**

```typescript
// Graceful fallback when services are unavailable
const storageProviders = {
  "app-ipfs": serverIPFS, // Always available
  ...(pinataJWT && {
    // Only if configured
    "user-ipfs": pinataStorage,
  }),
};
```

---

## 🎮 Feature Walkthrough

### 1. **Wallet Connection & SDK Initialization**

<details>
<summary>Click to expand</summary>

**What it demonstrates:**

- RainbowKit wallet connection
- Vana SDK initialization with real configuration
- Network validation and chain switching
- Relayer service health monitoring

**Code location:** `src/app/demo-page.tsx:136-208`

**Key features:**

- Automatic SDK setup on wallet connection
- Real-time service health monitoring
- Support for multiple storage providers
- Comprehensive error handling

</details>

### 2. **Data Discovery & Management**

<details>
<summary>Click to expand</summary>

**What it demonstrates:**

- Live subgraph integration for file discovery
- File lookup by ID functionality
- Real blockchain data display
- Interactive file selection interface

**Code location:** `src/app/demo-page.tsx:230-246`

**Key features:**

- Real subgraph queries for user file contributions
- File details from DataRegistry contracts
- Interactive file cards with metadata
- Graceful fallback to mock data when needed

</details>

### 3. **Gasless Permission Granting**

<details>
<summary>Click to expand</summary>

**What it demonstrates:**

- Complete EIP-712 signature workflow
- Real IPFS parameter storage
- Live blockchain transaction submission
- Transaction status monitoring

**Code location:** `src/app/demo-page.tsx:280-399`

**Key features:**

- Grant file creation and IPFS storage
- User signature with MetaMask
- Gasless transaction relay
- Real-time status updates
- Transaction hash with explorer links

</details>

### 4. **Encryption Testing Playground**

<details>
<summary>Click to expand</summary>

**What it demonstrates:**

- Canonical Vana encryption protocol
- Wallet signature-based key generation
- File and text encryption/decryption
- Storage provider integration

**Code location:** `src/app/demo-page.tsx:432-523`

**Key features:**

- Real OpenPGP encryption/decryption
- Configurable encryption seeds
- File upload and encryption
- Download encrypted/decrypted files
- Hex content preview

</details>

### 5. **Storage Provider Integration**

<details>
<summary>Click to expand</summary>

**What it demonstrates:**

- Multiple storage provider support
- App-managed vs user-managed IPFS
- File upload to blockchain registration
- Storage provider configuration

**Code location:** `src/app/demo-page.tsx:577-717`

**Key features:**

- Pinata IPFS integration
- Server-side IPFS endpoints
- Storage provider selection UI
- Blockchain file registration
- Real storage URLs and file IDs

</details>

---

## 🛠️ Development

### Running the Demo

```bash
# Development mode with hot reload
npm run dev

# Production build
npm run build
npm start

# Type checking
npm run typecheck

# Linting
npm run lint
```

### Environment Setup

#### **Option 1: Quick Start (Minimal Setup)**

Use the demo with app-managed IPFS and default relayer:

```bash
# Minimum required configuration
RELAYER_PRIVATE_KEY=0x3f572ac0f0671db5231100918c22296306be0ed77d4353f80ad8b4ea9317cf51
CHAIN_RPC_URL=https://rpc.moksha.vana.org
CHAIN_ID=14800
```

#### **Option 2: Full Featured (Complete Setup)**

Enable all features including user-managed IPFS:

1. **Get Pinata API Key**
   - Sign up at [pinata.cloud](https://app.pinata.cloud)
   - Create API key with Files (Write) and Gateways (Read) permissions
   - Copy JWT token

2. **Configure Environment**
   ```bash
   # Add to .env.local
   PINATA_JWT=your_server_side_pinata_jwt
   NEXT_PUBLIC_PINATA_JWT=your_client_side_pinata_jwt  # Optional
   PINATA_GATEWAY_URL=https://gateway.pinata.cloud
   ```

#### **Option 3: Custom Configuration**

Use your own infrastructure:

```bash
# Custom relayer
RELAYER_PRIVATE_KEY=your_relayer_private_key

# Custom RPC
CHAIN_RPC_URL=your_rpc_endpoint

# Custom subgraph
NEXT_PUBLIC_SUBGRAPH_URL=your_subgraph_endpoint
```

### API Endpoints

The demo includes a complete backend implementation:

| Endpoint                  | Purpose           | Description                      |
| ------------------------- | ----------------- | -------------------------------- |
| `GET /api/health`         | Service health    | Relayer and blockchain status    |
| `POST /api/ipfs/upload`   | File storage      | Server-managed IPFS uploads      |
| `POST /api/relay`         | Permission relay  | Submit gasless permission grants |
| `POST /api/relay/addFile` | File registration | Register file URLs on blockchain |

---

## 🎨 UI Components

### Custom Components

**`<FileCard />`** - Interactive file management

```typescript
<FileCard
  file={userFile}
  isSelected={selectedFiles.includes(file.id)}
  onSelect={() => handleSelection(file.id)}
  onDecrypt={() => handleDecrypt(file)}
  userAddress={currentUserAddress}
/>
```

**`<AddressDisplay />`** - Blockchain address with explorer links

```typescript
<AddressDisplay
  address="0x..."
  explorerUrl="https://moksha.vanascan.io"
  truncate={true}
/>
```

**`<PermissionDisplay />`** - Permission visualization

```typescript
<PermissionDisplay
  permissionId={permission.id}
  className="inline-flex"
/>
```

### UI System

Built with **shadcn/ui** for professional, accessible components:

- Consistent design system
- Dark theme support
- Mobile responsive
- Keyboard navigation
- Screen reader support

---

## 🔍 Testing & Debugging

### Built-in Debug Tools

**Service Health Monitoring**

```typescript
// Real-time service status
const health = await fetch("/api/health");
console.log("Relayer status:", health.status);
console.log("Chain connection:", health.chain);
```

**Service Health Endpoint**

```typescript
// Test service connectivity
const healthTest = await fetch("/api/health");
console.log("Service status:", healthTest);
```

**Console Logging**
The demo includes comprehensive console logging:

- SDK initialization status
- Transaction progress
- Error details with context
- Storage provider configuration

### Common Issues & Solutions

**Issue:** "Relayer health check failed"

```bash
# Solution: Check relayer private key
echo $RELAYER_PRIVATE_KEY
# Should be valid private key starting with 0x
```

**Issue:** "IPFS upload failed"

```bash
# Solution: Verify Pinata configuration
curl -H "Authorization: Bearer $PINATA_JWT" https://api.pinata.cloud/v3/files
```

**Issue:** "No files found for user"

```bash
# Solution: Check subgraph URL and user activity
curl -X POST -H "Content-Type: application/json" \
  -d '{"query":"{ users { id fileContributions { fileId } } }"}' \
  $NEXT_PUBLIC_SUBGRAPH_URL
```

---

## 📚 Learning Resources

### Code Study Guide

**🎯 Start here:** `src/app/demo-page.tsx`

- Complete application logic
- SDK usage patterns
- Error handling examples
- State management patterns

**🔧 Backend integration:** `src/app/api/`

- Relayer service implementation
- IPFS integration patterns
- Gasless transaction handling

**🎨 UI patterns:** `src/components/`

- Professional component design
- Interactive data visualization
- Loading states and error UI

### Related Documentation

- **[Vana SDK Documentation](https://docs.vana.org/vana-sdk)**
- **[Vana Network Overview](https://docs.vana.org)**
- **[viem Documentation](https://viem.sh)**
- **[Next.js Documentation](https://nextjs.org/docs)**
- **[shadcn/ui Components](https://ui.shadcn.com)**

---

## 🤝 Contributing

Found a bug or want to improve the demo?

1. **Report Issues**: [GitHub Issues](https://github.com/vana-com/vana-sdk/issues)
2. **Suggest Features**: Use the "Enhancement" label
3. **Submit PRs**: Follow the main SDK contributing guidelines

### Development Setup

```bash
# Fork the repository
git clone https://github.com/your-username/vana-sdk.git
cd vana-sdk/examples/vana-sdk-demo

# Install dependencies
npm install

# Create feature branch
git checkout -b feature/improve-demo

# Make changes and test
npm run dev

# Submit pull request
```

---

## 📄 License

ISC License - same as the main Vana SDK

---

<div align="center">
  <p>
    <strong>Ready to build your own data-powered application?</strong><br>
    <a href="https://docs.vana.org/vana-sdk/getting-started">SDK Documentation</a> •
    <a href="https://discord.gg/vanabuilders">Developer Community</a> •
    <a href="https://docs.vana.org">Vana Network Docs</a>
  </p>
</div>
