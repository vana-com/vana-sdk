/**
 * Typed errors for the Direct Data Controller flow.
 *
 * @remarks
 * These extend {@link VanaError} so direct-controller callers can branch on the
 * structured `code` field. The messages map to the failure modes documented in
 * the builder guide ("Common Errors").
 *
 * @category Direct
 * @module direct/errors
 */

import { VanaError } from "../errors";

/** Thrown when configuration passed to {@link createDirectDataController} is invalid. */
export class DirectConfigError extends VanaError {
  constructor(
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message, "DIRECT_CONFIG_ERROR");
  }
}

/**
 * Thrown when {@link DirectDataController.readApprovedData} is called for a
 * request that is not yet approved (missing grantId, scope, or personalServerUrl).
 */
export class AccessNotApprovedError extends VanaError {
  constructor(
    message = "Access request is not approved yet",
    public readonly details?: Record<string, unknown>,
  ) {
    super(message, "DIRECT_ACCESS_NOT_APPROVED");
  }
}

/** Thrown when the Personal Server cannot be reached or returns an error. */
export class PersonalServerReadError extends VanaError {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message, "DIRECT_PERSONAL_SERVER_READ_ERROR");
  }
}

/**
 * Thrown when a Personal Server requires payment (HTTP 402) but the controller
 * has no {@link PaymentSigner}, or the payment retry still fails.
 */
export class PaymentRequiredError extends VanaError {
  constructor(
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message, "DIRECT_PAYMENT_REQUIRED");
  }
}
