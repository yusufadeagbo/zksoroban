# @zksoroban/sdk

TypeScript SDK for Poseidon hashing, snarkjs proof formatting, and on-chain
verification against `contracts/verifier`/`contracts/registry`. See the
[repo root README](../README.md) for the project overview and
[docs/architecture.md](../docs/architecture.md) for how this fits together
with the contracts and circuits.

## Generated contract types

The SDK's view of `contracts/verifier` — every entry point, its arguments,
its return type, the contract's structs and its error codes — is **generated
from the contract itself**, not maintained by hand. The source of truth is
the contract's embedded Soroban contract spec (the `contractspecv0` custom
section of the compiled contract WASM), and the generated file is
[`src/generated/contract.ts`](./src/generated/contract.ts).

```sh
# 1. build the contract (its spec lives in the compiled WASM)
cargo build --manifest-path contracts/verifier/Cargo.toml --target wasm32v1-none --release

# 2. regenerate the SDK's contract types
npm run codegen
```

`npm run codegen` reads the compiled contract and rewrites
`src/generated/contract.ts`. `npm run build` runs it automatically before
`tsc`, so a normal SDK build always compiles against types that match the
contract it was built with. `npm run codegen:check` regenerates in memory
and fails if the committed file differs — that is the drift check CI runs,
and `make codegen-check` runs it locally.

Never edit `src/generated/contract.ts` by hand: the next `npm run codegen`
overwrites it. Change the contract (or the generator) and regenerate instead.

What the generated file gives you:

- `VerifierContract` — every entry point, with its argument and result types.
- `<Function>Args` / `<Function>Result` types, e.g. `VerifyProofArgs` and
  `VerifyProofResult`.
- The contract's structs as interfaces (`ContractConfig`, `Limits`,
  `ProofItem`, `VerifyingKey`) and its events as interfaces
  (`VerificationResultEvent`).
- `VerifierError` — the contract's error codes, e.g.
  `VerifierError.AlreadyUsed === 11`.
- `VERIFIER_FUNCTIONS` — the contract's function names, so calling
  `contract.call(VERIFIER_FUNCTIONS.verify_proof, …)` fails to compile if the
  contract renames the function.

Field names match the contract exactly (snake_case), because they are also
the XDR map keys on the wire. `Option<T>` maps to `T | undefined`; `u64` and
wider integers map to `bigint`; byte values map to `Buffer`.

## Testing

```sh
npm test         # build + run the full suite (sdk/test/**/*.ts)
npm run test:unit  # same thing, by its more conventional name
npm run test:golden # golden-file CLI output check (see scripts/golden.ts)
```

Tests run on Node's built-in test runner (`node:test`, via `tsx`) — not
Vitest or Jest. `test/verify.integration.ts` needs `SOROBAN_SECRET_KEY` and
`SOROBAN_VERIFIER_CONTRACT_ID` to do anything; without them it skips itself
rather than failing.

### Snapshot tests

`test/proofEncoding.snapshot.test.ts` snapshots `formatProof`'s and
`poseidon`'s output for known, fixed inputs (see
[zksoroban#90](https://github.com/yusufadeagbo/zksoroban/issues/90)) — the
point is to catch an encoding regression the moment it happens in CI,
rather than only discovering it after a proof that used to verify starts
failing against a real deployed contract.

Snapshots live in `test/__snapshots__/*.snapshot` and are committed to the
repo, using Node's built-in snapshot testing
([`t.assert.snapshot()`](https://nodejs.org/api/test.html#snapshot-testing)).
`test/snapshot-setup.ts`, preloaded via `--require` in the `test` script,
just tells Node to put those files in `test/__snapshots__/` next to the
test that owns them, instead of its default of one flat `<test-file>.snapshot`
sitting directly in `test/`.

**If `npm test` fails on a snapshot mismatch**, that's the test suite
doing exactly its job: something changed what `formatProof` or `poseidon`
produce for a fixed input. Figure out why before doing anything else — an
unintended change here breaks proofs, calldata, and every already-deployed
contract expecting the old encoding.

**If the change was actually intentional** (a deliberate encoding change,
a new field, a genuine bug fix), refresh the snapshots and review the diff
like any other code change:

```sh
npx tsx --test --require ./test/snapshot-setup.ts --test-update-snapshots test/proofEncoding.snapshot.test.ts
git diff test/__snapshots__/
```

Commit the updated `.snapshot` file alongside whatever source change caused
it, and say why in the PR — the same way a deliberate contract-cost
increase gets explained when updating
[`contracts/verifier/baseline-cost.json`](../contracts/verifier/baseline-cost.json)
(see [`docs/performance.md`](../docs/performance.md)).
