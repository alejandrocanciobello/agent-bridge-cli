#!/usr/bin/env bash
# Smoke test: no real API keys required. Verifies status, missing-provider errors,
# and that compare/run-all degrade gracefully when CLIs are absent.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AB="$ROOT/bin/agentbridge.js"
export PATH="/tmp/agentbridge-smoke-empty-path:$PATH"

echo "== build =="
(cd "$ROOT" && npm run build >/dev/null)

echo "== help =="
node "$AB" help | head -5

echo "== version =="
node "$AB" version

echo "== status (graceful when CLIs missing from PATH) =="
# Use a PATH that still has node but not claude/hermes/codex
SMOKE_BIN="$(mktemp -d)"
ln -sf "$(command -v node)" "$SMOKE_BIN/node"
# Keep system path for node module resolution via node itself; only hide agent CLIs
HIDE_PATH="$SMOKE_BIN:$(dirname "$(command -v node)"):/usr/bin:/bin"
STATUS_OUT="$(PATH="$HIDE_PATH" node "$AB" status 2>&1 || true)"
echo "$STATUS_OUT" | head -40
echo "$STATUS_OUT" | grep -q "claude" 
echo "$STATUS_OUT" | grep -q "hermes"
echo "$STATUS_OUT" | grep -q "codex"

echo "== run missing provider =="
set +e
OUT="$(PATH="$HIDE_PATH" node "$AB" run claude "hello" 2>&1)"
CODE=$?
set -e
echo "$OUT" | head -20
test "$CODE" -ne 0
echo "$OUT" | grep -qi "not found"

echo "== compare with zero providers =="
set +e
OUT="$(PATH="$HIDE_PATH" node "$AB" compare "hello" 2>&1)"
CODE=$?
set -e
echo "$OUT" | head -20
test "$CODE" -ne 0

echo "== init-config =="
node "$AB" init-config
node "$AB" config path

echo "== smoke OK =="
