# Contributing

Contributions should preserve the core guarantees of this repository:

- the SDK, circuit, and verifier contract must remain interoperable
- the reference Testnet flow must stay reproducible
- documentation must stay aligned with the actual byte encoding and contract behavior

## Development Expectations

Before submitting changes:

1. Run the Rust verifier tests in `contracts/verifier/`.
2. Run the TypeScript SDK tests in `sdk/`.
3. If you change the circuit, regenerate the setup artifacts and confirm the verifier constants still match.
4. If you change proof encoding or verifier behavior, update `docs/proof-format.md`.
5. If you change the circuit or hashing assumptions, update `docs/architecture.md` and `docs/poseidon-parameters.md`.

## Scope Notes

- The current verifier keeps state to a minimum (admin address, rate-limit
  counters) — see [`docs/security.md`](docs/security.md) for exactly what
  it does and does not guarantee before changing its auth or storage model.
- The current contract hardcodes one circuit's verifying key.
- The setup artifacts in `circuits/poseidon_preimage/setup/` are testnet-only reference artifacts, not production ceremony outputs.

## Security

Read [`docs/security.md`](docs/security.md) before modifying
`contracts/verifier/src/lib.rs` — it has a checklist of threats already
evaluated against the current implementation (auth bypass, storage
growth, replay, reentrancy) and states plainly what this contract does
and does not protect against. If your change affects any of those
areas, update the checklist's verdicts in the same PR.

## Pull Request Checklist

Every PR is pre-filled with the checklist in
[`.github/pull_request_template.md`](.github/pull_request_template.md). Each
item maps directly to a Development Expectation above:

- **Tests added or updated** — matches items 1–2.
- **`npm run lint` passes** — the SDK and demo TypeScript must type-check;
  this is what caught a real missing-import bug that had shipped silently
  because neither package had a lint step before.
- **`cargo test` passes** — covers both `contracts/verifier/` and
  `contracts/registry/`.
- **Docs updated, if behavior changed** — matches item 4.
- **`docs/proof-format.md` updated, if proof byte encoding changed** —
  matches item 4 specifically for encoding changes, which are easy to miss
  since they don't fail any test on their own.

## Pull Request Guidance

Good changes for this repository:

- verifier correctness fixes
- SDK interoperability improvements
- test coverage improvements
- documentation fixes tied to actual implementation behavior

Changes that need extra care:

- modifying the circuit
- changing proof byte encoding
- changing Poseidon assumptions
- changing the deployed contract target or contract interface
