# Vana Console

<div align="center">
  <h3>Complete Reference Implementation</h3>
  <p>A production-quality example showcasing all Vana SDK features with real blockchain interactions, encryption, and storage providers.</p>

  <img src="https://img.shields.io/badge/Next.js-15.x-blue" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vana%20SDK-1.x-purple" alt="Vana SDK" />
  <img src="https://img.shields.io/badge/HeroUI-Latest-green" alt="HeroUI" />
</div>

---

## 🎯 What This Console Demonstrates

This is **not a toy example**—it's a comprehensive reference implementation that showcases every major Vana SDK feature with real production infrastructure:

### ✅ **Core SDK Features**

- **Gasless Permissions** - Real EIP-712 signatures and blockchain transactions
- **Data Management** - Live subgraph integration for file discovery
- **Encryption Protocol** - Complete encrypt-upload-decrypt workflows
- **Storage Integration** - Multiple providers (IPFS, decentralized storage)
- **Data Schemas** - Schema validation and management
- **Trusted Servers** - Trust and verify server integrations
- **Refiners** - Data refinement and transformation
- **Error Handling** - Production-grade error states and user feedback

### 🏗️ **Production Infrastructure**

- **Real Relayer Service** - Actual gasless transaction submission
- **Live IPFS Integration** - Pinata storage with real decentralized hosting
- **Subgraph Queries** - Real-time blockchain data indexing
- **Health Monitoring** - Service status and performance tracking

### 🎨 **Professional UI/UX**

- **Modern Design** - HeroUI components with dark theme
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
NEXT_PUBLIC_SUBGRAPH_URL=https://moksha.vanagraph.io/v7

# IPFS Storage (Pinata)
PINATA_JWT=your_pinata_jwt_token_here
PINATA_GATEWAY_URL=https://gateway.pinata.cloud
```

### Optional Configuration

```bash
# WalletConnect Project ID (for mobile wallet support)
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_project_id_here

# Personal Server Configuration (for advanced features)
APPLICATION_PRIVATE_KEY=your_application_private_key_here
REPLICATE_API_TOKEN=your_replicate_api_token_here  # Only needed for server-side operations
```

---

## 🏗️ Architecture

### Application Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (dashboard)/       # Main dashboard pages
│   │   ├── my-data/       # File & permission management
│   │   ├── developer-tools/ # SDK features & examples
│   │   ├── contracts/     # Direct contract interactions
│   │   └── personal-server-operations/ # Server integration
│   ├── api/               # Backend API routes
│   │   ├── health/        # Relayer health check
│   │   ├── ipfs/          # IPFS upload endpoint
│   │   ├── relay/         # Gasless transaction relay
│   │   └── trusted-server/ # Personal server endpoints
│   ├── layout.tsx         # Root layout with metadata
│   ├── page.tsx           # Redirect to dashboard
│   └── providers.tsx      # React context providers
├── components/            # UI components
│   ├── ui/                # Reusable UI components
│   ├── demo/              # Feature demonstration components
│   ├── FileCard.tsx       # Interactive file management
│   ├── PermissionsTable.tsx # Permission management
│   └── SidebarNavigation.tsx # App navigation
├── hooks/                 # Custom React hooks
│   ├── useUserFiles.ts    # File data management
│   ├── usePermissions.ts  # Permission management
│   └── useTrustedServers.ts # Server trust management
├── providers/             # React context providers
│   ├── VanaProvider.tsx   # Vana SDK integration
│   └── ParaProvider.tsx   # Para wallet integration
└── lib/                   # Utility libraries
    ├── storage-client.ts  # Client-side storage
    ├── storage-server.ts  # Server-side storage
    └── explorer.ts        # Block explorer integration
```

### Key Design Patterns

#### **1. Real Infrastructure Integration**

```typescript
// Real relayer service with health monitoring
const relayerHealth = await fetch("/api/health");

// Live subgraph queries for user data
const files = await vana.data.getUserFiles(
  {
    owner: userAddress,
    subgraphUrl: process.env.NEXT_PUBLIC_SUBGRAPH_URL,
  },
  {}, // Optional pagination/consistency options
);
```

#### **2. Comprehensive Error Handling**

```typescript
try {
  const result = await vana.permissions.grant(params);
  console.log(`Permission granted with ID: ${result.permissionId}`);
  console.log(`Transaction hash: ${result.transactionHash}`);
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

**Code location:** `src/app/(dashboard)/layout.tsx`, `src/providers/VanaProvider.tsx`

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

**Code location:** `src/app/(dashboard)/my-data/page.tsx`, `src/hooks/useUserFiles.ts`

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

**Code location:** `src/app/(dashboard)/my-data/page.tsx`, `src/hooks/usePermissions.ts`

**Key features:**

- Grant file creation and IPFS storage
- User signature with MetaMask
- Gasless transaction relay
- Real-time status updates
- Transaction hash with explorer links

</details>

### 4. **Encryption & Upload**

<details>
<summary>Click to expand</summary>

**What it demonstrates:**

- Canonical Vana encryption protocol
- Wallet signature-based key generation
- File and text encryption/decryption
- Storage provider integration

**Code location:** `src/app/(dashboard)/developer-tools/page.tsx`

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

**Code location:** `src/lib/storage-client.ts`, `src/lib/storage-server.ts`

**Key features:**

- Pinata IPFS integration
- Server-side IPFS endpoints
- Storage provider selection UI
- Blockchain file registration
- Real storage URLs and file IDs

</details>

### 6. **Data Schema Management**

<details>
<summary>Click to expand</summary>

**What it demonstrates:**

- Schema creation and validation
- JSON Schema integration
- Data validation against schemas
- Schema management UI

**Key features:**

- Create and manage data schemas
- Validate data against schemas
- View schema details and metadata
- Interactive schema testing

</details>

### 7. **Trusted Server Integration**

<details>
<summary>Click to expand</summary>

**What it demonstrates:**

- Server trust management
- Trust and untrust operations
- Server verification workflows
- Multi-server management

**Key features:**

- Add/remove trusted servers
- View server trust status
- Manage multiple server relationships
- Real blockchain transactions for trust operations

</details>

### 8. **Data Refiners**

<details>
<summary>Click to expand</summary>

**What it demonstrates:**

- Data refinement protocols
- Refiner discovery and integration
- Data transformation workflows
- Refiner management

**Key features:**

- List available refiners
- Submit data for refinement
- Track refinement status
- View refiner metadata and capabilities

</details>

---

## 🛠️ Development

### Running the Console

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

### Testing Local SDK Changes

To test local SDK changes in the console:

```bash
# 1. In the SDK package directory
cd ../../packages/vana-sdk
npm link

# 2. In the console directory
cd ../../examples/vana-console
npm link @opendatalabs/vana-sdk

# 3. Start the console
npm run dev
```

This creates a symlink so the console uses your local SDK instead of the published version.

**To revert:**

```bash
npm unlink @opendatalabs/vana-sdk
npm install  # Reinstall published version
```

### Environment Setup

#### **Option 1: Quick Start (Minimal Setup)**

Use the console with app-managed IPFS and default relayer:

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

The console includes a complete backend implementation:

| Endpoint                                 | Purpose               | Description                                     |
| ---------------------------------------- | --------------------- | ----------------------------------------------- |
| `GET /api/health`                        | Service health        | Relayer and blockchain status                   |
| `GET /api/application-address`           | Application identity  | Get application address for personal server     |
| `POST /api/identity`                     | Identity management   | Generate application identity                   |
| `POST /api/ipfs/upload`                  | File storage          | Server-managed IPFS uploads                     |
| `POST /api/proxy`                        | Personal server proxy | Proxy requests to personal server               |
| `POST /api/relay`                        | Permission relay      | Submit gasless permission grants                |
| `POST /api/relay/addFile`                | File registration     | Register file URLs on blockchain                |
| `POST /api/relay/addFileWithPermissions` | File + permissions    | Register file with permissions in one operation |
| `GET /api/trusted-server`                | Server info           | Get trusted server information                  |
| `POST /api/trusted-server/setup`         | Server setup          | Setup trusted server configuration              |
| `POST /api/trusted-server/poll`          | Server polling        | Poll trusted server for updates                 |

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

Built with **HeroUI** for professional, accessible components:

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
The app includes comprehensive console logging:

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

**🎯 Start here:** `src/app/(dashboard)/my-data/page.tsx`

- Complete data management implementation
- SDK usage patterns
- Error handling examples
- State management with custom hooks

**📱 Dashboard pages:** `src/app/(dashboard)/`

- `my-data/` - File & permission management
- `developer-tools/` - SDK features & examples
- `contracts/` - Direct contract interactions
- `personal-server-operations/` - Server integration

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
- **[HeroUI Components](https://heroui.com)**

---

## 🤝 Contributing

Found a bug or want to improve the console?

1. **Report Issues**: [GitHub Issues](https://github.com/vana-com/vana-sdk/issues)
2. **Suggest Features**: Use the "Enhancement" label
3. **Submit PRs**: Follow the main SDK contributing guidelines

### Development Setup

```bash
# Fork the repository
git clone https://github.com/your-username/vana-sdk.git
cd vana-sdk/examples/vana-console

# Install dependencies
npm install

# Create feature branch
git checkout -b feature/improve-console

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
