# Vana RBAC Auditor

A read-only web tool for auditing Role-Based Access Control (RBAC) permissions across Vana protocol smart contracts.

## Overview

Security engineers and developers use this tool to:

- View all active role assignments across protocol contracts
- Track historical role grants and revocations
- Detect anomalies (unknown addresses, deprecated permissions, excessive admins)
- Audit both Vana Mainnet and Moksha Testnet

**Strictly read-only** - no wallet required, no transactions, safe for production use.

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.9.2

### Local Development

```bash
# From monorepo root
npm install
npm run build:sdk

# Set up configuration
cd examples/vana-rbac-auditor
cp config.yaml.example config.yaml
# Edit config.yaml with your known addresses
npm run generate-config-env

# Run dev server at http://localhost:3002
npm run dev
```

### Production Deployment

For Vercel or other platforms:

```bash
# Generate environment variable
npm run generate-config-env

# Copy the output JSON string to your deployment platform's environment variables:
# Variable name: NEXT_PUBLIC_RBAC_CONFIG
# Value: (paste the JSON string)

# Deploy
npm run build
npm start
```

**See [CONFIG_SETUP.md](./CONFIG_SETUP.md) for detailed configuration instructions.**

## Configuration

The auditor requires a configuration file defining:

- **Known addresses**: Label multisigs, service accounts, deactivated users
- **Anomaly detection**: Set thresholds for admin role assignments
- **Legacy roles**: Map deprecated role hashes to names

**Privacy model:**

- `config.yaml` is gitignored - your address lists stay private
- Use `config.yaml.example` as a template
- Deploy via `NEXT_PUBLIC_RBAC_CONFIG` environment variable (Vercel, etc.)

## How It Works

1. **Contract Discovery**: Dynamically discovers AccessControl contracts from Vana SDK
2. **Event Fetching**: Pulls `RoleGranted`/`RoleRevoked` events from Blockscout API
3. **State Verification**: Batch-verifies current permissions using multicall
4. **Anomaly Detection**: Flags unknown addresses and suspicious patterns
5. **Display**: Interactive tables with search, sort, and filtering

## Tech Stack

- **Next.js 15** (App Router) + **React 19**
- **Vana SDK** for contract addresses and ABIs
- **viem** for blockchain interactions
- **HeroUI** + **Tailwind CSS** for UI

## Code Quality

```bash
npm run typecheck    # TypeScript strict mode
npm run lint         # ESLint
npm run lint:fix     # Auto-fix linting issues
```

## Documentation

- [Configuration Setup](./CONFIG_SETUP.md) - Environment variables and YAML config

## License

Part of the Vana SDK monorepo. See root LICENSE file.
