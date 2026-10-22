/**
 * One Fetch-API handler for every backend route the connect flow needs.
 *
 * @remarks
 * `createVanaConnectHandler` answers four routes under one base path. The
 * action is the last path segment, so mount it as a catch-all
 * (`app/api/vana/[action]/route.ts` in Next.js, or `app.use("/api/vana",
 * toNodeHandler(handler))` in Express):
 *
 * | Route                         | Does                                                 |
 * | ----------------------------- | ---------------------------------------------------- |
 * | `GET  config`                 | Sheet config: client id, app name, Account origin.   |
 * | `POST request`                | Create a request bound to this browser, or re-sign one it already holds. Returns `{ request, embed }`. |
 * | `GET  status?requestId=`      | Status of a bound request.                           |
 * | `GET  data?requestId=`        | Read the approved data of a bound request.           |
 *
 * Binding: a created request is bound to the browser by an HttpOnly,
 * `SameSite=Lax` cookie carrying an HMAC-SHA256 tag, keyed by a secret
 * derived from the app key with HKDF. The handler signs, reports and reads
 * only requests bound to the calling browser (and, with `session`, to the
 * app's own signed-in user). See `src/connect/WIRE_CONTRACT.md` for the
 * wire contract a non-JS backend implements instead.
 *
 * What a request asks for is the controller's: its PDPP `grants` (each
 * stream requested as `pdpp.<source>.<stream>`) and legacy `scopes`. The
 * browser never chooses; `POST request` reports the scopes it sent.
 *
 * Creating a request is rate limited (`rateLimit`; by default in memory,
 * per client IP and per session, which is not production-grade). In
 * production, require a signed-in user with `session` and put a shared
 * limiter in front of `POST request`.
 *
 * @category Direct
 * @module direct/connect-handler
 */

import {
  isRequestId,
  PROTOCOL_VERSION,
  VANA_ACCOUNT_ORIGINS,
} from "../connect/protocol";
import {
  missingConnectCapabilities,
  type ConnectCapableDirectDataController,
  type DirectDataController,
} from "./controller";
import {
  AccessNotApprovedError,
  DirectConfigError,
  PaymentRequiredError,
  PersonalServerReadError,
  ScopeNotApprovedError,
} from "./errors";
import { buildApprovalUrl } from "./access-request-client";
import type { AccessRequest } from "./types";
import type { VanaConnectConfig } from "../connect/http-transports";

export type { VanaConnectConfig };

/** The create input the handler forwards, minus what it sets itself. */
export type VanaConnectCreateOptions = Omit<
  Parameters<DirectDataController["createAccessRequest"]>[0],
  "returnUrl"
>;

/** What a {@link VanaConnectRateLimit} decides. */
export type VanaConnectRateLimitDecision =
  | { ok: true }
  | {
      ok: false;
      /** Sent as `Retry-After`, in whole seconds. */
      retryAfterSeconds?: number;
    };

/**
 * Decide whether one `POST request` that creates a request may proceed.
 *
 * @remarks
 * Called after the origin and `session` checks and before the controller
 * creates anything. `session` is the hash of the app's session id when
 * `session` is configured. Re-signing a request the browser already holds is
 * not rate limited: it creates nothing and needs a valid binding.
 */
export type VanaConnectRateLimit = (input: {
  request: Request;
  session?: string;
}) => VanaConnectRateLimitDecision | Promise<VanaConnectRateLimitDecision>;

/** Options for {@link createMemoryRateLimit}. */
export interface MemoryRateLimitOptions {
  /** Creates allowed per key per window. Defaults to 10. */
  max?: number;
  /** Window length in ms. Defaults to 60000. */
  windowMs?: number;
  /**
   * The caller's IP. Defaults to {@link defaultClientIp}, which trusts proxy
   * headers; behind anything else, supply the address your platform vouches
   * for.
   */
  clientIp?: (request: Request) => string | null;
  /** Keys kept before the oldest are dropped. Defaults to 10000. */
  maxKeys?: number;
  /** Clock in ms. Defaults to `Date.now`. */
  now?: () => number;
}

const nodeRemoteAddresses = new WeakMap<Request, string>();

/**
 * The caller's IP as the default rate limit sees it.
 *
 * @remarks
 * `CF-Connecting-IP`, then `X-Real-IP`, then the last `X-Forwarded-For`
 * hop (the one your proxy appended), then the socket address when the
 * request came through {@link toNodeHandler}. Headers are only as honest as
 * the proxy in front of you: without one, a client can set them.
 *
 * @param request - The incoming request.
 * @returns An IP string, or `null` when nothing names one.
 */
export function defaultClientIp(request: Request): string | null {
  const header = (name: string): string | null => {
    const value = request.headers.get(name)?.trim();
    return value ? value : null;
  };
  const forwarded = header("x-forwarded-for")
    ?.split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  return (
    header("cf-connecting-ip") ??
    header("x-real-ip") ??
    forwarded?.[forwarded.length - 1] ??
    nodeRemoteAddresses.get(request) ??
    null
  );
}

/**
 * An in-memory, fixed-window rate limit per client IP and per session.
 *
 * @remarks
 * The default for `createVanaConnectHandler`. Not production-grade: each
 * server instance (and each serverless cold start) counts on its own, and
 * the IP comes from headers a client can forge without a trusted proxy.
 * In production, require `session` and pass a `rateLimit` backed by a
 * shared store (Redis, your platform's limiter).
 *
 * @param options - Limit, window, IP source and memory bound.
 * @returns A {@link VanaConnectRateLimit}.
 */
export function createMemoryRateLimit(
  options: MemoryRateLimitOptions = {},
): VanaConnectRateLimit {
  const max = options.max ?? 10;
  const windowMs = options.windowMs ?? 60_000;
  const maxKeys = options.maxKeys ?? 10_000;
  const clientIp = options.clientIp ?? defaultClientIp;
  const now = options.now ?? Date.now;
  const windows = new Map<string, { count: number; resetAt: number }>();

  function prune(at: number): void {
    for (const [key, window] of windows) {
      if (window.resetAt <= at) windows.delete(key);
    }
    // Still full: drop the oldest keys (Map keeps insertion order).
    for (const key of windows.keys()) {
      if (windows.size < maxKeys) break;
      windows.delete(key);
    }
  }

  return ({ request, session }) => {
    const at = now();
    const keys = [`ip:${clientIp(request) ?? "unknown"}`];
    if (session) keys.push(`session:${session}`);
    let retryAfterMs = 0;
    for (const key of keys) {
      const window = windows.get(key);
      if (window && window.resetAt > at && window.count >= max) {
        retryAfterMs = Math.max(retryAfterMs, window.resetAt - at);
      }
    }
    if (retryAfterMs > 0) {
      return { ok: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
    }
    if (windows.size >= maxKeys) prune(at);
    for (const key of keys) {
      const window = windows.get(key);
      if (window && window.resetAt > at) {
        window.count += 1;
      } else {
        windows.delete(key);
        windows.set(key, { count: 1, resetAt: at + windowMs });
      }
    }
    return { ok: true };
  };
}

/** Options for {@link createVanaConnectHandler}. */
export interface VanaConnectHandlerOptions {
  /**
   * The app's controller; it holds the key and talks to Vana. It must
   * implement the connect methods (`authorizeRequestRead`, `getEndpoints`,
   * `getEnv`, and `deriveSecret` unless `bindingSecret` is set), as every
   * `createDirectDataController` controller does.
   */
  controller: DirectDataController;
  /**
   * Absolute URL Vana returns the person to after approving in a tab. Its
   * origin is also the only `Origin` accepted on `POST` (see
   * {@link VanaConnectHandlerOptions.allowedOrigins}).
   */
  returnUrl: string;
  /**
   * The embed client id Vana Account registered for this app's origin. Without
   * it `GET config` reports `clientId: null` and the browser cannot open the
   * sheet (it falls back to a tab).
   */
  clientId?: string;
  /** Label on the sheet chrome. Defaults to the controller's app name. */
  appName?: string;
  /**
   * Bind requests to the app's own signed-in user too. Return a stable user or
   * session id, or `null` to refuse with `401`. Only a hash of it is stored.
   *
   * @remarks
   * Recommended for production. Without it, anyone who can load your page
   * can create requests on your app's behalf; the browser binding only stops
   * them reading someone else's.
   */
  session?: (request: Request) => string | null | Promise<string | null>;
  /**
   * Extra create input per request (questions, owner, ...). Called on each
   * create.
   */
  createOptions?: (
    request: Request,
  ) => VanaConnectCreateOptions | Promise<VanaConnectCreateOptions>;
  /**
   * Custom read for `GET data`. Defaults to
   * `controller.readApprovedData({ requestId })`. The result is sent as JSON.
   */
  read?: (input: {
    controller: DirectDataController;
    requestId: string;
    request: Request;
  }) => Promise<unknown>;
  /**
   * Origins accepted on `POST`. Defaults to the origin of `returnUrl`. A
   * request without an `Origin` header (a non-browser client) is accepted.
   */
  allowedOrigins?: string[];
  /**
   * Secret for the binding cookie. Defaults to a key derived from the app key
   * with HKDF-SHA256 (`controller.deriveSecret`). Set it to rotate bindings
   * independently of the app key.
   */
  bindingSecret?: string;
  /**
   * Rate limit for creating requests. Defaults to
   * {@link createMemoryRateLimit}() (10 per minute per IP and per session,
   * in memory, not production-grade). Pass your own shared limiter in
   * production, or `false` when one already sits in front of this route.
   * A refusal answers `429 rate_limited` with `Retry-After`.
   */
  rateLimit?: VanaConnectRateLimit | false;
  /** Cookie `Path`. Defaults to `/`. */
  cookiePath?: string;
  /** Clock in ms. Defaults to `Date.now`. */
  now?: () => number;
}

/** A Fetch-API request handler. */
export type VanaConnectHandler = (request: Request) => Promise<Response>;

/** Error codes in a handler error body: `{ error: { code, message } }`. */
export type VanaConnectErrorCode =
  | "not_found"
  | "method_not_allowed"
  | "invalid_request"
  | "forbidden_origin"
  | "unauthenticated"
  | "request_not_bound"
  | "not_approved"
  | "scope_not_approved"
  | "payment_required"
  | "personal_server_error"
  | "rate_limited"
  | "internal_error";

const COOKIE_PREFIX = "vana_dcr_";
const BINDING_VERSION = 1;
const MIN_BINDING_MS = 60 * 60 * 1000;
const MAX_BINDING_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 4096;
/** HKDF `info` the default binding key is derived with. */
export const CONNECT_BINDING_KEY_PURPOSE =
  "vana-sdk/connect/request-binding/v1";

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return base64url(new Uint8Array(digest));
}

/** Cookie name binding one request to the browser. */
export function connectBindingCookieName(requestId: string): string {
  return `${COOKIE_PREFIX}${requestId}`;
}

interface BindingPayload {
  v: typeof BINDING_VERSION;
  /** Request id. */
  r: string;
  /** Expiry, ms since epoch. */
  e: number;
  /** SHA-256 of the session id, when bound to a session. */
  s?: string;
}

function errorResponse(
  status: number,
  code: VanaConnectErrorCode,
  message: string,
  headers?: Record<string, string>,
): Response {
  return json({ error: { code, message } }, status, headers);
}

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

/**
 * Create the connect handler.
 *
 * @example
 * ```typescript
 * // app/api/vana/[action]/route.ts
 * import { createVanaConnectHandler } from "@opendatalabs/vana-sdk/server";
 * // createDirectDataController({ grants: [{ source_id, streams }], ... })
 * import { vana } from "@/lib/vana";
 *
 * const handler = createVanaConnectHandler({
 *   controller: vana,
 *   returnUrl: `${process.env.APP_URL}/connect/return`,
 *   clientId: "my-app",
 * });
 * export { handler as GET, handler as POST };
 * ```
 *
 * @param options - Controller, return URL, sheet client id and hooks.
 * @returns A `(request: Request) => Promise<Response>` handler.
 * @throws {@link DirectConfigError} when `returnUrl` is not an absolute URL,
 * or the controller lacks a connect method it needs.
 */
export function createVanaConnectHandler(
  options: VanaConnectHandlerOptions,
): VanaConnectHandler {
  const missing = missingConnectCapabilities(options.controller).filter(
    (name) => !(name === "deriveSecret" && options.bindingSecret),
  );
  if (missing.length > 0) {
    throw new DirectConfigError(
      `createVanaConnectHandler needs a controller with ${missing.join(", ")} (createDirectDataController provides them)`,
      { missing },
    );
  }
  // Checked above; `deriveSecret` is only called without `bindingSecret`.
  const controller = options.controller as ConnectCapableDirectDataController;
  let returnOrigin: string;
  try {
    returnOrigin = new URL(options.returnUrl).origin;
  } catch {
    throw new DirectConfigError("returnUrl must be an absolute URL", {
      returnUrl: options.returnUrl,
    });
  }
  const allowedOrigins = new Set(options.allowedOrigins ?? [returnOrigin]);
  const now = options.now ?? Date.now;
  const cookiePath = options.cookiePath ?? "/";
  const rateLimit =
    options.rateLimit === false
      ? null
      : (options.rateLimit ?? createMemoryRateLimit({ now }));

  let macKey: Promise<CryptoKey> | null = null;
  function bindingKey(): Promise<CryptoKey> {
    macKey ??= (async () => {
      const raw = options.bindingSecret
        ? await crypto.subtle.digest(
            "SHA-256",
            encoder.encode(
              `${CONNECT_BINDING_KEY_PURPOSE}\0${options.bindingSecret}`,
            ),
          )
        : await controller.deriveSecret(CONNECT_BINDING_KEY_PURPOSE);
      return crypto.subtle.importKey(
        "raw",
        raw,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
    })();
    return macKey;
  }

  async function tag(payload: string): Promise<string> {
    const signature = await crypto.subtle.sign(
      "HMAC",
      await bindingKey(),
      encoder.encode(`vana-connect-binding.${payload}`),
    );
    return base64url(new Uint8Array(signature));
  }

  async function sessionHash(
    request: Request,
  ): Promise<string | null | undefined> {
    if (!options.session) return undefined;
    const id = await options.session(request);
    return id ? sha256(id) : null;
  }

  async function bindingCookie(
    request: Request,
    created: AccessRequest,
    session: string | undefined,
  ): Promise<string> {
    const current = now();
    const requestExpiry = created.expiresAt
      ? Date.parse(created.expiresAt)
      : Number.NaN;
    const expiresAt = Math.min(
      current + MAX_BINDING_MS,
      Math.max(
        current + MIN_BINDING_MS,
        Number.isFinite(requestExpiry) ? requestExpiry : 0,
      ),
    );
    const payload: BindingPayload = {
      v: BINDING_VERSION,
      r: created.requestId,
      e: expiresAt,
      ...(session ? { s: session } : {}),
    };
    const encoded = base64url(encoder.encode(JSON.stringify(payload)));
    const attributes = [
      `Path=${cookiePath}`,
      `Max-Age=${Math.floor((expiresAt - current) / 1000)}`,
      "HttpOnly",
      "SameSite=Lax",
      ...(new URL(request.url).protocol === "https:" ? ["Secure"] : []),
    ];
    return `${connectBindingCookieName(created.requestId)}=${encoded}.${await tag(
      encoded,
    )}; ${attributes.join("; ")}`;
  }

  /** The binding for `requestId`, or `null` when absent, forged or expired. */
  async function readBinding(
    request: Request,
    requestId: string,
    session: string | undefined,
  ): Promise<BindingPayload | null> {
    const value = readCookie(request, connectBindingCookieName(requestId));
    if (!value || value.length > 1024) return null;
    const separator = value.lastIndexOf(".");
    if (separator <= 0) return null;
    const encoded = value.slice(0, separator);
    if (!constantTimeEqual(value.slice(separator + 1), await tag(encoded))) {
      return null;
    }
    const bytes = fromBase64url(encoded);
    if (!bytes) return null;
    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return null;
    }
    const binding = payload as Partial<BindingPayload> | null;
    if (
      !binding ||
      binding.v !== BINDING_VERSION ||
      binding.r !== requestId ||
      typeof binding.e !== "number" ||
      binding.e <= now() ||
      binding.s !== session
    ) {
      return null;
    }
    return binding as BindingPayload;
  }

  function originRefused(request: Request): boolean {
    const origin = request.headers.get("origin");
    if (origin !== null && !allowedOrigins.has(origin)) return true;
    return request.headers.get("sec-fetch-site") === "cross-site";
  }

  async function readBody(
    request: Request,
  ): Promise<Record<string, unknown> | null> {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return null;
    if (text.trim() === "") return {};
    try {
      const parsed: unknown = JSON.parse(text);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  function config(): VanaConnectConfig {
    const endpoints = controller.getEndpoints();
    const env = controller.getEnv();
    return {
      protocolVersion: PROTOCOL_VERSION,
      env,
      clientId: options.clientId ?? null,
      appName: options.appName ?? controller.getAppIdentity().name,
      // The controller's own environment decides; never a production default.
      accountOrigin: endpoints.accountOrigin ?? VANA_ACCOUNT_ORIGINS[env],
    };
  }

  async function postRequest(
    request: Request,
    session: string | undefined,
  ): Promise<Response> {
    const body = await readBody(request);
    if (!body) {
      return errorResponse(
        400,
        "invalid_request",
        "Body must be a JSON object.",
      );
    }
    if (body.requestId !== undefined) {
      // Re-sign a request this browser already holds.
      const requestId = body.requestId;
      if (!isRequestId(requestId)) {
        return errorResponse(
          400,
          "invalid_request",
          "requestId is not a request id.",
        );
      }
      if (!(await readBinding(request, requestId, session))) {
        return notBound();
      }
      const endpoints = controller.getEndpoints();
      return json({
        request: {
          requestId,
          approvalUrl: buildApprovalUrl(
            endpoints.approvalAppBaseUrl,
            requestId,
          ),
          appAddress: controller.appAddress,
        },
        embed: {
          id: requestId,
          authorization: await controller.authorizeRequestRead(requestId),
        },
      });
    }

    if (rateLimit) {
      const decision = await rateLimit({
        request,
        ...(session ? { session } : {}),
      });
      if (!decision.ok) {
        return errorResponse(
          429,
          "rate_limited",
          "Too many requests. Try again later.",
          decision.retryAfterSeconds !== undefined
            ? {
                "Retry-After": String(
                  Math.max(0, Math.ceil(decision.retryAfterSeconds)),
                ),
              }
            : undefined,
        );
      }
    }
    const created = await controller.createAccessRequest({
      ...(options.createOptions ? await options.createOptions(request) : {}),
      returnUrl: options.returnUrl,
    });
    const sanitized: AccessRequest = {
      requestId: created.requestId,
      approvalUrl: created.approvalUrl,
      appAddress: created.appAddress,
      ...(created.network ? { network: created.network } : {}),
      ...(created.expiresAt ? { expiresAt: created.expiresAt } : {}),
      ...(created.mobileContinuationUrl
        ? { mobileContinuationUrl: created.mobileContinuationUrl }
        : {}),
      ...(created.scopes ? { scopes: created.scopes } : {}),
    };
    const embed = isRequestId(created.requestId)
      ? {
          id: created.requestId,
          authorization: await controller.authorizeRequestRead(
            created.requestId,
          ),
        }
      : null;
    return json({ request: sanitized, embed }, 200, {
      "Set-Cookie": await bindingCookie(request, created, session),
    });
  }

  function notBound(): Response {
    return errorResponse(
      403,
      "request_not_bound",
      "This request was not created in this browser session.",
    );
  }

  async function boundRequestId(
    request: Request,
    session: string | undefined,
  ): Promise<string | Response> {
    const values = new URL(request.url).searchParams.getAll("requestId");
    const requestId = values.length === 1 ? values[0] : undefined;
    if (!isRequestId(requestId)) {
      return errorResponse(
        400,
        "invalid_request",
        "A single requestId is required.",
      );
    }
    if (!(await readBinding(request, requestId, session))) {
      return notBound();
    }
    return requestId;
  }

  async function getStatus(
    request: Request,
    session: string | undefined,
  ): Promise<Response> {
    const requestId = await boundRequestId(request, session);
    if (requestId instanceof Response) return requestId;
    const status = await controller.getAccessRequestStatus(requestId);
    // Only what the browser flow needs: no Personal Server URL or grant id.
    return json({
      status: status.status,
      ...(status.mobileContinuationUrl
        ? { mobileContinuationUrl: status.mobileContinuationUrl }
        : {}),
    });
  }

  async function getData(
    request: Request,
    session: string | undefined,
  ): Promise<Response> {
    const requestId = await boundRequestId(request, session);
    if (requestId instanceof Response) return requestId;
    const result = options.read
      ? await options.read({ controller, requestId, request })
      : await controller.readApprovedData({ requestId });
    return json(result);
  }

  return async function handle(request: Request): Promise<Response> {
    const segments = new URL(request.url).pathname.split("/").filter(Boolean);
    const action = segments[segments.length - 1];
    const method = request.method.toUpperCase();
    const route = (expected: string) =>
      method === expected
        ? null
        : errorResponse(405, "method_not_allowed", `Use ${expected}.`, {
            Allow: expected,
          });
    try {
      if (action === "config") {
        return route("GET") ?? json(config());
      }
      if (action !== "request" && action !== "status" && action !== "data") {
        return errorResponse(404, "not_found", "Unknown connect route.");
      }
      const wrongMethod = route(action === "request" ? "POST" : "GET");
      if (wrongMethod) return wrongMethod;
      if (action === "request" && originRefused(request)) {
        return errorResponse(403, "forbidden_origin", "Origin not allowed.");
      }
      const session = await sessionHash(request);
      if (session === null) {
        return errorResponse(401, "unauthenticated", "Sign in first.");
      }
      if (action === "request") return await postRequest(request, session);
      if (action === "status") return await getStatus(request, session);
      return await getData(request, session);
    } catch (error) {
      return errorFor(error);
    }
  };
}

function errorFor(error: unknown): Response {
  if (error instanceof AccessNotApprovedError) {
    return errorResponse(409, "not_approved", error.message);
  }
  if (error instanceof ScopeNotApprovedError) {
    return errorResponse(403, "scope_not_approved", error.message);
  }
  if (error instanceof PaymentRequiredError) {
    return errorResponse(402, "payment_required", error.message);
  }
  if (error instanceof PersonalServerReadError) {
    return errorResponse(502, "personal_server_error", error.message);
  }
  if (error instanceof DirectConfigError) {
    return errorResponse(400, "invalid_request", error.message);
  }
  // Unknown failures stay opaque to the browser.
  return errorResponse(500, "internal_error", "Something went wrong.");
}

/** The parts of a Node `IncomingMessage` {@link toNodeHandler} reads. */
export interface NodeRequestLike {
  method?: string;
  url?: string;
  /** Express sets this to the URL before mount-path stripping. */
  originalUrl?: string;
  headers: Record<string, string | string[] | undefined>;
  /** A body already parsed by middleware (Express `json()`), if any. */
  body?: unknown;
  socket?: { encrypted?: boolean; remoteAddress?: string };
  [Symbol.asyncIterator](): AsyncIterator<Uint8Array | string>;
}

/** The parts of a Node `ServerResponse` {@link toNodeHandler} writes. */
export interface NodeResponseLike {
  statusCode: number;
  setHeader(name: string, value: string | string[]): unknown;
  end(chunk?: Uint8Array | string): unknown;
}

/** Options for {@link toNodeHandler}. */
export interface ToNodeHandlerOptions {
  /**
   * Public origin of the app (`https://app.example`). Defaults to the
   * request's `Host` header and `X-Forwarded-Proto` (or the socket's TLS).
   */
  origin?: string;
}

/**
 * Adapt a Fetch-API handler to Node's `(req, res)` (http, Express, Fastify's
 * raw mode).
 *
 * @param handler - A handler such as {@link createVanaConnectHandler}'s.
 * @param options - Public origin override.
 * @returns A `(req, res) => Promise<void>` listener.
 */
export function toNodeHandler(
  handler: VanaConnectHandler,
  options: ToNodeHandlerOptions = {},
): (req: NodeRequestLike, res: NodeResponseLike) => Promise<void> {
  return async (req, res) => {
    const header = (name: string): string | undefined => {
      const value = req.headers[name];
      return Array.isArray(value) ? value[0] : value;
    };
    const origin =
      options.origin ??
      `${header("x-forwarded-proto")?.split(",")[0]?.trim() ?? (req.socket?.encrypted ? "https" : "http")}://${header("host") ?? "localhost"}`;
    const url = new URL(req.originalUrl ?? req.url ?? "/", origin);
    const method = (req.method ?? "GET").toUpperCase();
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
    let body: string | undefined;
    if (method !== "GET" && method !== "HEAD") {
      if (req.body !== undefined) {
        body =
          typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      } else {
        const decoder = new TextDecoder();
        body = "";
        for await (const chunk of req) {
          body +=
            typeof chunk === "string"
              ? chunk
              : decoder.decode(chunk, { stream: true });
          if (body.length > MAX_BODY_BYTES) break;
        }
        body += decoder.decode();
      }
    }
    const request = new Request(url, { method, headers, body });
    if (req.socket?.remoteAddress) {
      nodeRemoteAddresses.set(request, req.socket.remoteAddress);
    }
    const response = await handler(request);
    res.statusCode = response.status;
    response.headers.forEach((value, name) => {
      if (name !== "set-cookie") res.setHeader(name, value);
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) res.setHeader("set-cookie", cookies);
    res.end(new Uint8Array(await response.arrayBuffer()));
  };
}
