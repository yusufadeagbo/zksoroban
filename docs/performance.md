# SDK Performance Notes

## Contract verification cost (`contracts/verifier`)

Issue #65 asked for `verify_proof`'s point-decoding path (`read_g1`/`read_g2`
in `contracts/verifier/src/lib.rs`) to be profiled and optimized for
instruction count, with a target of at least a 5% reduction. The
methodology and full result are below — the short version: the fix is
real and correct, but decoding turned out to be under 1% of the call's
total cost, so 5% isn't reachable without changing the pairing/crypto
math itself, which was explicitly out of scope.

### Methodology

Measured against `contracts/verifier`'s own known-good fixture — the
`poseidon_preimage` verifying key and a valid proof for it, both from
`contracts/verifier/src/tests.rs` (`poseidon_vk`, `VALID_PROOF_A/B/C`,
`VALID_PUBLIC_INPUT`) — on a local Stellar network (`stellar container
start local`), not Testnet, so the numbers are reproducible and don't
depend on network conditions or an existing deployment.

This stellar-cli version's `contract invoke --cost` prints a fee-estimate
table (inclusion/resource/refundable fees), not the raw instruction count
directly. To get the exact number, build the unsigned invocation with
`--build-only` and read `resources.instructions` off the
`simulateTransaction` RPC response's `transactionData` directly:

```bash
stellar container start local
stellar keys generate --network local --fund perf-test

stellar contract deploy --wasm target/wasm32v1-none/release/zksoroban_verifier.wasm \
  --source perf-test --network local \
  -- --admin perf-test --max_calls 1000000 --window_size 100 --vk-file-path vk.json

stellar contract invoke --id <contract-id> --source perf-test --network local --build-only \
  -- verify_proof --caller perf-test \
  --proof_a <hex> --proof_b <hex> --proof_c <hex> \
  --public_inputs-file-path public_inputs.json > tx.xdr

curl -s http://localhost:8000/rpc -X POST -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"simulateTransaction\",\"params\":{\"transaction\":\"$(cat tx.xdr)\"}}" \
  | jq -r .result.transactionData > txdata.xdr

stellar xdr decode --type SorobanTransactionData --input single-base64 --output json < txdata.xdr
# → {"resources":{"instructions": <the number>, ...}}
```

`public_inputs.json` is the circuit's real public signal
(`VALID_PUBLIC_INPUT`) plus a far-future `expiry_ledger` encoded per
`docs/proof-format.md`, so the call takes the full pairing-check path
rather than short-circuiting on an expired or malformed input.

### Baseline vs. optimized

| | Instructions | Δ |
|---|---|---|
| Baseline (`main`) | 27,681,711 | — |
| Optimized (this PR) | 27,661,830 | −19,881 (−0.072%) |

### Where the instructions actually go

`contracts/verifier`'s own test suite can report a finer-grained,
per-host-function breakdown via `soroban-sdk`'s `testutils` budget
tracker (`env.cost_estimate().budget()`), run natively rather than under
wasm — the relative proportions below are what matters, not the absolute
numbers, which the SDK's own docs note run lower for native Rust than for
the real wasm target:

| Cost type | Instructions | Share |
|---|---|---|
| `Bn254Pairing` (the pairing check itself) | 17,528,691 | ~68% |
| `Bn254G2CheckPointInSubgroup` | 6,824,208 | ~26% |
| `Bn254G1Mul` (`vk_ic1 * public_input`) | 1,150,435 | ~4.5% |
| Everything else (decoding, storage, events, hashing, `Bn254G1Add`, `Bn254DecodeFp`, …) | ~264,000 | ~1% |

`Bn254G2CheckPointInSubgroup` runs once per G2 point handed to
`pairing_check` — here, `proof_b`, `vk_beta`, `vk_gamma`, and `vk_delta`,
four points, even though `vk_beta`/`vk_gamma`/`vk_delta` are the same
bytes on every single call (they only change on `update_vk`). The
Soroban host has no way to know that from inside one `pairing_check`
call, so it re-validates all four every time. That's the real
instruction sink, not the byte-decoding step this issue targeted, and
recovering it would mean restructuring the verification equation itself
(e.g., precomputing `e(vk_alpha, vk_beta)` once and storing it, dropping
the check to a 3-pair pairing and 3 subgroup checks instead of 4) — a
change to the verification algorithm and to what `VerifyingKey` stores,
not to how bytes are decoded, and out of this issue's stated scope
("optimise point decoding... [not] changing the byte encoding format").

### The optimization that was made

`read_g1`/`read_g2` converted their `Bytes` argument to `BytesN<64>`/
`BytesN<128>` by first asserting `bytes.len() == N` and then calling
`BytesN::try_from_val`, whose own `TryFrom<Bytes>` impl re-checks
`bin.len() == N` a second time — the same length validated twice for the
same bytes, once explicitly and once inside the conversion it fed into.
Both call paths route through the same `Bn254G1Affine::from_bytes`/
`Bn254G2Affine::from_bytes`, which are zero-cost wraps (verified in
`soroban-sdk`'s source — no validation happens there; it's deferred to
`pairing_check`), so the double length check was pure overhead. The fix
converts via a single `bytes.try_into()` (`TryFrom<&Bytes> for
BytesN<N>`), preserving the exact same panic behavior and message for a
wrong-length input (`verify_proof_panics_on_wrong_proof_a_length` still
passes) while performing the length check once instead of twice, three
times per `verify_proof`/per proof in `verify_batch` (`proof_a`,
`proof_b`, `proof_c`).

## Dual ESM/CJS build

`sdk/` builds to three parallel outputs from the same `src/`:

| Path | Format | Produced by |
|---|---|---|
| `dist/cjs/*.js` | CommonJS | `tsconfig.cjs.json` |
| `dist/esm/*.js` | ESM | `tsconfig.esm.json` |
| `dist/types/*.d.ts` | Type declarations (format-agnostic) | `tsconfig.types.json` |

`dist/index.cjs` and `dist/index.mjs` are thin entry points (`module.exports = require("./cjs/index.js")` and `export * from "./esm/index.js"`) that `sdk/package.json`'s `exports` map points at:

```json
"exports": {
  ".": {
    "types": "./dist/types/index.d.ts",
    "import": "./dist/index.mjs",
    "require": "./dist/index.cjs"
  }
}
```

Each of `dist/cjs/` and `dist/esm/` carries its own `package.json` (`{"type":"commonjs"}` / `{"type":"module"}`) written by `scripts/postbuild.cjs`, so Node interprets the plain `.js` files inside each correctly regardless of the package's own top-level `"type"` field. This avoids renaming individual compiled files to `.cjs`/`.mjs` (which would break Node's default extensionless `require()` resolution for the CJS build) while still satisfying `.mjs`/`.cjs` at the two paths that actually matter for consumers and tooling.

Verified directly, not just assumed:
- `const { verifyOnChain } = require('@zksoroban/sdk')` — tested against a real `npm pack` tarball installed into a fresh consumer project.
- `import { verifyOnChain } from '@zksoroban/sdk'` — tested the same way inside a real Vite project, including a full `vite build`.

## ESM bundle size and tree-shaking

Measured with `vite build` (Rollup) importing only specific named exports from a freshly-installed `@zksoroban/sdk` tarball, no other app code:

| Import | Bundle (raw) | Bundle (gzip) |
|---|---|---|
| `import { formatProof } from "@zksoroban/sdk"` | 4.93 kB | 1.96 kB |
| `import { verifyOnChain } from "@zksoroban/sdk"` | 361.56 kB | 95.35 kB |
| `import * as sdk` (every export referenced) | 811.32 kB | 199.94 kB |

`verifyOnChain`'s bundle is dominated by `@stellar/stellar-sdk`, which it genuinely needs to submit transactions — that's expected weight, not a tree-shaking failure. The `formatProof`-only case shows the SDK's own pure formatting/validation logic tree-shakes down to almost nothing when the on-chain and off-chain verification paths aren't used.

### A real tree-shaking bug found and fixed while verifying this

`verifyOffChain.ts` originally loaded snarkjs with a **module-scope** `require("snarkjs")`. A bare `require()` call at the top of a file is opaque to Rollup — it can't prove the module has no side effects, so it can't safely drop the module even when nothing imports `verifyOffChain`. Because every export is re-exported through one barrel (`index.ts`), that single top-level `require()` was pinning snarkjs (and its `ffjavascript` dependency) into *every* consumer's bundle regardless of which export they actually used:

| Import | Bundle (raw) before the fix |
|---|---|
| `formatProof` only | 451.76 kB |
| `verifyOnChain` only | 808.60 kB |

The fix: move the snarkjs load into the function body as a lazy `await import("snarkjs")`, so it only executes if `verifyOffChain` is actually called, and so the module has no top-level side effects for Rollup to worry about. A `declare module "snarkjs";` ambient shim (`src/snarkjs.d.ts`) was added alongside it — snarkjs ships no type declarations, and `import()` requires TypeScript to resolve the module (`require()`'s untyped return didn't need to). This shim carries the same trust boundary the old `require()` call had implicitly.

This is also why `require()` at module scope wasn't just a tree-shaking wart, but an outright bug waiting to happen for the ESM build specifically: plain `require()` doesn't exist in a real Node ESM module. Dynamic `import()` works correctly from both CJS and ESM contexts, which is what makes it the right fix here rather than only a tree-shaking one.

**All of these numbers are single measurements on one machine with one Vite version — expect them to drift over time and across environments.** Re-run `vite build` yourself if you need a number to depend on.
