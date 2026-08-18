#!/usr/bin/env bash
# Explicit setup for Husky; `run` never fetches or installs during a push.
set -euo pipefail

readonly CENTRAL_REPOSITORY='https://github.com/vana-com/.github.git'
readonly CENTRAL_POLICY_SHA='99904520ef5b18f1fceb0331b4d0b0fb182d0b62'

action=${1:-prepare}
case "$action" in
  prepare|run) shift || true ;;
  *)
    printf 'Usage: %s [prepare|run]\n' "${0##*/}" >&2
    exit 2
    ;;
esac

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  printf 'Run this from a Git work tree.\n' >&2
  exit 2
}
[[ "$CENTRAL_POLICY_SHA" =~ ^[0-9a-f]{40}$ ]] || {
  printf 'This bootstrap needs a reviewed 40-character central policy SHA before use.\n' >&2
  exit 2
}

cache_root="${XDG_DATA_HOME:-$HOME/.local/share}/vana-secret-scan/policy"
policy_dir="$cache_root/$CENTRAL_POLICY_SHA"
lock_dir="$cache_root/.${CENTRAL_POLICY_SHA}.lock"

# Git exports GIT_DIR (and friends) into hook processes. In a linked worktree
# that value is an ABSOLUTE path, so a plain `git -C "$policy_dir" ...` still
# resolves against the pushing repository and reports ITS remote, HEAD and
# status instead of the policy cache's — validate_policy then rejects a
# perfectly good cache with "unexpected policy-cache origin". (In a normal
# checkout GIT_DIR is the relative ".git", which happens to resolve correctly
# under -C, which is why this only bites worktrees.) Scrub the inherited
# repository environment for every command that must target the cache.
#
# The scrub list comes from git itself rather than a hardcoded set: it covers
# the directory variables plus GIT_CONFIG_PARAMETERS / GIT_CONFIG_COUNT (which
# `git -c foo=bar push` exports into hooks) and the repository-local variables
# GIT_SHALLOW_FILE / GIT_GRAFT_FILE / GIT_REPLACE_REF_BASE /
# GIT_IMPLICIT_WORK_TREE. The GIT_CONFIG_* FILE overrides are not in that list,
# so they are added explicitly — without GIT_CONFIG_GLOBAL a caller can point
# `remote.origin.url` at vana-com/.github from its own environment and satisfy
# the origin check below against a cache whose real origin is something else.
# A hardcoded fallback covers a git too old to answer.
policy_git() {
  local scrub=()
  local v
  while IFS= read -r v; do
    [[ -n "$v" ]] && scrub+=(-u "$v")
  done < <(git rev-parse --local-env-vars 2>/dev/null || printf '%s\n' \
    GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY \
    GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_COMMON_DIR \
    GIT_CONFIG GIT_CONFIG_PARAMETERS GIT_CONFIG_COUNT)
  for v in GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM GIT_CONFIG_NOSYSTEM; do
    scrub+=(-u "$v")
  done
  env "${scrub[@]}" git "$@"
}

validate_policy() {
  [[ ! -L "$policy_dir" ]] || {
    printf 'Refusing symlinked policy cache: %s\n' "$policy_dir" >&2
    exit 2
  }
  [[ -d "$policy_dir/.git" ]] || return 1
  origin=$(policy_git -C "$policy_dir" remote get-url origin) || {
    printf 'Refusing unreadable policy cache: %s\n' "$policy_dir" >&2
    exit 2
  }
  case "$origin" in
    "$CENTRAL_REPOSITORY"|https://github.com/vana-com/.github|git@github.com:vana-com/.github|git@github.com:vana-com/.github.git) ;;
    *)
      printf 'Refusing unexpected policy-cache origin: %s\n' "$policy_dir" >&2
      exit 2
      ;;
  esac
  [[ "$(policy_git -C "$policy_dir" rev-parse HEAD)" == "$CENTRAL_POLICY_SHA" ]] || {
    printf 'Refusing stale policy cache: %s\n' "$policy_dir" >&2
    exit 2
  }
  [[ -z "$(policy_git -C "$policy_dir" status --porcelain --untracked-files=all -- ':!/.tools')" ]] || {
    printf 'Refusing modified policy cache: %s\n' "$policy_dir" >&2
    exit 2
  }
}

prepare_policy() {
  mkdir -p "$cache_root"
  mkdir "$lock_dir" 2>/dev/null || {
    printf 'Policy setup is already running; try again: %s\n' "$lock_dir" >&2
    exit 75
  }
  tmp_dir=''
  cleanup() {
    [[ -z "$tmp_dir" ]] || rm -rf "$tmp_dir"
    rmdir "$lock_dir" 2>/dev/null || true
  }
  trap cleanup EXIT
  if ! validate_policy; then
    [[ ! -e "$policy_dir" ]] || {
      printf 'Refusing invalid policy cache: %s\n' "$policy_dir" >&2
      exit 2
    }

    tmp_dir=$(mktemp -d "$cache_root/.policy.XXXXXX")
    policy_git init -q "$tmp_dir"
    policy_git -C "$tmp_dir" remote add origin "$CENTRAL_REPOSITORY"
    policy_git -C "$tmp_dir" fetch --depth 1 origin "$CENTRAL_POLICY_SHA"
    policy_git -C "$tmp_dir" checkout -q --detach FETCH_HEAD
    [[ "$(policy_git -C "$tmp_dir" rev-parse HEAD)" == "$CENTRAL_POLICY_SHA" ]] || {
      printf 'Fetched policy does not match requested SHA.\n' >&2
      exit 2
    }
    mv "$tmp_dir" "$policy_dir"
    tmp_dir=''
  fi
  "$policy_dir/scripts/install-pre-push.sh" prepare \
    --shared-dir "$policy_dir" \
    --repo "$repo_root" \
    --ref "$CENTRAL_POLICY_SHA"
  rmdir "$lock_dir"
  trap - EXIT
}

if [[ "$action" == run ]]; then
  validate_policy || {
    printf 'Policy is not prepared; run %s prepare before pushing.\n' "${0##*/}" >&2
    exit 2
  }
  [[ -x "$policy_dir/hooks/pre-push" ]] || {
    printf 'Prepared policy has no runnable pre-push hook: %s\n' "$policy_dir" >&2
    exit 2
  }
  exec env \
    VANA_SECRET_SCAN_HOME="$policy_dir" \
    VANA_SECRET_SCAN_EXPECTED_SHA="$CENTRAL_POLICY_SHA" \
    "$policy_dir/hooks/pre-push" "$@"
fi

prepare_policy
