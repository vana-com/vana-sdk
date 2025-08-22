#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.."; pwd)"   # packages/vana-sdk

# 1) build your sdk (unbundled)
npm --prefix "$ROOT" run build

# 2) pack the exact artifact users get
pushd "$ROOT" >/dev/null
PKG_TGZ="$(npm pack --silent | tail -1)"
popd >/dev/null

# 3) temp consumer app
TMP="$(mktemp -d)"
pushd "$TMP" >/dev/null
npm init -y >/dev/null
npm i "esbuild" "${ROOT}/${PKG_TGZ}" >/dev/null

# 4) import the codepath that triggers eccrypto-js
#    adjust this import if your eccrypto path differs
cat > entry.mjs <<'EOF'
import '@opendatalabs/vana-sdk/platform/browser';
EOF

# 5) try to bundle (browser platform, no externals)
set +e
npx esbuild entry.mjs --bundle --platform=browser --format=esm --outfile=out.js >/dev/null 2> err.log
STATUS=$?
set -e

if [[ "${EXPECT_FAIL:-1}" == "1" ]]; then
  # BEFORE fixing elliptic: we EXPECT failure
  if [[ $STATUS -ne 0 ]]; then
    echo "✅ Expected failure reproduced. Error (truncated):"
    tail -n 20 err.log
    EXIT=0
  else
    echo "❌ Unexpected success (elliptic not caught)"; EXIT=1
  fi
else
  # AFTER fixing elliptic: we EXPECT success
  if [[ $STATUS -eq 0 ]]; then
    echo "✅ Smoke build succeeded"
    EXIT=0
  else
    echo "❌ Build failed (after fix). Error:"; cat err.log; EXIT=1
  fi
fi

# cleanup
popd >/dev/null
rm -rf "$TMP" "${ROOT}/${PKG_TGZ}"
exit $EXIT