/**
 * PDPP Core v0.1.0 client role.
 *
 * @remarks
 * Import as `@opendatalabs/vana-sdk/pdpp`. Request authorization with
 * {@link buildDataAccessDetail} and {@link discoverPdppAuthorizationServer},
 * exchange the code with {@link exchangeAuthorizationCode}, and read with
 * {@link PdppResourceClient}. Vana's own scope read API (`GET /v1/data/{scope}`)
 * is separate and is not a PDPP client path.
 *
 * @category PDPP
 */
export * from "./types";
export * from "./errors";
export * from "./authorization";
export * from "./resource-client";
export * from "./sync-copy";
