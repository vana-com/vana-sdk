/**
 * The short-lived read capability the embedded connect sheet asks for.
 *
 * @remarks
 * It is the Direct SDK request signature the controller already sends when it
 * polls a request's status: an EIP-191 `personal_sign`, by the app key, of
 *
 * ```
 * Vana Direct Access Request v1
 * method:GET
 * path:/api/data-connection-requests/<requestId>
 * timestamp:<ms since epoch>
 * body:
 * ```
 *
 * Vana Account replays it to the request authority, so the sheet can show the
 * request's real scopes while the key stays on the app's server. Account
 * accepts it for about five minutes, so sign it each time the sheet asks.
 *
 * @category Direct
 * @module direct/request-authorization
 */

import type { Web3SignedSignFn } from "../auth/web3-signed-builder";
import { isRequestId, type RequestAuthorization } from "../connect/protocol";
import { buildDirectAccessRequestAuthMessage } from "./access-request-client";
import { DirectConfigError } from "./errors";

/** Input for {@link signRequestReadAuthorization}. */
export interface SignRequestReadAuthorizationInput {
  /** The `dcr_*` request id to authorize reading. */
  requestId: string;
  /** The app's `0x` address (the signer of `signMessage`). */
  appAddress: string;
  /** EIP-191 `personal_sign` by the app key. */
  signMessage: Web3SignedSignFn;
  /** Clock in ms. Defaults to `Date.now`. */
  now?: () => number;
}

/**
 * The path a read authorization covers.
 *
 * @param requestId - The `dcr_*` request id.
 * @returns `/api/data-connection-requests/<requestId>`.
 */
export function requestReadPath(requestId: string): string {
  return `/api/data-connection-requests/${encodeURIComponent(requestId)}`;
}

/**
 * The exact message a read authorization signs.
 *
 * @param requestId - The `dcr_*` request id.
 * @param timestamp - Milliseconds since epoch, as a decimal string.
 * @returns The newline-joined Direct access-request message for the GET.
 */
export function buildRequestReadAuthorizationMessage(
  requestId: string,
  timestamp: string,
): string {
  return buildDirectAccessRequestAuthMessage({
    method: "GET",
    path: requestReadPath(requestId),
    timestamp,
    body: "",
  });
}

/**
 * Sign the read capability for one request.
 *
 * @remarks
 * Signs only; it does not check whose request this is. Sign only requests the
 * caller created for this browser (the handler from
 * `createVanaConnectHandler` does that with a signed cookie).
 *
 * @param input - Request id, app address and signer.
 * @returns `{ appAddress, timestamp, signature }`, the `authorization` of a
 * `ConnectRequest`.
 * @throws {@link DirectConfigError} when `requestId` is not a request id
 * (`[A-Za-z0-9_-]{1,128}`), or `appAddress` is not an address.
 */
export async function signRequestReadAuthorization(
  input: SignRequestReadAuthorizationInput,
): Promise<RequestAuthorization> {
  if (!isRequestId(input.requestId)) {
    throw new DirectConfigError("Not a request id to sign for", {
      requestId: input.requestId,
    });
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(input.appAddress)) {
    throw new DirectConfigError("appAddress must be a 0x-prefixed address");
  }
  const timestamp = String((input.now ?? Date.now)());
  const signature = await input.signMessage(
    buildRequestReadAuthorizationMessage(input.requestId, timestamp),
  );
  return {
    appAddress: input.appAddress as `0x${string}`,
    signature: signature as `0x${string}`,
    timestamp,
  };
}
