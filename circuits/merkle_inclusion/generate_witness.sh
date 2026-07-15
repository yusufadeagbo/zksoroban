#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INPUT="${1:-$HERE/input_example.json}"
OUTPUT="${2:-$HERE/build/witness.wtns}"
WASM="$HERE/build/circuit_js/circuit.wasm"
GEN="$HERE/build/circuit_js/generate_witness.js"

if [ ! -f "$WASM" ]; then
  echo "circuit.wasm not found. Compile first:" >&2
  echo "  circom circuit.circom --r1cs --wasm --sym -o build -l ../../demo/node_modules" >&2
  exit 1
fi

node "$GEN" "$WASM" "$INPUT" "$OUTPUT"
echo "witness written to $OUTPUT"
