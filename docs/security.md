# Security

## Audit Checklist

A manual security checklist run against `contracts/verifier/src/lib.rs`
(the deployed verifier contract). Re-run this checklist — updating verdicts
and adding new items where relevant — whenever `verify_proof`, its storage
layout, or its auth model changes.

| # | Threat | Mitigation Pattern | Verdict |
|---|--------|---------------------|---------|
| 1 | Integer overflow in the rate-limit counter (`current + 1`) | `overflow-checks = true` in `Cargo.toml`'s release profile turns overflow into a hard panic (transaction abort) rather than a silent wraparound. The `max_calls` check itself also rejects long before a counter could approach `u32::MAX` under any admin-configured limit reachable in practice. | **Pass** |
| 2 | Storage key collisions between `Admin`, `Limits`, and `CallCount(Address, u32)` | `DataKey` is a tagged `#[contracttype]` enum; Soroban encodes the variant tag plus all associated fields, so no two distinct keys — including two different `(caller, window)` pairs — can collide. | **Pass** |
| 3 | Authentication bypass on `verify_proof` or `set_limits` | `set_limits` requires the *stored* admin address's auth, not a caller-supplied one. `verify_proof` requires the `caller` argument's own auth — an attacker cannot attribute rate-limit usage, or a verification call, to an address that did not itself authorize the invocation. | **Pass** |
| 4 | Reentrancy | `verify_proof` and `set_limits` never call another contract (no `env.invoke_contract`) — there is no callback surface for a malicious contract to re-enter through. Not applicable to the current contract. | **N/A** |
| 5 | Event spoofing | The contract emits no events at all currently (no `#[contractevent]`, no `env.events().publish`). Nothing to spoof. Noted as an observability gap, not a vulnerability — an indexer can only learn outcomes by polling storage or transaction results. | **N/A** |
| 6 | DoS via unbounded storage growth | `CallCount(caller, window_start)` entries are written to **instance** storage and never removed. Instance storage is loaded on every contract invocation, so this map growing without bound increases the cost of *every* future call, not just the caller's own. This is a real finding — see below. | **Fail** — tracked as [#178](https://github.com/yusufadeagbo/zksoroban/issues/178) |
| 7 | Panic-driven storage rollback | `read_g1`/`read_g2` panic (via `assert_eq!`) on malformed byte lengths. Since Soroban transactions are atomic, a panic reverts *all* state changes in the same invocation — including the rate-limit counter increment that ran earlier in `verify_proof`. Net effect: malformed submissions do not consume rate-limit budget. This is arguably correct behavior, but was not documented anywhere before this checklist. | **Pass**, now documented |
| 8 | Proof replay | Nothing in this contract prevents the same valid proof and public inputs from being submitted more than once within the rate-limit budget and expiry window — there is no nullifier or single-use tracking of any kind. Applications that need single-use semantics (e.g. "one vote," "claim once") **must** implement their own replay protection; this contract does not provide it. See Guarantees below. | **By design** — must be documented, not silently assumed |

### Finding #6 in detail: unbounded instance storage growth

`env.storage().instance()` is the right choice for `Admin` and `Limits` —
small, always-loaded, rarely-changing config. It is the wrong choice for
`CallCount(Address, u32)`, which grows by one entry per `(caller, window)`
pair for the contract's entire lifetime, with no expiry or cleanup. Two
consequences:

- Every invocation of the contract loads the full instance storage
  footprint, so this accumulating map makes every future call
  incrementally more expensive, not just the caller's own.
- Soroban's `temporary()` storage exists specifically for exactly this
  kind of naturally-expiring, per-window data — it has a bounded TTL and
  does not bloat the instance.

This needs a real fix (switching `CallCount` to temporary storage,
including a migration plan for any already-deployed contract instance),
not just a doc note — filed as [#178](https://github.com/yusufadeagbo/zksoroban/issues/178)
rather than folded into this checklist PR, since it touches storage
semantics and deserves its own testing pass.

## Guarantees and Non-Guarantees

What `contracts/verifier` actually provides:

- **Soundness of the pairing check**: `verify_proof` returns `true` only
  if the supplied Groth16 proof is valid against the hardcoded verifying
  key and the given public inputs.
- **Caller authentication**: every `verify_proof` and `set_limits` call
  requires real Soroban auth from the relevant address — not spoofable
  by supplying a different address in the call arguments.
- **Expiry enforcement**: a proof whose `expiry_ledger` public input has
  already passed is rejected with `Error::ProofExpired`, not silently
  accepted.

What it explicitly does **not** provide:

- **Replay protection.** The same valid proof can be verified more than
  once (see finding #8). Any application requiring single-use semantics
  must add its own nullifier/replay tracking on top.
- **Unbounded scalability of rate-limit storage.** See finding #6 — this
  is a known, tracked gap, not a hidden one.
- **Multi-circuit support.** This contract hardcodes exactly one
  verifying key. (`contracts/registry` is the separate contract that
  supports multiple named verifying keys; it is out of scope for this
  checklist.)

## CodeQL

`.github/workflows/codeql.yml` runs CodeQL analysis on every PR to `main`,
every push to `main`, and weekly, covering:

- TypeScript (`sdk/src/`, `demo/src/`)
- Rust (`contracts/verifier/src/`, `contracts/registry/src/`)

Results appear under the repository's Security > Code scanning tab.

The Rust analysis uses `build-mode: none` (buildless/standalone
extraction) — CodeQL's Rust extractor does not support `manual` build
mode at all, only `none`. GitHub's own docs note this yields less
accurate results than a fully-traced build. Treat a clean Rust CodeQL
run as a weak signal, not a strong guarantee; the manual audit (#57)
and the property-based tests (#56) carry more weight for the contract.

### Accepted Findings

None yet. Any finding that is a false positive or an accepted risk
(rather than something to fix) will be listed here with a justification,
so the reasoning survives even after the finding is dismissed on GitHub.
