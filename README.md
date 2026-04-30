# Vana SDK

TypeScript SDK for building user-owned data applications on the Vana Network.

[![npm version](https://img.shields.io/npm/v/@opendatalabs/vana-sdk)](https://www.npmjs.com/package/@opendatalabs/vana-sdk)
[![Downloads](https://img.shields.io/npm/dm/@opendatalabs/vana-sdk)](https://www.npmjs.com/package/@opendatalabs/vana-sdk)
[![License](https://img.shields.io/npm/l/@opendatalabs/vana-sdk)](./LICENSE)

This monorepo hosts the Vana SDK package. The SDK is currently a minimal scaffold
focused on the primitives that ship across browser and Node — ECIES crypto, smart
contract bindings (ABIs, addresses, chains), storage providers, and platform
adapters — while the protocol unification work continues on top of it.

The pre-unification SDK (controllers, subgraph queries, personal-server client,
DLP rewards, examples) is preserved as the `legacy-pre-unification` git tag and
the `2.x` line on npm.

## Repository Structure

- **packages/vana-sdk** — `@opendatalabs/vana-sdk` (isomorphic SDK, browser + Node bundles)
- **packages/eslint-config-vana-base**, **eslint-config-vana-sdk** — shared lint configs

## Using the SDK

Install from npm:

```bash
npm install @opendatalabs/vana-sdk viem
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
