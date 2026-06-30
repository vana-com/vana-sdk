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
- **Vana service integrations** — `@opendatalabs/vana-sdk/server`,
  `@opendatalabs/vana-sdk/react`, and `@opendatalabs/vana-sdk/session-relay`
  for Vana-operated app handoff flows. These are integration helpers, not
  protocol-core modules.
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

## Build a Vana app

Request user-approved data, read it from the user's Personal Server, and pay
for the read — without the browser ever seeing your app private key or choosing
scopes. Your **backend** owns the Data Portability controller
(`@opendatalabs/vana-sdk/server`); your **frontend** drives a two-tab approval flow with a React hook
(`@opendatalabs/vana-sdk/react`).

> **How it fits together.** Access requests are created through the Vana Account
> access-request API; the Personal Server read uses Web3Signed auth; and payment
> settles on a `402` through the DPv2 escrow surface (`protocol/escrow`), where the
> controller signs a `GenericPayment` with your app key. You can inject your own
> `accessRequestClient` to target a custom deployment, and `escrow` config to wire
> the escrow gateway.

Use `network: "moksha"` to keep production app/API URLs while running escrow and
chain-aware defaults against Moksha. `env: "dev"` remains for Vana's internal dev
deployment and switches deployment URLs.

### Backend controller

```typescript
// lib/vana.ts
import { createDirectDataController } from "@opendatalabs/vana-sdk/server";

import { createEscrowGatewayClient } from "@opendatalabs/vana-sdk/node";

export const vana = createDirectDataController({
  env: process.env.VANA_ENV === "dev" ? "dev" : "production",
  network: process.env.VANA_NETWORK === "moksha" ? "moksha" : "mainnet",
  appPrivateKey: process.env.VANA_APP_PRIVATE_KEY!,
  app: {
    id: "spotify-taste",
    name: "Spotify Taste",
    homepageUrl: process.env.VANA_APP_URL!,
  },
  source: "spotify",
  scopes: ["spotify.savedTracks"],
  // Settle paid reads through the DPv2 escrow gateway. The controller signs the
  // GenericPayment with your app key; you supply the gateway client + contract.
  escrow: {
    client: createEscrowGatewayClient(process.env.VANA_DP_RPC_URL!),
    escrowContract: process.env.VANA_ESCROW_CONTRACT! as `0x${string}`,
  },
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
const result = await vana.readApprovedData({ requestId });
// -> {
//   scope: "spotify.savedTracks",
//   data: ...,
//   payment?: {            // present only when this read settled a payment
//     amount, asset, paymentNonce, paidAt,
//     breakdown: { registrationFee, dataAccessFee, registrationPaid },
//   },
// }
```

`readApprovedData` hides the payment flow for normal builders. If the Personal
Server returns `402 Payment Required`, the controller settles the grant through
the escrow gateway and retries, attaching a `payment` receipt so you can inspect
the amount, asset, and fee breakdown. If `escrow` is not configured (or the read
still requires payment afterward), it throws `PaymentRequiredError` carrying the
amount and asset owed.

### Frontend hook

```tsx
"use client";
import { useDirectVanaConnect } from "@opendatalabs/vana-sdk/react";

export function ConnectSpotifyButton() {
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
      {connect.state.type === "idle" ? "Connect Spotify" : "Connecting..."}
    </button>
  );
}
```

The hook calls `createRequest`, opens the Vana approval URL, polls `getStatus`
until the request is approved, then calls `readResult`. `react` is an optional
peer dependency. The underlying `createDirectConnectFlow` store is also exported
for non-React frontends.

### Test with large sample data

When testing with realistic exports, use the public fixture catalog in
[`vana-com/data-connectors`](https://github.com/vana-com/data-connectors). Keep
the payload in a file or raw URL and point your app or agent at that location.
Do not paste large JSON into the terminal.

The controller can run against local test data by injecting an
`accessRequestClient` that returns an approved request and a
`personalServerFetch` that loads the sample payload, while the rest of your app
still calls `readApprovedData`.

See [`examples/vana-app`](../../examples/vana-app) for a runnable Next.js Vana
app. It includes the route handlers, return page, and React connect button from
this flow, defaults to sample-data mode using `vana-com/data-connectors`, and
can be switched to live protocol mode with environment variables.

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
