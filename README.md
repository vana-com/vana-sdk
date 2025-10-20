# Vana SDK

TypeScript SDK for building user-owned data applications on the Vana Network.

[![npm version](https://img.shields.io/npm/v/@opendatalabs/vana-sdk)](https://www.npmjs.com/package/@opendatalabs/vana-sdk)
[![Downloads](https://img.shields.io/npm/dm/@opendatalabs/vana-sdk)](https://www.npmjs.com/package/@opendatalabs/vana-sdk)
[![License](https://img.shields.io/npm/l/@opendatalabs/vana-sdk)](./LICENSE)

This is a monorepo containing the Vana SDK and example applications demonstrating its capabilities.

## Quick Start

```bash
npm install
npm run dev:console  # SDK console at http://localhost:3000
npm run dev:vibes    # Vibes demo at http://localhost:3001
```

## Repository Structure

- **packages/vana-sdk** - Core TypeScript SDK with platform-specific builds
- **examples/vana-console** - Comprehensive demo application
- **examples/vana-vibes-demo** - Social features demonstration
- **examples/vana-rbac-auditor** - RBAC auditing tool

## Using the SDK

Install from npm:

```bash
npm install @opendatalabs/vana-sdk viem@^2.31.7
```

See the [SDK package README](./packages/vana-sdk/README.md) for usage details.

## Documentation

- [Complete SDK Documentation](https://docs.vana.org/docs/sdk)
- [API Reference](https://vana-com.github.io/vana-sdk)
- [Discord Community](https://discord.gg/vanabuilders)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and contribution guidelines.

## License

[ISC](./LICENSE)
