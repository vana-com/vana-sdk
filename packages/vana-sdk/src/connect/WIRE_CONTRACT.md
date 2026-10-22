# Connect sheet: wire contract

The in-page connect sheet needs a backend that creates a data connection
request, signs the sheet's short-lived read of it, and reports and reads it.
`createVanaConnectHandler` (`@opendatalabs/vana-sdk/server`) is that backend
for JavaScript. A backend in another language implements the routes below;
the browser side (`useVanaConnect`, `createVanaConnectTransports`) then works
unchanged. OpenPet's Go endpoint (`/f/vana-authorization`) is an existing
non-JS implementation of the signing part.

```
browser                          your backend                     Vana
───────                          ────────────                     ────
GET  {base}/config          ──▶  sheet client id, Account origin
POST {base}/request {}      ──▶  create DCR (app key)        ──▶  app.vana.org
                            ◀──  { request, embed } + binding cookie
  sheet (iframe on Account) asks for the request after sign-in
POST {base}/request {requestId} ──▶ re-sign, bound requests only
                            ◀──  { request, embed }
  partner page posts embed to the sheet; Account replays the signature
GET  {base}/status?requestId ──▶ status of a bound request    ──▶  app.vana.org
GET  {base}/data?requestId   ──▶ read from the Personal Server ──▶ Personal Server
```

`{base}` is any path (the SDK defaults to `/api/vana`). The browser calls it
same-origin with cookies.

## Routes

All responses are JSON with `Cache-Control: no-store`. Errors are
`{ "error": { "code": string, "message": string } }`.

### `GET {base}/config`

```json
{
  "protocolVersion": 1,
  "env": "production",
  "clientId": "my-app",
  "appName": "My App",
  "accountOrigin": "https://account.vana.org"
}
```

`clientId` is the embed client id Vana Account registered for the page's
origin, or `null` when the sheet is not set up (the browser then uses a tab).
`accountOrigin` is `https://account.vana.org` in production and
`https://account-dev.vana.org` on Vana's dev stack.

### `POST {base}/request`

Body `{}` creates a request. Body `{ "requestId": "<id>" }` re-signs a request
this browser already holds and creates nothing.

```json
{
  "request": {
    "requestId": "dcr_…",
    "approvalUrl": "https://app.vana.org/data-connection-requests/dcr_…?mode=page",
    "appAddress": "0x…",
    "expiresAt": "2026-10-21T12:15:00.000Z"
  },
  "embed": {
    "id": "dcr_…",
    "authorization": {
      "appAddress": "0x…",
      "timestamp": "1767225600000",
      "signature": "0x…"
    }
  }
}
```

- On create, bind the request to the browser (see [Binding](#binding)).
- On re-sign, refuse with `403 request_not_bound` unless the request is bound
  to this browser. Never sign an id the browser merely names.
- Sign `embed.authorization` on every call; Vana Account accepts it for about
  five minutes.
- Refuse a `POST` whose `Origin` is not your own (`403 forbidden_origin`).

### `GET {base}/status?requestId=<id>`

`{ "status": "pending" | "approved" | "ready_for_read" | "completed" | "denied" | "expired" }`,
plus `mobileContinuationUrl` while a mobile deep request is pending. Only for a
bound request. Do not return the grant id or Personal Server URL; the browser
does not need them.

### `GET {base}/data?requestId=<id>`

The approved data, as `{ "scope": string, "data": any }` by default. Only for a
bound request. Status codes: `409 not_approved`, `402 payment_required`,
`502 personal_server_error`.

## Binding

A request is bound to the browser that created it, so the backend signs and
reads nothing for anyone else. Any equivalent works; the SDK's default is:

- Cookie `vana_dcr_<requestId>`, `HttpOnly; SameSite=Lax; Path=/` (and
  `Secure` over https), lasting until the request expires (at least one hour,
  at most seven days).
- Value `base64url(JSON payload) "." base64url(tag)`, payload
  `{ "v": 1, "r": requestId, "e": expiresAtMs, "s"?: base64url(sha256(sessionId)) }`.
- `tag = HMAC-SHA256(key, "vana-connect-binding." + base64url(payload))`.
- `key = HKDF-SHA256(ikm = the 32 app key bytes, salt = "vana-sdk/derived-secret/v1", info = "vana-sdk/connect/request-binding/v1", 32 bytes)`.

The cookie is internal to your backend, so another language may use its own
scheme (OpenPet looks the request up through its existing flow cookie).

## The read authorization

`embed.authorization` is the Direct SDK request signature for reading one
request: an EIP-191 `personal_sign`, by the app key, of five lines joined by
`\n`, with no trailing newline:

```
Vana Direct Access Request v1
method:GET
path:/api/data-connection-requests/<requestId>
timestamp:<milliseconds since epoch, decimal>
body:
```

It is the same signature the backend sends as `X-Vana-App-Signature` when it
polls `GET /api/data-connection-requests/<requestId>`. Rules the sheet
enforces:

- `requestId` matches `^[A-Za-z0-9_-]{1,128}$`. Refuse to sign anything else:
  it would be signed into a different path.
- `appAddress` is the app's `0x` address (40 hex), `signature` is `0x` and 130
  hex characters (lowercase is safest), `timestamp` is 10 to 16 digits.

### Test vector

| Field       | Value                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| app key     | `keccak256(utf8("vana-sdk connect test vector"))`, used as the 32 key bytes                                                            |
| app address | `0x40ED6841FCa2e4f44EDbECe0541D1f73bBa11442`                                                                                           |
| request id  | `dcr_test_vector_1`                                                                                                                    |
| timestamp   | `1767225600000`                                                                                                                        |
| message     | `Vana Direct Access Request v1\nmethod:GET\npath:/api/data-connection-requests/dcr_test_vector_1\ntimestamp:1767225600000\nbody:`      |
| signature   | `0xb7ceb795efdb9697275b9b003e1df608c92b33d17644845d52af1b41436a579a186e6ae426cd268c9f48e2c108133a07c76e801c664a1615fab18bfa1ee0e0b51c` |

`src/direct/request-authorization.test.ts` asserts this vector.

## Partner page requirements

- The sheet is framed from `accountOrigin`. With a Content-Security-Policy,
  allow `frame-src <accountOrigin>` (`vanaConnectCsp(env)` returns it).
- Vana Account serves the sheet only to the origin registered for the client
  id; anywhere else it reports `origin_not_registered` and the SDK falls back
  to the approval link.

## Protocol versioning

The sheet URL carries `v`, the highest protocol version the launcher speaks.
The launcher accepts messages at any version from `MIN_PROTOCOL_VERSION` to
`PROTOCOL_VERSION` (both 1 today) and drops fields it does not know. A
`vana:ready` or `vana:error` at a version outside that range closes the sheet
with `incompatible_version`, and the flow falls back to the approval link. An
error code the launcher does not know is read as `sheet_failed`.
