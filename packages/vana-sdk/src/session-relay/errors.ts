import { VanaError } from "../errors";

/** Error details returned by Session Relay. */
export interface SessionRelayErrorDetails {
  status?: number;
  relayCode?: number;
  relayErrorCode?: string;
  body?: unknown;
}

/** Error thrown by Session Relay client operations. */
export class SessionRelayError extends VanaError {
  constructor(
    message: string,
    public readonly details: SessionRelayErrorDetails = {},
  ) {
    super(message, details.relayErrorCode ?? "SESSION_RELAY_ERROR");
  }
}
