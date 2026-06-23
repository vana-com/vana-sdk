/**
 * Direct Data Controller — the server-side facade for the two-tab Data
 * Portability flow.
 *
 * @remarks
 * One controller owns an app's private key, source, scopes, app identity, and
 * payment flow. It exposes the three methods the builder guide documents:
 *
 * - {@link DirectDataController.createAccessRequest} — start an approval request.
 * - {@link DirectDataController.getAccessRequestStatus} — poll while the Vana tab is open.
 * - {@link DirectDataController.readApprovedData} — read from the Personal Server,
 *   handling 402 Payment Required.
 *
 * Access requests are created through the Vana Account access-request API; the
 * Personal Server read uses Web3Signed auth; and payment uses the DPv2 escrow
 * surface (`protocol/escrow`) — when a read returns `402`, the controller signs
 * a `GenericPayment` with the app key, settles it through the escrow gateway,
 * and retries.
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
import {
  type EscrowPaymentConfig,
  type SignTypedDataFn,
} from "./escrow-payment";
import {
  readPersonalServerData,
  type PersonalServerFetch,
} from "./personal-server-read";
import type {
  AccessRequest,
  AccessRequestClient,
  AccessRequestStatus,
  ApprovedDataResult,
  AppIdentity,
  DirectAppConfig,
  DirectEnv,
  DirectServiceEndpoints,
} from "./types";

/** Configuration for {@link createDirectDataController}. */
export interface DirectDataControllerConfig {
  /** Target environment. Defaults to `"production"`. */
  env?: DirectEnv;
  /**
   * The app private key (`0x`-prefixed, 32 bytes). Server-side only — this key
   * is the app's on-chain identity and is never exposed to the browser.
   */
  appPrivateKey?: string;
  /**
   * @deprecated Use {@link DirectDataControllerConfig.appPrivateKey}. Accepted as
   * a backwards-compatible alias; if both are set, `appPrivateKey` wins.
   */
  builderPrivateKey?: string;
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
   * Client for the Vana Account access-request API. Defaults to a client against
   * the resolved Vana Account endpoints; inject your own to point at a custom
   * deployment or to supply a test double.
   */
  accessRequestClient?: AccessRequestClient;
  /**
   * Escrow settlement config used when a Personal Server read returns `402`.
   *
   * @remarks
   * Wires the DPv2 escrow gateway (`protocol/escrow`). The controller supplies
   * the EIP-712 `signTypedData` from the app key automatically, so you provide
   * the gateway `client`, the `escrowContract` address, and (optionally) the
   * `chainId` and a durable `nonceSource`. If omitted, a `402` from the Personal
   * Server throws {@link PaymentRequiredError} carrying the amount/asset owed.
   */
  escrow?: DirectEscrowConfig;
  /** `fetch` used by the default access-request client. Defaults to `globalThis.fetch`. */
  fetchFn?: FetchLike;
  /** `fetch` used for the Personal Server read. Defaults to `globalThis.fetch`. */
  personalServerFetch?: PersonalServerFetch;
}

/**
 * Controller-level escrow config — the {@link EscrowPaymentConfig} minus the
 * `signTypedData` and `chainId` the controller injects itself.
 */
export interface DirectEscrowConfig extends Omit<
  EscrowPaymentConfig,
  "signTypedData" | "chainId"
> {
  /**
   * Chain id for the EIP-712 domain. Defaults to the controller's environment
   * (1480 for production, 14800 for dev).
   */
  chainId?: number;
}

/**
 * Server-side controller for the direct Data Portability flow.
 *
 * @typeParam T - Shape of the data returned by {@link DirectDataController.readApprovedData}.
 */
export interface DirectDataController {
  /** The on-chain address of the app, derived from `appPrivateKey`. */
  readonly appAddress: string;

  /**
   * The app's on-chain address — the address to fund and inspect in the Builder
   * activity report. Equivalent to {@link DirectDataController.appAddress}.
   *
   * @returns The app's `0x`-prefixed address.
   */
  getAppAddress(): string;

  /**
   * The app's full identity: its configured id/name/homepage plus the derived
   * on-chain address. Useful for telling builders which app address to fund or
   * look up.
   *
   * @returns `{ id, name, homepageUrl, address }`.
   */
  getAppIdentity(): AppIdentity;

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
   * Resolves the request to its grant + Personal Server and performs a Web3Signed
   * read. Hides the `402 Payment Required` flow by default: if a read needs
   * payment and `escrow` is configured, it settles the grant via the escrow
   * gateway and retries, attaching a {@link DirectPaymentReceipt} under
   * `payment` so callers can inspect amount/asset/fee breakdown. If `escrow` is
   * not configured, it throws {@link PaymentRequiredError} carrying the
   * amount/asset owed.
   *
   * @param input - The `dcr_*` request id to read.
   * @returns `{ scope, data, payment? }`.
   * @throws {@link AccessNotApprovedError} if the request is not approved.
   * @throws {@link PaymentRequiredError} if payment is required but unsettled.
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
  // `appPrivateKey` is the documented field; `builderPrivateKey` is a
  // deprecated alias kept for backwards compatibility.
  const privateKey = config.appPrivateKey ?? config.builderPrivateKey;
  if (!privateKey || !isHexPrivateKey(privateKey)) {
    throw new DirectConfigError(
      "appPrivateKey must be a 0x-prefixed 32-byte hex string",
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

  const account = privateKeyToAccount(privateKey as Hex);
  const signMessage: Web3SignedSignFn = (message: string) =>
    account.signMessage({ message });
  // viem's account.signTypedData satisfies the structural SignTypedDataFn used
  // by the escrow GenericPayment signer.
  const signTypedData = account.signTypedData as unknown as SignTypedDataFn;
  const chainId = endpoints.chainId;

  const accessRequestClient: AccessRequestClient =
    config.accessRequestClient ??
    createDefaultAccessRequestClient({
      baseUrl: endpoints.accessRequestBaseUrl,
      approvalBaseUrl: endpoints.approvalAppBaseUrl,
      fetchFn: config.fetchFn,
      appAddress: account.address,
      signMessage,
    });

  const escrow: EscrowPaymentConfig | undefined = config.escrow
    ? {
        client: config.escrow.client,
        escrowContract: config.escrow.escrowContract,
        chainId: config.escrow.chainId ?? chainId,
        nonceSource: config.escrow.nonceSource,
        signTypedData,
      }
    : undefined;

  return {
    appAddress: account.address,

    getAppAddress(): string {
      return account.address;
    },

    getAppIdentity(): AppIdentity {
      return {
        id: config.app.id,
        name: config.app.name,
        homepageUrl: config.app.homepageUrl,
        address: account.address,
      };
    },

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

      const result = await readPersonalServerData({
        personalServerUrl: status.personalServerUrl,
        scope: status.scope,
        grantId: status.grantId,
        payerAddress: account.address,
        signMessage,
        escrow,
        fetchFn: config.personalServerFetch,
      });

      return {
        scope: status.scope,
        data: result.data as T,
        payment: result.payment,
      };
    },
  };
}
