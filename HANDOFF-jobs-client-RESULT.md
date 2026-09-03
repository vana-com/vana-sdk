# Review fixes

1. Narrowed `JobsBuilderAccount` to viem `LocalAccount` shapes that expose a
   public key. Documented that `builderAccount` supports submit/status/wait,
   while `openResult` and `readRaw` require `builderPrivateKey`; retained the
   typed runtime rejection when the raw key is absent.
2. Added the explicit Node-only `./protocol/jobs-client` package export with
   `"browser": null`, and added the source to `NODE_ENTRY_POINTS` because the
   explicit-export validator requires it. The browser root bundle contains no
   jobs-client or `node:crypto` reference, and browser-condition subpath import
   is blocked.
3. Bound inline HTTP 200 responses to the locally submitted `jobId`, rejecting
   mismatches with `JobRejectedError`.
4. Made `gatewayUrl` reject non-root paths, queries, and fragments at client
   construction time.
5. Tightened required job-status fields and operation validation, and now
   validates an identity address plus its public-key/address binding before
   encryption. Full TDX/KMS evidence verification remains intentionally out of
   scope until fleet trust anchors are provisioned, matching the reference
   driver.
6. Added concise Node-only and decryption-requirement remarks to the factory,
   option, `openResult`, and `readRaw` documentation.

Regression proof: `npm test -- --run src/protocol/jobs-client.test.ts` first
failed in the 10 new behavioral cases, then passed with 34 total focused tests
after the fixes. From `packages/vana-sdk/`, all gates pass:

- `npm run lint` — passed with 0 errors (3 unrelated pre-existing warnings)
- `npm run typecheck` — passed
- `npm test` — passed: 75 files, 1,281 tests
- `npm run build` — passed, including platform, 16-entry-point, and declaration
  validation
