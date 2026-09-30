#!/usr/bin/env bash
set -euo pipefail

# Benchmark script for Testnet proof verification.
# Submits N proofs via the SDK's verifyOnChain, collects fee/latency per call,
# and outputs a CSV file plus a summary table (min, median, p95, max).
#
# Usage:
#   ./scripts/bench-verify.sh [N]
#
#   N defaults to 20. Requires SOROBAN_SECRET_KEY and
#   SOROBAN_VERIFIER_CONTRACT_ID env vars (a funded Testnet account and a
#   deployed contracts/verifier).

N="${1:-20}"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SDK_DIR="$ROOT_DIR/sdk"
SCRIPT="$ROOT_DIR/scripts/bench-verify.mjs"
OUTPUT_CSV="$ROOT_DIR/bench-results.csv"

SECRET_KEY="${SOROBAN_SECRET_KEY:-}"
CONTRACT_ID="${SOROBAN_VERIFIER_CONTRACT_ID:-}"

if [ -z "$SECRET_KEY" ]; then
  echo "SOROBAN_SECRET_KEY is required" >&2
  exit 1
fi

if [ -z "$CONTRACT_ID" ]; then
  echo "SOROBAN_VERIFIER_CONTRACT_ID is required" >&2
  exit 1
fi

if [ ! -d "$SDK_DIR/dist" ]; then
  echo "SDK not built — running npm run build in $SDK_DIR"
  (cd "$SDK_DIR" && npm run build)
fi

export BENCH_N="$N"
export BENCH_OUTPUT_CSV="$OUTPUT_CSV"

echo "Running $N proof verifications against Testnet contract $CONTRACT_ID"
echo ""

node "$SCRIPT"

echo ""
echo "Done. CSV: $OUTPUT_CSV"