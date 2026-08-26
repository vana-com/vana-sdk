import { scopeMatchesPattern } from "./scopes";

/**
 * Grant scope-entry grammar.
 *
 * A signed grant carries `scopes: string[]`. Each entry is
 * `[operation:]scope` - an optional lowercase ASCII operation prefix before
 * the first `:`, then a scope pattern (`*`, `{prefix}.*`, or an exact scope).
 * A missing prefix means read. `write:notes.entries` authorizes writing
 * `notes.entries` and nothing else; `notes.entries` authorizes reading it.
 *
 * The string form is the wire and storage detail: it is what the grantor
 * signs (EIP-712 `GrantRegistration.scopes`) and what the gateway stores
 * verbatim. The Personal Server is the sole interpreter, and this module is
 * the SDK-side mirror of that interpretation. Builders and consent UIs should
 * work with the grouped `{ scope, actions }` view (see
 * {@link grantPermissions}) and never construct or parse the strings by hand.
 *
 * Matching rules, pinned by the Personal Server policy
 * (personal-server-ts `packages/core/src/policy/data-write.ts` and
 * `data-read.ts`):
 * - the operation is compared exactly, case-sensitively;
 * - wildcards apply to the scope part only, via {@link scopeMatchesPattern};
 * - an entry whose operation is not recognised never authorizes anything.
 *   The parser fails closed on it (throws) rather than treating it as read;
 *   the matcher ({@link hasAction}) skips it, which is how the Personal
 *   Server treats an entry it does not understand.
 */

/** Operations the grammar defines today, in canonical (output) order. */
export const SCOPE_ACTIONS = ["read", "write"] as const;

/** An operation a grant entry can authorize over a scope. */
export type ScopeAction = (typeof SCOPE_ACTIONS)[number];

/** One grant entry, split into its operation and scope pattern. */
export interface ParsedScopeEntry {
  scope: string;
  action: ScopeAction;
}

/**
 * The grouped view of a grant's scope entries: one row per scope pattern
 * with every operation the grant authorizes over it.
 */
export interface GrantPermission {
  scope: string;
  actions: ScopeAction[];
}

/**
 * Thrown when a scope entry does not fit the grammar - an unknown or
 * malformed operation prefix, or an empty scope part.
 */
export class InvalidScopeEntryError extends Error {
  readonly entry: string;

  constructor(entry: string, reason: string) {
    super(`Invalid scope entry ${JSON.stringify(entry)}: ${reason}`);
    this.name = "InvalidScopeEntryError";
    this.entry = entry;
  }
}

const OPERATION_SEPARATOR = ":";

// The only operation that is ever written out. Read has no prefix, and
// `read:` is NOT an alias for it: the Personal Server's read policy matches
// entries verbatim, so a `read:x` entry would authorize nothing there, and
// the parser must reject it for the same reason.
const OPERATION_BY_PREFIX: Readonly<Record<string, ScopeAction>> = {
  write: "write",
};

function assertScopePart(entry: string, scope: string): void {
  if (scope.length === 0) {
    throw new InvalidScopeEntryError(entry, "scope part is empty");
  }
  if (scope.includes(OPERATION_SEPARATOR)) {
    throw new InvalidScopeEntryError(
      entry,
      `scope part must not contain "${OPERATION_SEPARATOR}"`,
    );
  }
}

/**
 * Split one grant scope entry into its operation and scope pattern.
 *
 * - `notes.entries` parses as `{ scope: "notes.entries", action: "read" }`
 * - `write:notes.*` parses as `{ scope: "notes.*", action: "write" }`
 *
 * Fails closed: a non-string entry, or an entry whose operation prefix is
 * not recognised (including
 * `read:`, any uppercase or non-ASCII prefix, or a wildcard in the operation
 * position) throws {@link InvalidScopeEntryError} and is never treated as a
 * read entry. An empty scope part (`write:`) throws as well.
 *
 * @param entry - A single element of a grant's `scopes` array.
 * @returns The operation and the scope pattern it applies to.
 * @throws InvalidScopeEntryError when the entry does not fit the grammar.
 */
export function parseScopeEntry(entry: string): ParsedScopeEntry {
  // Grant bodies arrive from the network; a non-string element is a grammar
  // violation like any other, not a TypeError from indexOf.
  const raw: unknown = entry;
  if (typeof raw !== "string") {
    throw new InvalidScopeEntryError(String(raw), "entry must be a string");
  }
  const separatorIndex = entry.indexOf(OPERATION_SEPARATOR);
  if (separatorIndex === -1) {
    assertScopePart(entry, entry);
    return { scope: entry, action: "read" };
  }

  const prefix = entry.slice(0, separatorIndex);
  const scope = entry.slice(separatorIndex + 1);
  const action = Object.hasOwn(OPERATION_BY_PREFIX, prefix)
    ? OPERATION_BY_PREFIX[prefix]
    : undefined;
  if (action === undefined) {
    throw new InvalidScopeEntryError(
      entry,
      `unknown operation "${prefix}" (known: ${Object.keys(OPERATION_BY_PREFIX).join(", ")}; read has no prefix)`,
    );
  }
  assertScopePart(entry, scope);
  return { scope, action };
}

/**
 * Inverse of {@link parseScopeEntry}: render one operation over one scope
 * pattern as a grant scope entry. Read has no prefix.
 *
 * @param parsed - The operation and scope pattern to encode.
 * @returns The wire-form entry, e.g. `write:notes.entries` or `notes.entries`.
 * @throws InvalidScopeEntryError when the action is unknown or the scope part
 * is empty or contains `:`.
 */
export function formatScopeEntry(parsed: ParsedScopeEntry): string {
  const { scope, action } = parsed;
  assertScopePart(scope, scope);
  if (action === "read") return scope;
  // Looked up rather than hard-coded so an action can never be emitted
  // without a prefix the parser accepts (and JS callers passing an unknown
  // action fail closed instead of producing a read entry).
  const prefix = Object.entries(OPERATION_BY_PREFIX).find(
    ([, candidate]) => candidate === action,
  )?.[0];
  if (prefix === undefined) {
    throw new InvalidScopeEntryError(
      scope,
      `unknown action ${JSON.stringify(action)} (known: ${SCOPE_ACTIONS.join(", ")})`,
    );
  }
  return `${prefix}${OPERATION_SEPARATOR}${scope}`;
}

function compareScopes(a: string, b: string): number {
  // Plain code-unit order: locale-independent, so the grouping is identical
  // on every runtime.
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function sortActions(actions: Iterable<ScopeAction>): ScopeAction[] {
  const present = new Set(actions);
  return SCOPE_ACTIONS.filter((action) => present.has(action));
}

/**
 * Group a grant's scope entries into one `{ scope, actions }` row per scope
 * pattern - the view builders and consent UIs should render instead of the
 * raw strings.
 *
 * The result is canonical: rows are ordered by scope (code-unit order),
 * actions within a row follow {@link SCOPE_ACTIONS} order, and neither rows
 * nor actions repeat, whatever order or duplication the input had.
 *
 * Fails closed: if any entry does not fit the grammar this throws
 * {@link InvalidScopeEntryError} rather than silently dropping it, so a grant
 * carrying an operation this SDK does not know is never shown as narrower
 * than it is.
 *
 * @param scopes - A grant's `scopes` array, verbatim.
 * @returns The grouped, canonically ordered permissions.
 * @throws InvalidScopeEntryError when any entry does not fit the grammar.
 */
export function grantPermissions(scopes: readonly string[]): GrantPermission[] {
  const byScope = new Map<string, Set<ScopeAction>>();
  for (const entry of scopes) {
    const { scope, action } = parseScopeEntry(entry);
    let actions = byScope.get(scope);
    if (actions === undefined) {
      actions = new Set<ScopeAction>();
      byScope.set(scope, actions);
    }
    actions.add(action);
  }
  return [...byScope.keys()].sort(compareScopes).map((scope) => ({
    scope,
    actions: sortActions(byScope.get(scope) ?? []),
  }));
}

/**
 * Inverse of {@link grantPermissions}: flatten grouped permissions back into
 * the `string[]` form a grant is signed with.
 *
 * Output is canonical (scopes in code-unit order, read before write, no
 * duplicates), so `permissionsToScopes(grantPermissions(scopes))` is the
 * canonical form of `scopes`, and `grantPermissions(permissionsToScopes(p))`
 * is the canonical form of `p`. Rows with no actions contribute nothing; a
 * row with an action the grammar does not define throws rather than being
 * dropped.
 *
 * @param permissions - Grouped permissions, in any order, possibly repeating
 * a scope.
 * @returns The scope entries, one per (scope, action) pair.
 * @throws InvalidScopeEntryError when a scope or action does not fit the
 * grammar.
 */
export function permissionsToScopes(
  permissions: readonly GrantPermission[],
): string[] {
  const byScope = new Map<string, Set<ScopeAction>>();
  for (const { scope, actions } of permissions) {
    let merged = byScope.get(scope);
    if (merged === undefined) {
      merged = new Set<ScopeAction>();
      byScope.set(scope, merged);
    }
    for (const action of actions) {
      if (!(SCOPE_ACTIONS as readonly string[]).includes(action)) {
        throw new InvalidScopeEntryError(
          scope,
          `unknown action ${JSON.stringify(action)} (known: ${SCOPE_ACTIONS.join(", ")})`,
        );
      }
      merged.add(action);
    }
  }
  const entries: string[] = [];
  for (const scope of [...byScope.keys()].sort(compareScopes)) {
    for (const action of sortActions(byScope.get(scope) ?? [])) {
      entries.push(formatScopeEntry({ scope, action }));
    }
  }
  return entries;
}

/**
 * Does this grant authorize `action` over `scope`?
 *
 * The scope part is matched with the SDK's scope wildcard matcher
 * ({@link scopeMatchesPattern}: `*`, `{prefix}.*`, or exact), the action
 * exactly. Entries that do not fit the grammar are skipped - they authorize
 * nothing, which is exactly how the Personal Server treats them - so a grant
 * that carries an operation this SDK does not know still answers correctly
 * for the operations it does.
 *
 * @param scopes - A grant's `scopes` array, verbatim.
 * @param scope - The concrete scope being requested. Never prefixed: a value
 * containing `:` is not a scope id and yields `false`.
 * @param action - The operation being requested.
 * @returns `true` if some entry grants `action` over a pattern covering
 * `scope`.
 */
export function hasAction(
  scopes: readonly string[],
  scope: string,
  action: ScopeAction,
): boolean {
  // A requested scope is a concrete scope id and never carries a prefix; the
  // Personal Server rejects anything else with ScopeSchema before it ever
  // reaches its matcher, so answer the same way here instead of letting
  // `write:x` fall through to a `*` entry.
  if (scope.includes(OPERATION_SEPARATOR)) return false;
  for (const entry of scopes) {
    let parsed: ParsedScopeEntry;
    try {
      parsed = parseScopeEntry(entry);
    } catch (error) {
      if (error instanceof InvalidScopeEntryError) continue;
      throw error;
    }
    if (parsed.action === action && scopeMatchesPattern(scope, parsed.scope)) {
      return true;
    }
  }
  return false;
}

/**
 * {@link grantPermissions} for a grant record read back from the gateway:
 * returns `undefined` instead of throwing when the scope list carries an
 * entry this SDK version cannot interpret, so a grant with a newer operation
 * still loads (with `scopes` intact) rather than failing the whole read.
 *
 * @param scopes - A grant's `scopes` array, verbatim.
 * @returns The grouped permissions, or `undefined` if any entry is
 * uninterpretable.
 */
export function tryGrantPermissions(
  scopes: readonly string[],
): GrantPermission[] | undefined {
  try {
    return grantPermissions(scopes);
  } catch (error) {
    if (error instanceof InvalidScopeEntryError) return undefined;
    throw error;
  }
}
