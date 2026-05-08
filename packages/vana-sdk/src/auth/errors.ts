/**
 * Auth-specific error classes for Web3Signed verification.
 *
 * @remarks
 * Mirrors the relevant subset of `personal-server-ts` `ProtocolError` so server
 * code that consumes Web3Signed primitives can branch on typed errors. They
 * extend {@link VanaError} so they fit the SDK error hierarchy.
 *
 * @category Error Handling
 */

import { VanaError } from "../errors";

/** Thrown when an Authorization header is missing or empty. */
export class MissingAuthError extends VanaError {
  constructor(
    message = "Missing authentication",
    public readonly details?: Record<string, unknown>,
  ) {
    super(message, "MISSING_AUTH");
  }
}

/** Thrown when a Web3Signed header is malformed or its signature does not verify. */
export class InvalidSignatureError extends VanaError {
  constructor(
    public readonly details?: Record<string, unknown>,
    message = "Invalid signature",
  ) {
    super(message, "INVALID_SIGNATURE");
  }
}

/** Thrown when a Web3Signed token is expired or issued too far in the future. */
export class ExpiredTokenError extends VanaError {
  constructor(
    public readonly details?: Record<string, unknown>,
    message = "Token has expired",
  ) {
    super(message, "EXPIRED_TOKEN");
  }
}
