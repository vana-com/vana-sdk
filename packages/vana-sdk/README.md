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

## Build a direct Vana app

Request user-approved data, read it from the user's Personal Server, and pay
for the read — without the browser ever seeing your app private key or choosing
scopes. Your **backend** owns the controller (`@opendatalabs/vana-sdk/server`);
your **frontend** drives a two-tab approval flow with a React hook
(`@opendatalabs/vana-sdk/react`).

> **Status — provisional transports.** The app-dev access-request service (that
> issues `dcr_*` ids and approval URLs) and the x402 `X-PAYMENT` settlement
> scheme do not yet have a finalized in-SDK protocol. The controller ships
> working defaults against the documented Vana endpoints, but their wire
> contracts may change. To pin a stable contract today, inject your own
> `accessRequestClient` and/or `paymentSigner` — the controller shape stays the
> same.

### Backend controller

```typescript
// lib/vana.ts
import { createDirectDataController } from "@opendatalabs/vana-sdk/server";

export const vana = createDirectDataController({
  env: process.env.VANA_ENV === "dev" ? "dev" : "production",
  appPrivateKey: process.env.VANA_APP_PRIVATE_KEY!,
  app: {
    id: "notes-lens",
    name: "Notes Lens",
    homepageUrl: process.env.VANA_APP_URL!,
  },
  source: "icloud_notes",
  scopes: ["icloud_notes.notes"],
});

// The app's on-chain address — fund and inspect this in the Builder activity
// report. (`vana.getAppIdentity()` also returns the configured id/name/homepage.)
console.log(vana.getAppAddress()); // 0x...
```

Wire it to three routes — your backend chooses the source and scopes, owns the
private key, and handles `402 Payment Required`:

```typescript
// POST /api/vana/request
const request = await vana.createAccessRequest({
  returnUrl: `${process.env.VANA_APP_URL}/connect/return`,
});
// -> { requestId: "dcr_...", approvalUrl: "https://app.vana.org/...", appAddress: "0x..." }

// GET /api/vana/status?requestId=...
const status = await vana.getAccessRequestStatus(requestId);
// -> { status: "approved", personalServerUrl, grantId, scope }

// GET /api/vana/data?requestId=...
const data = await vana.readApprovedData({ requestId });
// -> { scope: "icloud_notes.notes", data: [...] }
```

### Frontend hook

```tsx
"use client";
import { useDirectVanaConnect } from "@opendatalabs/vana-sdk/react";

export function ConnectNotesButton() {
  const connect = useDirectVanaConnect({
    createRequest: () =>
      fetch("/api/vana/request", { method: "POST" }).then((r) => r.json()),
    getStatus: (requestId) =>
      fetch(`/api/vana/status?requestId=${encodeURIComponent(requestId)}`).then(
        (r) => r.json(),
      ),
    readResult: (requestId) =>
      fetch(`/api/vana/data?requestId=${encodeURIComponent(requestId)}`).then(
        (r) => r.json(),
      ),
  });

  return (
    <button
      disabled={connect.state.type !== "idle"}
      onClick={connect.start}
      type="button"
    >
      {connect.state.type === "idle" ? "Connect Apple Notes" : "Connecting..."}
    </button>
  );
}
```

The hook calls `createRequest`, opens the Vana approval URL, polls `getStatus`
until the request is approved, then calls `readResult`. `react` is an optional
peer dependency. The underlying `createDirectConnectFlow` store is also exported
for non-React frontends.

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
