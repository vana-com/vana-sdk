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

### Scope Vana storage by network

Set `network` when writing to Vana Storage for a specific Vana network. The SDK
resolves the network to its chain ID and uploads through chain-scoped routes
(`/v1/chains/{chainId}/blobs/...`) so data for different chains never collides.

```typescript
import { createVanaStorageProvider } from "@opendatalabs/vana-sdk/node";

const storage = createVanaStorageProvider({
  endpoint: "https://storage.vana.org",
  network: "moksha",
  signer: {
    address: account.address,
    signMessage: (msg) => account.signMessage({ message: msg }),
  },
});

const result = await storage.upload(
  myBlob,
  "instagram.profile/2026-05-08T20:00:00.000Z",
);
```

Network-configured providers reject legacy blob URLs and URLs scoped to a
different chain. If you need a custom or future protocol network that this SDK
does not know yet, pass `chainId` explicitly.

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

### Scope entries

A grant carries a list of **scope entries**, and each one is
`[operation:]scope`:

- no prefix means **read** — `spotify.savedTracks`, `chatgpt.*`, `*`;
- `write:` means **write** — `write:coach.weekly`, `write:chatgpt.*`;
- the operation is lowercase ASCII and matched exactly. `read:` is not an
  alias for a bare entry, `delete:` is reserved but not implemented, and there
  is no wildcard over operations: wildcards apply to the scope part only.

Read and write never cross. `write:coach.weekly` authorizes writing
`coach.weekly` and nothing else; reading it needs its own bare entry. A grant
that wants both carries both.

```typescript
import {
  parseScopeEntry, // "write:coach.weekly" -> { scope: "coach.weekly", action: "write" }
  formatScopeEntry, // { scope, action } -> the wire entry
  grantPermissions, // a grant's scopes -> [{ scope, actions: ["read", "write"] }]
  hasAction, // does this grant authorize `action` over `scope`?
} from "@opendatalabs/vana-sdk/server";

// Request read + write on a derived scope, computed from two sources.
export const vana = createDirectDataController({
  // ...
  source: "oura",
  scopes: [
    "oura.sleep",
    "chatgpt.conversations",
    "coach.weekly",
    "write:coach.weekly",
  ],
});

hasAction(grant.scopes, "coach.weekly", "write"); // true
hasAction(grant.scopes, "oura.sleep", "write"); // false — read entry only
```

Entries are passed through and signed verbatim, so build and read them with
these helpers rather than slicing the strings by hand. An entry whose
operation the SDK does not recognise never parses as read: `parseScopeEntry`
throws `InvalidScopeEntryError`, `hasAction` skips it, and `grantPermissions`
refuses the whole list (use `tryGrantPermissions` to get `undefined` instead
when rendering a grant a newer release may have written). The controller
accepts write entries in `scopes`, but its scope part must be a concrete
scope: this flow reads approved scopes back one at a time, so wildcards are
rejected there for read and write alike.

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
// -> {
//   requestId: "dcr_...",
//   approvalUrl: "https://app.vana.org/...",
//   appAddress: "0x...",
//   network: "mainnet",
//   expiresAt: "...",
//   mobileContinuationUrl?: "https://open.vana.org/continue#<ticket>",
// }

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

The hook calls `createRequest`, opens the Vana destination, polls `getStatus`
until the request is approved, then calls `readResult`. Destination choice stays
inside the SDK, and it owns only the small mobile-versus-desktop split — it never
infers whether Vana is installed. Desktop browsers and light requests open the
HTTPS `approvalUrl` in a popup (`state.type === "awaiting_approval"`). Builders
should not add user-agent branches, app-install checks, deep-link construction,
or store-link logic.

If the popup is blocked, `state.popupBlocked` is `true`; render the HTTPS
`state.request.approvalUrl` as the universal manual "Open approval" link. Polling
continues either way, so a manual open still drives the flow to completion.

A deep Direct request on a mobile browser instead enters
`state.type === "ready_to_open"` and exposes a plain HTTPS
`state.mobileContinuationUrl` (`https://open[-dev].vana.org/continue#<ticket>`).
Because DCR creation is asynchronous, the SDK does **not** launch it
automatically — the original tap can no longer be trusted to retain iOS user
activation. Render it as an ordinary primary link the user taps themselves:

```tsx
<a href={state.mobileContinuationUrl} target="_blank" rel="noreferrer">
  Open Vana
</a>
```

Verified links (iOS Universal Links / Android App Links) deliver this URL to
Vana Mobile; if Vana is absent the same URL loads its web install/recovery
fallback. Polling continues in the originating tab, and the URL's short-lived
ticket may rotate to a fresh value between polls. This is capability routing, not
an assertion that the native app is installed.

The SDK owns no persistence. If the originating mobile tab is reloaded, evicted,
or replaced, the flow does not recover: the user restarts and creates a new DCR,
and the abandoned DCR expires. This restart-on-tab-loss behavior is an accepted
first-release tradeoff — do not build caller-side resume storage against it.

Server-side create calls accept an optional `idempotencyKey`. The default HTTP
client generates a fresh key for every create, because one shared controller
serves many users and identical-looking creates are still independent requests.
Retrying a create whose response was lost is therefore the caller's decision:
pass the same explicit `idempotencyKey` on the retry to avoid a duplicate DCR.

`react` is an optional peer dependency. The underlying
`createDirectConnectFlow` store is also exported for non-React frontends.

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

## Write into a Personal Server

A builder that holds a **write-grant** (a grant whose scope entries carry the
`write:` prefix, e.g. `write:coach.summary`; see `formatScopeEntry`) can write
records into the user's Personal Server. The SDK owns the handshake and the
signatures; the same API works from a backend (viem `privateKeyToAccount`) and
from a browser (viem `WalletClient`).

```typescript
import { privateKeyToAccount } from "viem/accounts";
import {
  openWriteSession,
  writeData,
  getLineage,
  deriveDataPointId,
} from "@opendatalabs/vana-sdk";

const signer = privateKeyToAccount(process.env.BUILDER_KEY as `0x${string}`);

// 1. Open a session: Web3Signed handshake carrying the write-grant id.
const session = await openWriteSession({
  personalServerUrl: "https://ps.example.com",
  signer,
  grantId: writeGrantId,
});

// 2. Write a record (compact JSON, signed proof in X-Vana-Write-Signature).
await writeData({ session, scope: "coach.notes", data: { note: "hello" } });

// 3. Write a derivative: name the data points it was computed from. Given as
//    { ownerAddress, scope } the SDK derives the ids and checks the naming
//    rule before signing; bare ids (deriveDataPointId) work too.
await writeData({
  session,
  scope: "coach.summary",
  data: { summary: "..." },
  lineage: [{ ownerAddress, scope: "chatgpt.conversations" }],
});

// 4. Walk the lineage: Personal Server by scope, or gateway by data point id
//    (optionally `version: N` for a specific version).
const graph = await getLineage({
  personalServerUrl: "https://ps.example.com",
  scope: "coach.summary",
  grantId: readGrantId,
  signer,
});
const viaGateway = await getLineage({
  gatewayUrl: "https://dp-rpc.vana.org",
  dataPointId: deriveDataPointId(ownerAddress, "coach.summary"),
  grantId: readGrantId,
  signer,
});
```

`writePersonalServerData({ personalServerUrl, signer, grantId, scope, data })`
does steps 1 and 2 in one call and returns the session for reuse.

What the SDK does for you:

- Sends `POST /v1/write/session` with a Web3Signed proof (the grant id is a
  signed claim) and keeps the short-lived bearer in `session`.
- Sends `POST /v1/data/:scope` with the bearer and `X-Vana-Write-Signature`, a
  second Web3Signed proof over the **stored** representation: the compact JSON
  body for JSON writes, the `$binary` record (`binaryWriteSignedBytes`) for
  `binary: { bytes, contentType, filename }` writes. The grant id is a signed
  claim on that proof too.
- Every proof is single-use on the server. Transport retries (`retry`) sign a
  fresh proof per attempt; an HTTP error is never retried.
- `lineage` becomes the record's top-level `lineage` field (JSON writes) or
  the `lineage` field of `X-Vana-Metadata` (binary writes), so it is inside
  the signed bytes either way; ids are lowercased, the server validates them
  and mirrors them to `$lineage`. `lineage: []` is an explicit root statement
  and is sent as such; absent or `null` makes no statement. Sending
  `$writtenBy`, `$lineage`, or your own `lineage` field is refused before any
  request.
- Both lineage reads are Web3Signed over the bare path
  (`/v1/data/<id lowercase>/lineage[/:version]` on the gateway,
  `/v1/data/:scope/lineage[/:version]` on the Personal Server; the version is
  a path segment, never a query), with the grant as the signed `grantId`
  claim, so a captured signature cannot be replayed for another view. The
  gateway answers a uniform 404 for an unknown id and for a signer it will
  not serve.

Rules on derivatives, checked by the server and (where the SDK has the
information) by the client before anything is signed: sources are data points
of the same owner (a deleted source is still a valid one, and comes back with
its `deletedAt`; one that no longer resolves comes back with `version: "0"`),
at most 256, distinct, never the record's own id, and the derived scope must
not share its first dot-segment with any source scope (a grant on `chatgpt.*`
must not read `chatgpt.summary`), so put derivatives in your app's own
namespace (`assertDerivedScopeNaming` is exported). A grant on a derived scope
confers nothing on its sources, and the other way round: the pipeline needs a
read grant on the sources and a write grant on the derived scope.

Errors are typed: `WriteSessionError` (handshake refused), `WriteUnauthorizedError`
(401), `WriteForbiddenError` (403), `WriteConflictError` (409),
`WriteLineageError` (any `LINEAGE_*` rejection: 422 `LINEAGE_SOURCE_UNKNOWN`
with `details.unknown`, 400 `LINEAGE_INVALID` /
`LINEAGE_SCOPE_UNDER_SOURCE_PREFIX`, 502 `LINEAGE_SOURCE_LOOKUP_FAILED`),
`WriteRejectedError` (other), `WriteSessionExpiredError`, `WriteTransportError`,
`WriteRequestError`, and `LineageReadError` for lineage reads. Each carries the
server's `status`, `errorCode` and `details`. Lineage entries the caller holds
no grant for come back as exactly `{ redacted: true }` (narrow with
`isRedactedLineageNode`): no id, scope or version, because the id is
`keccak256(owner, scope)` and a grantee who knows the owner could recover the
scope from it; order and count are preserved, so a redacted node is identified
by its position. The SDK refuses a view whose redacted node carries anything
else. The gateway's `proof` over the served view is passed through.

## Derivative questions

A **question** is a standing prompt over the user's source scopes. The Personal
Server answers it locally (the raw sources never leave the machine except
through its inference call) and writes the answer into a derived scope as an
ordinary derivative record, with lineage pointing at the sources. The builder
reads that scope with its normal read grant. Every later change to a source
recomputes the question, so you register it once and keep reading a scope that
stays current.

One grant carries the whole pipeline, and it needs all three of:

- a bare read entry for **every source scope** (the answer exposes them, so a
  registration whose sources are not read-granted is refused with
  `DERIVATIVE_SOURCE_NOT_GRANTED`),
- a bare read entry for the **derived scope** (to read the answer back),
- `write:<derivedScope>` (the credential the question routes authorize
  against).

For `coach.weekly` computed from `oura.sleep` and `chatgpt.conversations`:

```json
["oura.sleep", "chatgpt.conversations", "coach.weekly", "write:coach.weekly"]
```

The derived scope must not share its first dot-segment with any source scope
(the same naming rule as a derivative write), so keep derivatives in your app's
own namespace.

```typescript
import { privateKeyToAccount } from "viem/accounts";
import {
  askPersonalServer,
  registerQuestion,
  waitForQuestion,
  listQuestions,
  recomputeQuestion,
  deleteQuestion,
} from "@opendatalabs/vana-sdk";

const signer = privateKeyToAccount(process.env.BUILDER_KEY as `0x${string}`);
const connection = {
  personalServerUrl: "https://ps.example.com",
  signer,
  grantId, // the grant with the scopes above
};

// The whole loop in one call: register, wait for the answer, read it.
const { registration, record } = await askPersonalServer({
  ...connection,
  derivedScope: "coach.weekly",
  sourceScopes: ["oura.sleep", "chatgpt.conversations"],
  question: "How did my sleep relate to my mood this week?",
  model: "z-ai/glm-5.2", // optional; the server has a default
});
console.log(record.data.answer);

// Or drive the steps yourself.
const question = await registerQuestion({
  ...connection,
  derivedScope: "coach.weekly",
  sourceScopes: ["oura.sleep"],
  question: "How did my sleep trend this week?",
});
const settled = await waitForQuestion({
  ...connection,
  questionId: question.questionId,
  timeoutMs: 60_000,
});
if (settled.status === "failed") {
  console.error(settled.error);
  await recomputeQuestion({ ...connection, questionId: question.questionId });
}

// Later runs: the question is already registered, so just read the scope
// again, or list what this builder registered on it.
const mine = await listQuestions({
  ...connection,
  derivedScope: "coach.weekly",
});
await deleteQuestion({ ...connection, questionId: question.questionId });
```

What the SDK does for you:

- Opens **one** write session per `{ signer, Personal Server, grant }`
  (`POST /v1/write/session`) and reuses it for every question call, including
  each poll of `waitForQuestion`.
- Signs a fresh, single-use `X-Vana-Write-Signature` proof for every request
  (the grant id is a signed claim).
- Puts a fresh `nonce` claim on every proof. **Polling needs it**: a proof
  payload is otherwise fully determined by
  `{aud, method, uri, bodyHash, grantId, iat, exp}`, so two identical
  `GET /questions/:id` polls signed inside the same second are byte-identical
  and the Personal Server refuses the second as a replay
  (`WRITE_ATTRIBUTION_REPLAY`). With a nonce the replay key is
  `(builder, nonce)` instead, and each poll is distinct. Every helper here
  does it for you, `waitForQuestion` included; a hand-built question request
  must pass `nonce` to `buildWeb3SignedHeader` itself.
- Signs the whole request **target**, query string included, because
  `?derivedScope=` is what the list route authorizes against. The target is
  built once and used for both the signed `uri` claim and the URL, so the
  signature and the request can never name different scopes.
- Re-opens the session once and replays the call when the Personal Server
  answers a 401 the **session** is responsible for: it keeps sessions in
  memory and forgets them when it restarts. A 401 about the **proof** (it
  does not cover this request, its nonce is spent, it recovers to another
  key) is surfaced as it is, since a new session would not change it.
- Sends bodies as compact JSON, which the server requires
  (`WRITE_BODY_NOT_CANONICAL` otherwise).
- Validates the registration (scope list, question length, model id, the
  naming rule) before anything is signed.

`waitForQuestion` polls until the question is `ready` or `failed` and returns
that state; a failed one carries a short `error` (never the prompt or the
data) and is retried with `recomputeQuestion`. `askPersonalServer` throws
`DerivativeQuestionFailedError` instead, since it has no record to return, and
reads the derived scope with the plain Web3Signed read; for a priced grant,
settle the 402 with the escrow-aware read from `@opendatalabs/vana-sdk/server`
and use `registerQuestion` + `waitForQuestion` directly.

Errors are typed and carry the server's `status`, `errorCode` and `details`:
`DerivativeSourceNotGrantedError` (403, `details.scopes` lists the uncovered
sources), `DerivativeCycleError` (409, the question would make the derived
scope a transitive source of itself), `DerivativeQuestionNotFoundError` (404,
including another builder's question on the same scope),
`DerivativeQuestionInvalidError` (400), `DerivativeDerivedScopeRequiredError`
(400 `DERIVATIVE_DERIVED_SCOPE_REQUIRED`, a builder list with no
`?derivedScope=`; the SDK refuses an empty one before signing),
`DerivativeComputeUnavailableError` (503, no compute layer on that server),
`DerivativeQuestionTimeoutError`, `DerivativeQuestionFailedError`, and
`DerivativeQuestionRejectedError` for anything else. Authentication failures
are the Write API's own `WriteUnauthorizedError`, `WriteForbiddenError`,
`WriteRequestError` (refused before sending) and `WriteTransportError`. An
**unknown** question id is a `DerivativeQuestionNotFoundError` (404), the
same as another builder's question.

These helpers require `personal-server-ts` main `d91124d` or later, which is
where the query-in-the-signed-uri rule, the `nonce` claim, the 404 for an
unknown id and the full-view `recompute` answer landed.

### Watching a derived scope as the reader

The helpers above are the builder's: every one of them needs a write session,
which an app holding only a bare read entry on the derived scope cannot open.
That reader sees `GET /v1/data/<derivedScope>` answer 404 whether the compute
is running, retrying, or finished failing.

`getDerivativeStatus` is the reader's view of the same question. It
authenticates like a data read — a live grant covering the derived scope, or
the owner — and nothing is charged, so a priced grant raises no 402 here.

```typescript
import {
  getDerivativeStatus,
  waitForDerivativeStatus,
} from "@opendatalabs/vana-sdk";

const status = await getDerivativeStatus({
  personalServerUrl: "https://ps.example.com",
  derivedScope: "coach.weekly",
  grantId,
  signer,
});
// { derivedScope, status, lastComputedAt, derivedVersion,
//   derivedCollectedAt, errorCode, retryAfterSeconds }

const settled = await waitForDerivativeStatus({
  personalServerUrl: "https://ps.example.com",
  derivedScope: "coach.weekly",
  grantId,
  signer,
  timeoutMs: 60_000,
});
```

The view is lifecycle only: the question text, the source scopes, the question
id, the registrar and the server's raw `error` string stay owner-only.
`errorCode` is a closed vocabulary — `inference_unavailable`,
`source_missing`, `grant_invalid`, `internal` — and is `null` unless `status`
is `failed`.

`retryAfterSeconds` is what separates a failure that is still being worked on
from one that is over: `inference_unavailable` is the one transient class, and
the Personal Server retries it on its own schedule. `waitForDerivativeStatus`
returns as soon as the scope is `ready` or has failed with no retry pending,
keeps waiting through a retrying failure, and honours the server's
`retryAfterSeconds` over `pollIntervalMs` — polling faster than the next
compute only spends requests. A failed status is returned, not thrown; branch
on `errorCode`. `isDerivativeStatusSettled` is the same predicate, exported
for callers that poll on their own.

When several questions write the same derived scope, the most optimistic true
state answers (`ready`, then `stale`, then `pending`, then `failed`), because
serving data is registration-agnostic: a duplicate that never wrote anything
must not report away an answer the scope has.

The status route needs a Personal Server that ships it; an older one answers
404 for the route itself, which arrives as `DerivativeQuestionNotFoundError`
— the same error as a covered scope with no question behind it.

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
- [Discord](https://discord.gg/vanaofficial)

## License

[ISC](https://opensource.org/licenses/ISC)
