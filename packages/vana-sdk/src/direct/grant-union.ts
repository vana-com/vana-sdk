/**
 * Grant-union helpers: extend an app's live grant instead of replacing it.
 *
 * @remarks
 * The gateway keeps **one** grant per (owner, app). A new approval does not
 * add a second grant next to the first: it bumps `grantVersion` and replaces
 * the grant's `scopes` with whatever the new request carried. An app that
 * already holds `oura.sleep` and now asks only for `whoop.recovery` would,
 * once the owner approves, hold `whoop.recovery` and nothing else.
 *
 * These helpers build the request scopes an app actually wants: every scope
 * the live grant still covers, plus the new ones, minus any the app is
 * explicitly giving up (`removeScopes`).
 *
 * The owner is often unknown when a request is created (the person is
 * anonymous until they approve). In that case there is no grant to read, and
 * the Vana Web approval page signs the union of the live grant and the
 * request for the owner who approves, honoring the request's
 * `removeScopes`. Use {@link mergeWithLiveGrant} directly when the app does
 * know the owner, for example from an earlier approval.
 *
 * @category Direct
 * @module direct/grant-union
 */

import type { GatewayClient, GrantListItem } from "../protocol/gateway";
import { parseScope } from "../protocol/scopes";
import { parseScopeEntry } from "../protocol/scope-actions";
import { DirectConfigError } from "./errors";

/** The slice of the gateway client the grant-union helpers read through. */
export type GrantUnionGateway = Pick<GatewayClient, "listGrantsByUser"> &
  Partial<Pick<GatewayClient, "getBuilder">>;

/** Input to {@link mergeWithLiveGrant}. */
export interface MergeWithLiveGrantInput {
  /** Gateway to read the live grant from (only public reads are used). */
  gateway: GrantUnionGateway;
  /** The data owner (grantor) whose live grant to extend. */
  owner: string;
  /**
   * The app's `granteeId` (its bytes32 builder id). Pass this or
   * `appAddress`; when only `appAddress` is given the builder id is resolved
   * with `gateway.getBuilder(appAddress)`.
   */
  granteeId?: string;
  /** The app's on-chain address, used to resolve `granteeId` when absent. */
  appAddress?: string;
  /** Scope entries the new request asks for, verbatim. */
  scopes: readonly string[];
  /**
   * Scope entries the app gives up. Matched verbatim against the live grant
   * (`write:coach.weekly` removes only the write entry; the bare
   * `coach.weekly` removes only the read). An entry may not appear in both
   * `scopes` and `removeScopes`.
   */
  removeScopes?: readonly string[];
}

/** How {@link mergeWithLiveGrant} arrived at its scopes. */
export type GrantUnionStatus =
  /** A live grant was found and merged. */
  | "merged"
  /** The owner holds no active grant for this app; nothing to keep. */
  | "no_live_grant";

/** Result of {@link mergeWithLiveGrant} and {@link unionGrantScopes}. */
export interface GrantUnion {
  /** The scope entries to send on the new request, deduplicated. */
  scopes: string[];
  /** Live grant entries carried over into `scopes`. */
  kept: string[];
  /** Requested entries the live grant did not already cover. */
  added: string[];
  /** Live grant entries dropped because they were in `removeScopes`. */
  removed: string[];
  /**
   * Live grant entries that a data connection request cannot carry (a
   * wildcard such as `chatgpt.*`, or an operation this SDK does not know),
   * so they are left out of `scopes`. The approval page's own union still
   * keeps them on the signed grant unless they are removed there.
   */
  notCarried: string[];
  /** The live grant's scope entries, verbatim (empty without a live grant). */
  liveScopes: string[];
}

/** Result of {@link mergeWithLiveGrant}. */
export interface MergeWithLiveGrantResult extends GrantUnion {
  status: GrantUnionStatus;
  /** The live grant's id, when there is one. */
  grantId?: string;
}

function dedupe(entries: readonly string[]): string[] {
  return [...new Set(entries)];
}

function isCarryable(entry: string): boolean {
  try {
    parseScope(parseScopeEntry(entry).scope);
    return true;
  } catch {
    return false;
  }
}

/**
 * Combine a live grant's scopes with a new request's scopes.
 *
 * @remarks
 * Pure: no network. Order is live entries first (in grant order), then the
 * newly requested ones, so a diff against the previous grant reads naturally.
 *
 * @param liveScopes - The live grant's scope entries (empty when none).
 * @param scopes - The scope entries the new request asks for.
 * @param removeScopes - Live entries the app gives up.
 * @returns The merged scopes plus the kept/added/removed breakdown.
 * @throws {DirectConfigError} When an entry is both requested and removed.
 */
export function unionGrantScopes(
  liveScopes: readonly string[],
  scopes: readonly string[],
  removeScopes: readonly string[] = [],
): GrantUnion {
  const remove = new Set(removeScopes);
  const conflicting = scopes.filter((entry) => remove.has(entry));
  if (conflicting.length > 0) {
    throw new DirectConfigError(
      `${conflicting.join(", ")} cannot be both requested and removed. Drop it from scopes or from removeScopes.`,
      { conflicting },
    );
  }
  const live = dedupe(liveScopes);
  const requested = dedupe(scopes);
  const liveSet = new Set(live);

  const removed = live.filter((entry) => remove.has(entry));
  const remaining = live.filter((entry) => !remove.has(entry));
  const notCarried = remaining.filter((entry) => !isCarryable(entry));
  // A requested entry the grant already held counts as kept: the app keeps
  // it, it does not newly gain it.
  const keptAll = remaining.filter(isCarryable);
  const added = requested.filter((entry) => !liveSet.has(entry));

  return {
    scopes: dedupe([...keptAll, ...added]),
    kept: keptAll,
    added,
    removed,
    notCarried,
    liveScopes: live,
  };
}

function isActiveGrant(grant: GrantListItem): boolean {
  return !grant.revokedAt && !grant.expired;
}

function sameHex(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Find the owner's active grant for one app.
 *
 * @param gateway - Gateway to read from (`GET /v1/grants?user=<owner>`).
 * @param owner - The grantor address.
 * @param granteeId - The app's bytes32 builder id.
 * @returns The active grant, or `null` when there is none.
 */
export async function findLiveGrant(
  gateway: Pick<GatewayClient, "listGrantsByUser">,
  owner: string,
  granteeId: string,
): Promise<GrantListItem | null> {
  const grants = await gateway.listGrantsByUser(owner);
  // One grant per (owner, app) on the gateway; if a stale list ever shows
  // more, the newest version wins.
  const matching = grants
    .filter(
      (grant) => sameHex(grant.granteeId, granteeId) && isActiveGrant(grant),
    )
    .sort((a, b) => {
      const av = BigInt(a.grantVersion || "0");
      const bv = BigInt(b.grantVersion || "0");
      return av === bv ? 0 : av > bv ? -1 : 1;
    });
  return matching[0] ?? null;
}

/**
 * The scope entries an owner's live grant for one app still covers.
 *
 * @param gateway - Gateway to read from (`GET /v1/grants?user=<owner>`).
 * @param owner - The grantor address.
 * @param granteeId - The app's bytes32 builder id.
 * @returns The live grant's scope entries, verbatim; empty when the owner
 * holds no active (unrevoked, unexpired) grant for the app.
 */
export async function liveGrantScopes(
  gateway: Pick<GatewayClient, "listGrantsByUser">,
  owner: string,
  granteeId: string,
): Promise<string[]> {
  const grant = await findLiveGrant(gateway, owner, granteeId);
  return grant ? [...grant.scopes] : [];
}

async function resolveGranteeId(
  input: MergeWithLiveGrantInput,
): Promise<string | null> {
  if (input.granteeId) {
    return input.granteeId;
  }
  if (!input.appAddress) {
    throw new DirectConfigError(
      "mergeWithLiveGrant needs granteeId or appAddress to find the app's grant.",
    );
  }
  if (!input.gateway.getBuilder) {
    throw new DirectConfigError(
      "mergeWithLiveGrant needs gateway.getBuilder to resolve appAddress to a granteeId. Pass granteeId instead.",
    );
  }
  const builder = await input.gateway.getBuilder(input.appAddress);
  return builder?.id ?? null;
}

/**
 * Build the scopes for a new request so it extends the owner's live grant
 * for this app rather than replacing it.
 *
 * @example
 * ```ts
 * const union = await mergeWithLiveGrant({
 *   gateway: createGatewayClient("https://dp-rpc.vana.org"),
 *   owner: "0xOwner...",
 *   appAddress: controller.appAddress,
 *   scopes: ["whoop.recovery"],
 *   removeScopes: ["oura.sleep"],
 * });
 * // union.scopes: live scopes minus oura.sleep, plus whoop.recovery
 * ```
 *
 * @param input - Gateway, owner, app identity, requested and removed scopes.
 * @returns The merged scopes, the breakdown, and whether a live grant existed.
 * @throws {DirectConfigError} When an entry is both requested and removed, or
 * the app identity cannot be resolved from the input.
 */
export async function mergeWithLiveGrant(
  input: MergeWithLiveGrantInput,
): Promise<MergeWithLiveGrantResult> {
  const removeScopes = input.removeScopes ?? [];
  // Validate the conflict before any network call.
  unionGrantScopes([], input.scopes, removeScopes);
  const granteeId = await resolveGranteeId(input);
  const grant = granteeId
    ? await findLiveGrant(input.gateway, input.owner, granteeId)
    : null;
  if (!grant) {
    return {
      status: "no_live_grant",
      ...unionGrantScopes([], input.scopes, removeScopes),
    };
  }
  return {
    status: "merged",
    grantId: grant.id,
    ...unionGrantScopes(grant.scopes, input.scopes, removeScopes),
  };
}
