# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **Vana SDK** - a TypeScript SDK for interacting with Vana Network blockchain smart contracts. The SDK focuses on Data Liquidity Pools (DLPs) and Trusted Execution Environment (TEE) operations, providing a typed wrapper around the viem blockchain library.

## Development Commands

### Build & Test

```bash
npm run build          # Compile TypeScript to JavaScript
npm run test           # Run Vitest tests
npm run lint           # Run ESLint
npm run format         # Format code with Prettier
npm run fetch-abis     # Update contract ABIs from blockchain explorer
```

### Running Single Tests

```bash
npm run test -- --grep "test-name"
```

## Architecture

### Core Components

1. **VanaProvider** (`src/provider.ts`): Main SDK entry point
   - Initializes with network configuration (Moksha testnet: 14800, Vana mainnet: 1480)
   - Provides access to all contract instances
   - Built on top of viem's PublicClient

2. **Contract System** (`src/contracts/`): Organized by functionality
   - **Core**: DataRegistry, RootNetwork, DLPToken
   - **Data Access**: DataLiquidityPool, DataLiquidityPoolFactory
   - **TEE Pools**: TeePool, TeePoolFactory
   - **DLP Rewards**: DLPRewards, DLPRewardsFactory
   - **File Rewards**: FileRewardValidation, FileRewardFactory

3. **ABI Management** (`src/abi/`): TypeScript files auto-generated from blockchain
   - Contract ABIs are fetched and stored as TypeScript constants
   - Provides full type safety for contract interactions

4. **Configuration** (`src/config/`): Chain configs and contract addresses
   - Separate configs for Moksha testnet and Vana mainnet
   - Contract addresses are maintained per network

### Key Patterns

- **Typed Contracts**: All contracts use viem's `getContract()` with typed ABIs
- **Network Abstraction**: Single provider interface works across testnets and mainnet
- **Factory Pattern**: Pool and reward factories for creating new instances
- **Configuration-Driven**: Contract addresses and chain configs are externalized

## Important Implementation Details

### Encryption Utilities (`src/utils/encryption.ts`)

- Currently contains placeholder implementations
- Real encryption methods need to be implemented for production use

### Module System

- Uses CommonJS (`module.exports`) not ESM
- TypeScript compiled to JavaScript in `dist/` directory

### Testing

- Uses Vitest framework
- Currently minimal test coverage (only provider tests in `tests/provider.test.ts`)
- Tests use Moksha testnet by default

### Claude Code Hooks

The project includes `.claude/settings.json` with hooks that automatically run lint and tests after file edits:

- **Lint**: Shows errors immediately when code style issues are introduced
- **Tests**: Uses dot reporter for minimal output on success, detailed errors on failure
- This provides immediate feedback while keeping token usage efficient

### Contract Address Management

- Addresses are hardcoded in config files per network
- Use `npm run fetch-abis` to update ABIs when contracts change
- ABI files are auto-generated - do not edit manually

## Working with Contracts

When adding new contracts:

1. Add contract address to appropriate config file
2. Fetch ABI using the fetch-abis script
3. Create contract instance in VanaProvider
4. Add appropriate getter method

When modifying existing contracts:

1. Update contract addresses if deployed to new addresses
2. Run `npm run fetch-abis` to update ABIs
3. Update any breaking changes in the provider or contract usage

## Development Notes

- The SDK provides a high-level interface over viem for Vana-specific operations
- All blockchain interactions go through the VanaProvider
- Contract methods return viem's standard contract call responses
- Error handling follows viem's patterns
- Neve rurn npm run build, ask the user to test with npm run dev
