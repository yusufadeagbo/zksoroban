# zksoroban

[![ci](https://github.com/yusufadeagbo/zksoroban/actions/workflows/ci.yml/badge.svg)](https://github.com/yusufadeagbo/zksoroban/actions/workflows/ci.yml)
[![CodeQL](https://github.com/yusufadeagbo/zksoroban/actions/workflows/codeql.yml/badge.svg)](https://github.com/yusufadeagbo/zksoroban/actions/workflows/codeql.yml)

The first developer SDK and reference verifier contract for zero-knowledge proofs on Stellar, built on Protocol 25's native BN254 and Poseidon host functions.

Testnet verifier contract:
`CBL6MAWJALQP25LYKUUOC34K464XPSF6BLKUW6MXZDEXEDXMQUSP7HNN`

## New to ZK proofs?

Follow the step-by-step tutorial: [docs/tutorial-first-proof.md](docs/tutorial-first-proof.md)

It covers prerequisites, Testnet account funding, exact commands, expected output, and a troubleshooting section.

## Quick Start

1. Install prerequisites: Node.js 22+, Rust, Stellar CLI, `make`, and `circom`.
2. Install the workspace dependencies from the repository root:
   `make install`
3. Build the verifier contract and SDK:
   `make build`
4. Run the full local check suite:
   `make test`
5. Fund a Testnet account and export a secret key:
   `export SOROBAN_SECRET_KEY=...`
6. Export the demo RPC and verifier contract settings:
   `export SOROBAN_RPC_URL=https://soroban-testnet.stellar.org`
   `export SOROBAN_CONTRACT_ID=CBL6MAWJALQP25LYKUUOC34K464XPSF6BLKUW6MXZDEXEDXMQUSP7HNN`
7. Run the end-to-end demo:
   `make demo`

Useful maintenance commands:

- `make lint`: run Rust formatting, clippy, and TypeScript checks.
- `make circuits`: compile and verify the reference Poseidon preimage circuit.
- `make clean`: remove generated Rust, SDK, demo, and circuit build artifacts.

Expected result:
`✓ Proof verified on-chain: true`

## What This Repo Contains

- `contracts/verifier/`: a Soroban verifier contract for a Groth16 proof over BN254, gated by caller auth, per-caller rate limiting, and proof expiry.
- `contracts/registry/`: a multi-circuit verifying-key registry, deployed to Testnet — see [docs/architecture.md](docs/architecture.md#verifying-key-registry).
- `sdk/`: a TypeScript SDK for Poseidon hashing, snarkjs proof formatting, and on-chain verification.
- `circuits/`: the reference Poseidon preimage circuit (wired to both contracts above) plus three additional circuits — `merkle_inclusion`, `range_proof`, `threshold_2of3` — that exist and are tested but are not yet wired to any contract (tracked in #183).
- `demo/`: an end-to-end script that generates a fresh secret, proves knowledge of its Poseidon commitment, and verifies it on Stellar Testnet.
- `docs/`: architecture notes, ZK primer, proof format specification, security audit checklist, and Poseidon parameter notes.

## Architecture

```text
User secret
   |
   v
Poseidon(secret) -> commitment
   |
   v
circom + snarkjs
generate Groth16 proof
   |
   v
SDK formatProof()
encodes proofA / proofB / proofC / publicInputs
   |
   v
SDK verifyOnChain()
submits Soroban transaction
   |
   v
Verifier contract
reconstructs vk_x and runs BN254 pairing check
   |
   v
bool result on-chain
```

## Reference Flow

The reference circuit exposes one public input, `commitment`, and one private input, `secret`. The prover shows that `Poseidon(secret) == commitment` without revealing `secret`. The contract keeps state to a minimum — an admin address and per-caller rate-limit counters, nothing proof- or nullifier-related — and returns a boolean, which keeps the MVP easy to audit and inexpensive to call. See [docs/security.md](docs/security.md) for exactly what this contract does and does not guarantee.

## Repository Status

- Phase 0: foundation complete
- Phase 1: verifier contract deployed and resource-gated
- Phase 2: SDK complete with Testnet integration tests
- Phase 3: reference circuit, setup artifacts, and demo complete
- Phase 4: documentation and submission polish complete

Known gaps, tracked as open issues rather than left implicit:

- No replay protection — the same valid proof can be verified more than once (#11).
- The SDK's `verifyOnChain` doesn't match either the current `contracts/verifier` or `contracts/registry` ABI (#184).
- `merkle_inclusion`, `range_proof`, and `threshold_2of3` circuits exist but aren't registered with `contracts/registry` yet (#183).
- Rate-limit storage on `contracts/verifier` grows without bound (#178).

## Testnet Proof

- `contracts/verifier` contract address (targeted by `demo/`):
  `CBL6MAWJALQP25LYKUUOC34K464XPSF6BLKUW6MXZDEXEDXMQUSP7HNN`
- Example successful demo transaction:
  `020bf0bf7a05e92efa2188f2f0b74e474f06a03a9a84b4042b159219bdb8ede6`
- `contracts/registry` contract address (deployed, `poseidon_preimage` registered under circuit ID `1`, not yet wired to `demo/` — see #183):
  `CDTPNARKKZCZ36PL4BNKBXZTT2BLVR373S2K5NCFAOKCPPY62ESRHSXH`
- Verified directly on-chain against real proof bytes: a correct proof returns `true`, a proof with a deliberately negated coordinate returns `false`.

## Notes

- The setup artifacts in `circuits/poseidon_preimage/setup/` are testnet-only and non-production.
- `contracts/verifier` still hardcodes one circuit's verifying key; `contracts/registry` supports multiple, and is deployed, but only `poseidon_preimage` is registered under it so far.
- This contract provides no replay protection — see [docs/security.md](docs/security.md) for what it does and does not guarantee.

See [docs/zk-primer.md](https://github.com/yusufadeagbo/zksoroban/blob/main/docs/zk-primer.md) and [docs/proof-format.md](https://github.com/yusufadeagbo/zksoroban/blob/main/docs/proof-format.md) for the detailed background and byte-level interoperability spec.
