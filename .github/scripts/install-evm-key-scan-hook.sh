#!/usr/bin/env bash
# Explicit setup for Husky; `run` never fetches or installs during a push.
set -euo pipefail

readonly CENTRAL_REPOSITORY='https://github.com/vana-com/.github.git'
readonly CENTRAL_POLICY_SHA='5f1b4b1019af6e3a528dd36d471f94be7dd83632'

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

validate_policy() {
  [[ ! -L "$policy_dir" ]] || {
    printf 'Refusing symlinked policy cache: %s\n' "$policy_dir" >&2
    exit 2
  }
  [[ -d "$policy_dir/.git" ]] || return 1
  origin=$(git -C "$policy_dir" remote get-url origin) || {
    printf 'Refusing unreadable policy cache: %s\n' "$policy_dir" >&2
    exit 2
  }
  case "$origin" in
    "$CENTRAL_REPOSITORY"|git@github.com:vana-com/.github.git) ;;
    *)
      printf 'Refusing unexpected policy-cache origin: %s\n' "$policy_dir" >&2
      exit 2
      ;;
  esac
  [[ "$(git -C "$policy_dir" rev-parse HEAD)" == "$CENTRAL_POLICY_SHA" ]] || {
    printf 'Refusing stale policy cache: %s\n' "$policy_dir" >&2
    exit 2
  }
  [[ -z "$(git -C "$policy_dir" status --porcelain --untracked-files=all -- ':!/.tools')" ]] || {
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
  if validate_policy; then
    rmdir "$lock_dir"
    trap - EXIT
    return
  fi
  [[ ! -e "$policy_dir" ]] || {
    printf 'Refusing invalid policy cache: %s\n' "$policy_dir" >&2
    exit 2
  }

  tmp_dir=$(mktemp -d "$cache_root/.policy.XXXXXX")
  git init -q "$tmp_dir"
  git -C "$tmp_dir" remote add origin "$CENTRAL_REPOSITORY"
  git -C "$tmp_dir" fetch --depth 1 origin "$CENTRAL_POLICY_SHA"
  git -C "$tmp_dir" checkout -q --detach FETCH_HEAD
  [[ "$(git -C "$tmp_dir" rev-parse HEAD)" == "$CENTRAL_POLICY_SHA" ]] || {
    printf 'Fetched policy does not match requested SHA.\n' >&2
    exit 2
  }
  mv "$tmp_dir" "$policy_dir"
  tmp_dir=''
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
exec "$policy_dir/scripts/install-pre-push.sh" "$action" \
  --shared-dir "$policy_dir" \
  --repo "$repo_root" \
  --ref "$CENTRAL_POLICY_SHA" "$@"
