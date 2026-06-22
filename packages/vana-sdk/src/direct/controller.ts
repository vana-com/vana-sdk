/**
 * Direct Data Controller — the server-side facade for the two-tab Data
 * Portability flow.
 *
 * @remarks
 * One controller owns an app's builder private key, source, scopes, app
 * identity, and payment flow. It exposes the three methods the builder guide
 * documents:
 *
 * - {@link DirectDataController.createAccessRequest} — start an approval request.
 * - {@link DirectDataController.getAccessRequestStatus} — poll while the Vana tab is open.
 * - {@link DirectDataController.readApprovedData} — read from the Personal Server,
 *   handling 402 Payment Required.
 *
 * **Two parts of this flow do not yet have a finalized in-SDK protocol** and are
 * therefore injectable so the controller shape stays copy-paste stable:
 *
 * - `accessRequestClient` — the app-dev service that issues `dcr_*` ids. The
 *   default implementation is **PROVISIONAL** (see {@link createDefaultAccessRequestClient}).
 * - `paymentSigner` — the x402 settlement scheme. The default is derived from
 *   `builderPrivateKey` and is also **PROVISIONAL** (see {@link createDefaultPaymentSigner}).
 *
 * The Personal Server read and the Web3Signed auth are real and built on the
 * SDK's existing primitives.
 *
 * @category Direct
 * @module direct/controller
 */

import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import type { Web3SignedSignFn } from "../auth/web3-signed-builder";
import { parseScope } from "../protocol/scopes";
import {
  createDefaultAccessRequestClient,
  type FetchLike,
} from "./access-request-client";
import { getDirectEndpoints } from "./endpoints";
import { AccessNotApprovedError, DirectConfigError } from "./errors";
import { createDefaultPaymentSigner } from "./payment-signer";
import {
  readPersonalServerData,
  type PersonalServerFetch,
} from "./personal-server-read";
import type {
  AccessRequest,
  AccessRequestClient,
  AccessRequestStatus,
  ApprovedDataResult,
  DirectAppConfig,
  DirectEnv,
  DirectServiceEndpoints,
  PaymentSigner,
} from "./types";

/** Configuration for {@link createDirectDataController}. */
export interface DirectDataControllerConfig {
  /** Target environment. Defaults to `"production"`. */
  env?: DirectEnv;
  /** The app/builder private key (`0x`-prefixed). Server-side only. */
  builderPrivateKey: string;
  /** App identity advertised during approval. */
  app: DirectAppConfig;
  /** Data source key (e.g. `"icloud_notes"`). */
  source: string;
  /** Scopes to request (e.g. `["icloud_notes.notes"]`). At least one required. */
  scopes: string[];
  /**
   * Override the resolved service endpoints (partial). Useful for pointing at a
   * non-standard deployment.
   */
  endpoints?: Partial<DirectServiceEndpoints>;
  /**
   * Injected access-request transport. **TEMPORARY** — defaults to a provisional
   * client against the documented Vana endpoints. Provide your own for a stable
   * wire contract.
   */
  accessRequestClient?: AccessRequestClient;
  /**
   * Injected payment signer for 402 challenges. Defaults to a provisional signer
   * derived from `builderPrivateKey`.
   */
  paymentSigner?: PaymentSigner;
  /** `fetch` used by the default access-request client. Defaults to `globalThis.fetch`. */
  fetchFn?: FetchLike;
  /** `fetch` used for the Personal Server read. Defaults to `globalThis.fetch`. */
  personalServerFetch?: PersonalServerFetch;
}

/**
 * Server-side controller for the direct Data Portability flow.
 *
 * @typeParam T - Shape of the data returned by {@link DirectDataController.readApprovedData}.
 */
export interface DirectDataController {
  /** The on-chain address of the app/builder derived from `builderPrivateKey`. */
  readonly appAddress: string;

  /**
   * Create an access request the user can approve.
   *
   * @param input - The post-approval return URL.
   * @returns `{ requestId, approvalUrl, appAddress }`.
   */
  createAccessRequest(input: { returnUrl: string }): Promise<AccessRequest>;

  /**
   * Fetch the current status of an access request.
   *
   * @param requestId - The `dcr_*` id from {@link DirectDataController.createAccessRequest}.
   * @returns `{ status, personalServerUrl?, grantId?, scope? }`.
   */
  getAccessRequestStatus(requestId: string): Promise<AccessRequestStatus>;

  /**
   * Read the approved data from the user's Personal Server.
   *
   * @remarks
   * Resolves the request to its grant + Personal Server, performs a Web3Signed
   * read, and transparently handles `402 Payment Required` via the configured
   * payment signer.
   *
   * @param input - The `dcr_*` request id to read.
   * @returns `{ scope, data }`.
   * @throws {@link AccessNotApprovedError} if the request is not approved.
   */
  readApprovedData<T = unknown>(input: {
    requestId: string;
  }): Promise<ApprovedDataResult<T>>;
}

function isHexPrivateKey(value: string): value is Hex {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

/**
 * Create a {@link DirectDataController}.
 *
 * @param config - Controller configuration (env, key, app identity, source, scopes).
 * @returns A ready-to-use controller.
 * @throws {@link DirectConfigError} when the key or scopes are invalid.
 */
export function createDirectDataController(
  config: DirectDataControllerConfig,
): DirectDataController {
  if (!config.builderPrivateKey || !isHexPrivateKey(config.builderPrivateKey)) {
    throw new DirectConfigError(
      "builderPrivateKey must be a 0x-prefixed 32-byte hex string",
    );
  }
  if (!config.scopes || config.scopes.length === 0) {
    throw new DirectConfigError("At least one scope is required");
  }
  // Validate scopes eagerly so misconfiguration fails at construction.
  for (const scope of config.scopes) {
    parseScope(scope);
  }

  const env: DirectEnv = config.env ?? "production";
  const endpoints: DirectServiceEndpoints = {
    ...getDirectEndpoints(env),
    ...config.endpoints,
  };

  const account = privateKeyToAccount(config.builderPrivateKey);
  const signMessage: Web3SignedSignFn = (message: string) =>
    account.signMessage({ message });

  const accessRequestClient: AccessRequestClient =
    config.accessRequestClient ??
    createDefaultAccessRequestClient({
      baseUrl: endpoints.accessRequestBaseUrl,
      approvalBaseUrl: endpoints.approvalAppBaseUrl,
      fetchFn: config.fetchFn,
    });

  const paymentSigner: PaymentSigner =
    config.paymentSigner ?? createDefaultPaymentSigner(signMessage);

  return {
    appAddress: account.address,

    async createAccessRequest(input): Promise<AccessRequest> {
      return accessRequestClient.createAccessRequest({
        appAddress: account.address,
        app: config.app,
        source: config.source,
        scopes: config.scopes,
        returnUrl: input.returnUrl,
      });
    },

    async getAccessRequestStatus(
      requestId: string,
    ): Promise<AccessRequestStatus> {
      return accessRequestClient.getAccessRequestStatus(requestId);
    },

    async readApprovedData<T = unknown>(input: {
      requestId: string;
    }): Promise<ApprovedDataResult<T>> {
      const status = await accessRequestClient.getAccessRequestStatus(
        input.requestId,
      );
      if (
        status.status !== "approved" ||
        !status.personalServerUrl ||
        !status.grantId ||
        !status.scope
      ) {
        throw new AccessNotApprovedError(
          "Request is not approved or is missing grantId/scope/personalServerUrl",
          {
            requestId: input.requestId,
            status: status.status,
            hasPersonalServerUrl: Boolean(status.personalServerUrl),
            hasGrantId: Boolean(status.grantId),
            hasScope: Boolean(status.scope),
          },
        );
      }

      const data = await readPersonalServerData({
        personalServerUrl: status.personalServerUrl,
        scope: status.scope,
        grantId: status.grantId,
        signMessage,
        paymentSigner,
        fetchFn: config.personalServerFetch,
      });

      return { scope: status.scope, data: data as T };
    },
  };
}
