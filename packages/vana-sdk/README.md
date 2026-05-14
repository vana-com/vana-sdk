# Vana SDK

TypeScript primitives for building on Vana — smart-contract bindings, ECIES
encryption, storage providers, and a shared isomorphic platform layer.

[![npm version](https://img.shields.io/npm/v/@opendatalabs/vana-sdk)](https://www.npmjs.com/package/@opendatalabs/vana-sdk)
[![Downloads](https://img.shields.io/npm/dm/@opendatalabs/vana-sdk)](https://www.npmjs.com/package/@opendatalabs/vana-sdk)
[![License](https://img.shields.io/npm/l/@opendatalabs/vana-sdk)](https://opensource.org/licenses/ISC)

> **Heads up — minimal scaffold.** As of `3.x` the SDK has been pared down
> to the primitives the new Vana protocol architecture builds on. The
> previous high-level API (`Vana(...)` factory, `vana.permissions`,
> `vana.data`, subgraph queries, personal-server client, DLP rewards) is
> **not part of this release.** If you need that surface, pin to
> [`@opendatalabs/vana-sdk@^2.3.0`](https://www.npmjs.com/package/@opendatalabs/vana-sdk/v/2.3.0)
> or check out the [`legacy-pre-unification`](https://github.com/vana-com/vana-sdk/tree/legacy-pre-unification)
> tag.

## What's in the box

- **Smart-contract bindings** — `getContractController`, `getContractInfo`,
  `getAbi`, `getContractAddress`, plus the `CONTRACTS` and `VanaContract`
  registries auto-generated from on-chain discovery.
- **Chain configurations** — `vanaMainnet`, `mokshaTestnet` (alias `moksha`),
  `getChainConfig`, `getAllChains`, plus the lower-level viem `chains` map.
- **ECIES crypto** — audited (HashCloak, 2025) ECIES implementation with
  matched browser and Node providers, byte-identical across platforms and
  with strict KDF/MAC validation.
- **Storage providers** — `VanaStorage` (default, talks to `storage.vana.org`),
  `R2Storage`, `StorageManager`, `IpfsStorage`, `PinataStorage`,
  `GoogleDriveStorage`, `DropboxStorage`, `CallbackStorage`.
- **Platform adapters** — `NodePlatformAdapter` and `BrowserPlatformAdapter`
  with a shared `VanaPlatformAdapter` interface, plus detection helpers
  (`detectPlatform`, `isPlatformSupported`, `createPlatformAdapter`,
  `createPlatformAdapterSafe`).
- **JSON protocol schemas** — `dataSchema.schema.json` and
  `grantFile.schema.json`, shipped under `dist/schemas/`.

## Install

```bash
npm install @opendatalabs/vana-sdk viem
```

The SDK ships separate browser and Node bundles. Pick the entry point that
matches your runtime:

```typescript
// Browser / web app
import { BrowserPlatformAdapter } from "@opendatalabs/vana-sdk/browser";

// Node.js / server
import { NodePlatformAdapter } from "@opendatalabs/vana-sdk/node";
```

The bare `@opendatalabs/vana-sdk` import intentionally throws — it forces a
deliberate platform choice instead of accidentally pulling Node-only code
into a browser bundle (or vice versa).

## Quick examples

### Read a Vana contract

```typescript
import { getContractController } from "@opendatalabs/vana-sdk/node";
import { createPublicClient, http } from "viem";
import { mokshaTestnet } from "@opendatalabs/vana-sdk/node";

const client = createPublicClient({
  chain: mokshaTestnet,
  transport: http(),
});

const dataRegistry = getContractController("DataRegistry" as const, client);
const fileCount = await dataRegistry.read.filesCount();
```

### Encrypt with ECIES (Node)

```typescript
import { NodeECIESProvider } from "@opendatalabs/vana-sdk/node";

const ecies = new NodeECIESProvider();

const encrypted = await ecies.encrypt(recipientPublicKey, payload);
const decrypted = await ecies.decrypt(recipientPrivateKey, encrypted);
```

The browser entry exposes the same surface as `BrowserECIESProvider`.

### Upload a file via the storage manager

```typescript
import { StorageManager, PinataStorage } from "@opendatalabs/vana-sdk/node";

const storage = new StorageManager();
storage.register(
  "pinata",
  new PinataStorage({ jwt: process.env.PINATA_JWT! }),
  true, // mark as default
);

const result = await storage.upload(myBlob, "report.json");
console.log(result.url);
```

## Networks

| Network        | Chain ID | RPC URL                     |
| -------------- | -------- | --------------------------- |
| Vana Mainnet   | 1480     | https://rpc.vana.org        |
| Moksha Testnet | 14800    | https://rpc.moksha.vana.org |

## Audit

The ECIES implementation under `src/crypto/ecies/` was audited by HashCloak
in October 2025; the report is in [`audits/`](https://github.com/vana-com/vana-sdk/tree/main/packages/vana-sdk/audits).

## Learn more

- [Documentation](https://docs.vana.org/docs/sdk)
- [API reference](https://vana-com.github.io/vana-sdk)
- [Discord](https://discord.gg/vanabuilders)

## License

[ISC](https://opensource.org/licenses/ISC)
