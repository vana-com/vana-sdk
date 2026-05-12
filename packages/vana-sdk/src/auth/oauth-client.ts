/**
 * OAuth 2.0 Authorization Code + PKCE client orchestration.
 *
 * @remarks
 * Drives the full authorize → callback → token-exchange → refresh dance on top
 * of the {@link TokenStore} and PKCE primitives that ship with this package.
 * Implements RFC 6749 §4.1 with the RFC 7636 PKCE extension (S256 only).
 *
 * @category Auth
 * @module auth/oauth-client
 */

import { computePkceChallenge, generatePkceVerifier } from "./pkce";
import {
  InMemoryTokenStore,
  type TokenRecord,
  type TokenStore,
} from "./token-store";

/**
 * Constructor options for {@link OAuthClient}.
 */
export interface OAuthClientConfig {
  /** Authorization endpoint, e.g. `https://account.vana.org/oauth/authorize`. */
  authorizationEndpoint: string;
  /** Token endpoint, e.g. `https://account.vana.org/oauth/token`. */
  tokenEndpoint: string;
  /** OAuth `client_id` (public; PKCE protects the flow). */
  clientId: string;
  /** Redirect URI registered with the authorization server. */
  redirectUri: string;
  /** Default scope; can be overridden per call. */
  scope?: string;
  /**
   * Where to persist access + refresh tokens and the in-flight code verifier
   * between `authorize` → `callback`. Defaults to a fresh
   * {@link InMemoryTokenStore}. Use IndexedDB/localStorage-backed
   * implementations for browser apps where the user navigates away during the
   * dance.
   */
  tokenStore?: TokenStore;
  /** Override the global `fetch` (e.g. for tests). Defaults to `globalThis.fetch`. */
  fetchImpl?: typeof fetch;
  /**
   * Override the random-state generator (mostly for tests). Must return a
   * URL-safe string of >= 16 bytes of entropy.
   */
  generateState?: () => string;
}

/**
 * Result of {@link OAuthClient.buildAuthorizationUrl}.
 */
export interface AuthorizationUrlResult {
  /** The full authorize URL to redirect / `window.open` to. */
  url: string;
  /** The `state` value the auth server will echo back; used for CSRF check. */
  state: string;
}

/** TTL for the in-flight verifier record (seconds). */
const VERIFIER_TTL_SECONDS = 600;

/** RFC 6749 spec-compliant OAuth error payload shape. */
interface OAuthErrorBody {
  error?: string;
  error_description?: string;
  error_uri?: string;
}

/** Successful token-endpoint response shape (RFC 6749 §5.1). */
interface TokenEndpointResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * OAuth 2.0 Authorization Code + PKCE client.
 *
 * @remarks
 * Storage layout under the supplied {@link TokenStore} (all keys namespaced):
 * - `oauth:tokens:{clientId}`  → access token record
 * - `oauth:refresh:{clientId}` → refresh token record (no expiry)
 * - `oauth:verifier:{state}`   → in-flight PKCE verifier (10 min TTL)
 *
 * @category Auth
 */
export class OAuthClient {
  readonly #config: Required<
    Omit<
      OAuthClientConfig,
      "scope" | "tokenStore" | "fetchImpl" | "generateState"
    >
  > & {
    scope?: string;
    tokenStore: TokenStore;
    fetchImpl: typeof fetch;
    generateState: () => string;
  };

  public constructor(config: OAuthClientConfig) {
    const fetchImpl = config.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new TypeError(
        "OAuthClient requires a global `fetch` or an explicit `fetchImpl`",
      );
    }

    this.#config = {
      authorizationEndpoint: config.authorizationEndpoint,
      tokenEndpoint: config.tokenEndpoint,
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      scope: config.scope,
      tokenStore: config.tokenStore ?? new InMemoryTokenStore(),
      fetchImpl,
      generateState: config.generateState ?? defaultGenerateState,
    };
  }

  /** Build the authorize URL and persist the PKCE verifier keyed by `state`. */
  public async buildAuthorizationUrl(
    opts: {
      state?: string;
      scope?: string;
      extraParams?: Record<string, string>;
    } = {},
  ): Promise<AuthorizationUrlResult> {
    const state = opts.state ?? this.#config.generateState();
    const scope = opts.scope ?? this.#config.scope;

    const verifier = generatePkceVerifier();
    const challenge = await computePkceChallenge(verifier);

    await this.#config.tokenStore.set(this.#verifierKey(state), {
      token: verifier,
      expiresAt: Math.floor(Date.now() / 1000) + VERIFIER_TTL_SECONDS,
    });

    const params = new URLSearchParams();
    params.set("response_type", "code");
    params.set("client_id", this.#config.clientId);
    params.set("redirect_uri", this.#config.redirectUri);
    if (scope !== undefined && scope.length > 0) {
      params.set("scope", scope);
    }
    params.set("state", state);
    params.set("code_challenge", challenge);
    params.set("code_challenge_method", "S256");
    if (opts.extraParams !== undefined) {
      for (const [k, v] of Object.entries(opts.extraParams)) {
        params.set(k, v);
      }
    }

    const sep = this.#config.authorizationEndpoint.includes("?") ? "&" : "?";
    const url = `${this.#config.authorizationEndpoint}${sep}${params.toString()}`;

    return { url, state };
  }

  /**
   * Handle the redirect-callback URL. Validates `state`, retrieves the saved
   * verifier, exchanges the authorization code + verifier for tokens, and
   * persists them. Returns the access {@link TokenRecord}.
   */
  public async handleCallback(callbackUrl: string): Promise<TokenRecord> {
    const parsed = new URL(callbackUrl);
    const params = parsed.searchParams;

    const errorCode = params.get("error");
    if (errorCode !== null) {
      throw new Error(
        formatOAuthError({
          error: errorCode,
          error_description: params.get("error_description") ?? undefined,
        }),
      );
    }

    const code = params.get("code");
    const state = params.get("state");
    if (code === null || state === null) {
      throw new Error("OAuth callback is missing `code` or `state`");
    }

    const verifierRecord = await this.#config.tokenStore.get(
      this.#verifierKey(state),
    );
    if (verifierRecord === null) {
      throw new Error(
        "OAuth callback state does not match any in-flight verifier (possible CSRF or expired flow)",
      );
    }

    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", code);
    body.set("redirect_uri", this.#config.redirectUri);
    body.set("client_id", this.#config.clientId);
    body.set("code_verifier", verifierRecord.token);

    let tokens: TokenEndpointResponse;
    try {
      tokens = await this.#tokenRequest(body);
    } finally {
      // Always clear the one-shot verifier, even on a failed exchange.
      await this.#config.tokenStore.delete(this.#verifierKey(state));
    }

    return this.#persistTokens(tokens);
  }

  /**
   * Exchange a stored refresh token for a fresh access token. Throws if no
   * refresh token is available.
   */
  public async refresh(): Promise<TokenRecord> {
    const refreshRecord = await this.#config.tokenStore.get(this.#refreshKey());
    if (refreshRecord === null) {
      throw new Error("OAuth refresh failed: no refresh token stored");
    }

    const body = new URLSearchParams();
    body.set("grant_type", "refresh_token");
    body.set("refresh_token", refreshRecord.token);
    body.set("client_id", this.#config.clientId);

    const tokens = await this.#tokenRequest(body);
    return this.#persistTokens(tokens, refreshRecord.token);
  }

  /**
   * Get the current access token if valid (refreshing first if expired and a
   * refresh token is available). Returns `null` when no usable token exists.
   */
  public async getAccessToken(): Promise<string | null> {
    const stored = await this.#config.tokenStore.get(this.#accessKey());
    if (stored !== null) return stored.token;

    // Stored access token is missing or already evicted by the store's TTL.
    const refresh = await this.#config.tokenStore.get(this.#refreshKey());
    if (refresh === null) return null;

    try {
      const refreshed = await this.refresh();
      return refreshed.token;
    } catch {
      return null;
    }
  }

  /** Forget tokens (logout). Does NOT call any remote revocation endpoint. */
  public async signOut(): Promise<void> {
    await this.#config.tokenStore.delete(this.#accessKey());
    await this.#config.tokenStore.delete(this.#refreshKey());
  }

  #accessKey(): string {
    return `oauth:tokens:${this.#config.clientId}`;
  }

  #refreshKey(): string {
    return `oauth:refresh:${this.#config.clientId}`;
  }

  #verifierKey(state: string): string {
    return `oauth:verifier:${state}`;
  }

  async #tokenRequest(body: URLSearchParams): Promise<TokenEndpointResponse> {
    const response = await this.#config.fetchImpl(this.#config.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });

    const text = await response.text();
    const parsed = parseJsonBody(text);

    if (!response.ok) {
      throw new Error(formatOAuthError(parsed ?? {}, response.status));
    }

    if (
      parsed === null ||
      typeof parsed !== "object" ||
      typeof (parsed as { access_token?: unknown }).access_token !== "string"
    ) {
      throw new Error(
        "OAuth token endpoint returned a response without an `access_token` string",
      );
    }

    return parsed as TokenEndpointResponse;
  }

  async #persistTokens(
    tokens: TokenEndpointResponse,
    previousRefreshToken?: string,
  ): Promise<TokenRecord> {
    const record: TokenRecord = { token: tokens.access_token };
    if (typeof tokens.expires_in === "number" && tokens.expires_in > 0) {
      record.expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;
    }
    await this.#config.tokenStore.set(this.#accessKey(), record);

    const newRefresh = tokens.refresh_token ?? previousRefreshToken;
    if (newRefresh !== undefined) {
      await this.#config.tokenStore.set(this.#refreshKey(), {
        token: newRefresh,
      });
    }

    return record;
  }
}

function defaultGenerateState(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function parseJsonBody(text: string): unknown {
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function formatOAuthError(body: OAuthErrorBody, status?: number): string {
  const parts: string[] = ["OAuth token request failed"];
  if (status !== undefined) parts.push(`(HTTP ${String(status)})`);
  if (body.error !== undefined && body.error.length > 0) {
    parts.push(`: ${body.error}`);
    if (
      body.error_description !== undefined &&
      body.error_description.length > 0
    ) {
      parts.push(`- ${body.error_description}`);
    }
  }
  return parts.join(" ").replace(" : ", ": ").replace(" - ", " - ");
}
