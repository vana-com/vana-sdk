# Changelog

Stable releases are published by semantic-release from `main`; their notes
live in the GitHub releases. This file records hand-published prereleases.

## 4.4.0-connect-sheet.0 (prerelease, npm dist-tag `connect-sheet`)

Vana's in-page connect sheet (`presentation: "sheet"`), from PR #218. Not yet
on `latest`.

### Added

- `@opendatalabs/vana-sdk/connect`: the sheet launcher (`connect.open`), its
  chrome, and browser transports for a `createVanaConnectHandler` backend.
- `@opendatalabs/vana-sdk/connect/protocol`: the zero-dependency message
  protocol, including `CLIENT_CHECK_PATH`, `clientCheckUrl` and
  `parseClientCheck`. Error code `vana_unavailable`; close reason
  `origin_not_registered`.
- The launcher asks `GET <account>/api/embed/connect/client` (no credentials,
  no cache) alongside framing and closes with `origin_not_registered` on a
  definite no. Any `vana:error` clears the ready timer.
- `connect.open({ display })`: `sheet` (the default) or `fullscreen`, for a
  window that holds nothing else. `CONNECT_DISPLAYS`, `ConnectDisplay`,
  `DEFAULT_CONNECT_DISPLAY` and `readConnectDisplay` come from
  `/connect/protocol`. Ported from `@vana-unity/connect-embed` at `13e4582fa`,
  along with keeping the bottom sheet above a keyboard that pans the page.
- `resolveVanaAccountOrigin` and `parseOriginAllowlist` (`/connect`,
  `/server`): a vetted Account-origin resolver with exact-match allowlists
  only, overrides off by default.
- `createVanaConnectHandler` (`/server`): one handler for `config`,
  `request`, `status` and `data`, with request-to-browser binding, a
  pluggable `rateLimit` on creates (default `createMemoryRateLimit()`,
  in memory, not production-grade), `429 rate_limited`, and `session`.
- `useVanaConnect` (`/react`) and `createDirectConnectFlow`
  `presentation: "sheet"`. Sheet events only nudge the status poll; `done`
  and `error` still come from the backend poll and read.
- `DirectConnectCapabilities`, `isConnectCapableController`,
  `missingConnectCapabilities`.

### Breaking (relative to the vendored `4.3.2-connect-sheet` tarball)

- Partner writes are gone: no `vana:write` / `vana:write-result` messages,
  no `ConnectHandle.write`, no `DirectConnectFlow.write`, no `write` from
  `useDirectVanaConnect`.
- No implicit production Vana origin: `connect.open` needs `env` or
  `vanaOrigin`, `DirectConnectSheetOptions.accountOrigin` is required, and
  `vanaConnectCsp` needs a target. `vanaConnectCsp` now also returns
  `connect-src` for the client check.

Against the released `4.3.2` nothing breaks: the connect APIs are new, and the
connect methods on `DirectDataController` (`authorizeRequestRead`,
`getEndpoints`, `deriveSecret`, `getEnv`) are optional on the interface, so
hand-written controllers keep compiling. `createDirectDataController` returns
`ConnectCapableDirectDataController`, which has them all.

### Publishing this prerelease

From a clean checkout of the PR head, with npm publish rights:

```sh
npm ci
cd packages/vana-sdk
NODE_OPTIONS="--max-old-space-size=4096" npm run build
npm publish --tag connect-sheet --access public
```

`--tag connect-sheet` keeps `latest` on the stable release. Consumers install
`@opendatalabs/vana-sdk@4.4.0-connect-sheet.0` (or `@connect-sheet`).
