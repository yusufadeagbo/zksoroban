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
| 3 | Authentication bypass on `verify_proof`, `set_limits`, or `update_vk` | All three require the *stored* admin address's auth (or, for `verify_proof`, the `caller` argument's own auth) — not a caller-supplied address. An attacker cannot attribute rate-limit usage, a verification call, or a verifying-key update to an address that did not itself authorize the invocation. | **Pass** |
| 4 | Reentrancy | `verify_proof` and `set_limits` never call another contract (no `env.invoke_contract`) — there is no callback surface for a malicious contract to re-enter through. Not applicable to the current contract. | **N/A** |
| 5 | Event spoofing | `verify_proof` now publishes a `verification_result` event (topics `["zk", "verify"]`; data `success`, `caller`, `inputs_hash`) — but only on the outcome paths that return via `Ok(...)`: wrong public-input count, malformed `expiry_ledger` encoding, and the pairing-check result. The allowlist/rate-limit/expiry rejections still return `Err(...)` and never publish — Soroban rolls back any event published during a call that ultimately returns `Err` from a `#[contracterror]` `Result` (see `docs/architecture.md`'s Events section). Soroban events are always scoped to the publishing contract's own address at the host level, so nothing else can forge a `verification_result` that appears to come from this contract. | **Pass** — see [zksoroban#10](https://github.com/yusufadeagbo/zksoroban/issues/10) |
| 6 | DoS via unbounded storage growth | `CallCount(caller, window_start)` entries now live in **temporary** storage with a TTL covering the rate-limit window, so each entry naturally expires once its window closes instead of accumulating forever. See below. | **Pass** — fixed in [#178](https://github.com/yusufadeagbo/zksoroban/issues/178) |
| 7 | Panic-driven storage rollback | `read_g1`/`read_g2` panic (via `assert_eq!`) on malformed byte lengths. Since Soroban transactions are atomic, a panic reverts *all* state changes in the same invocation — including the rate-limit counter increment that ran earlier in `verify_proof`. Net effect: malformed submissions do not consume rate-limit budget. This is arguably correct behavior, but was not documented anywhere before this checklist. | **Pass**, now documented |
| 8 | Proof replay | Nothing in this contract prevents the same valid proof and public inputs from being submitted more than once within the rate-limit budget and expiry window — there is no nullifier or single-use tracking of any kind. Applications that need single-use semantics (e.g. "one vote," "claim once") **must** implement their own replay protection; this contract does not provide it. See Guarantees below. | **By design** — must be documented, not silently assumed |
| 9 | Malicious verifying key via `update_vk` | The verifying key moved from compile-time constants to admin-updatable storage (see `update_vk`). A compromised admin key can install an arbitrary VK, making the contract accept a proof for a false statement — a genuine escalation from what a compromised admin could do before this existed (previously availability-only). `update_vk` does validate the new key's shape (`ic.len()` must match the expected public-input count) but has no way to validate that the key came from a legitimate trusted setup — that's a property of the key itself, not something on-chain code can check. | **By design, escalated risk** — see `docs/security-model.md`'s Trust Assumptions and Recommendations for how applications should treat the admin key now |
| 10 | Contract takeover via `upgrade`, or admin handoff to an unintended address via `propose_admin`/`accept_admin` | Both contracts (`contracts/verifier` and `contracts/registry`) gate `propose_admin` and `upgrade` behind the *stored* admin's own auth, and `accept_admin` behind the *pending* admin's own auth — same pattern as finding #3. The two-step handoff means a compromised or careless current admin cannot unilaterally hand control to an attacker address; the recipient must itself authorize `accept_admin`. It does **not** limit what an already-compromised, still-current admin key can do on its own: `upgrade(new_wasm_hash)` replaces the entire contract executable, which is strictly more powerful than `update_vk` — arbitrary code, not just an arbitrary verifying key. | **By design, escalated risk** — see `docs/security-model.md`'s Trust Assumptions |
| 11 | DoS via unbounded storage growth from `VerificationCount(BytesN<32>)` | The per-public-input-commitment counter added for analytics/abuse detection (`verification_count`, [#41](https://github.com/yusufadeagbo/zksoroban/issues/41)) is keyed by a commitment derived from the proof's public inputs which the circuit author controls — unlike `CallCount` (finding #6), an attacker cannot mint unbounded distinct commitments. The counter lives in `instance()` storage as a `u64` per issue #41's specification, increments only on successful verification, and never resets. The admin can call `upgrade` to redeploy from scratch if storage becomes a concern. | **Pass** — see Note |

### Finding #6 in detail: unbounded instance storage growth (fixed)

`env.storage().instance()` is the right choice for `Admin` and `Limits` —
small, always-loaded, rarely-changing config. It was the wrong choice for
`CallCount(Address, u32)`, which grew by one entry per `(caller, window)`
pair for the contract's entire lifetime, with no expiry or cleanup.

Fixed in [#178](https://github.com/yusufadeagbo/zksoroban/issues/178):
`CallCount` entries now live in `env.storage().temporary()`, with
`extend_ttl` called on every write so each entry survives at least the
remainder of its own rate-limit window and is then naturally evicted by
the ledger instead of persisting forever.

**Migration note:** this fix only changes where *new* `CallCount` writes
go. Instance storage entries written by a contract instance deployed
before this fix stay exactly where they are — a contract upgrade
replaces code, not existing storage — so any already-deployed instance
still carries its old, unbounded instance-storage entries. Those stale
entries are dead weight (the new code never reads or writes
`DataKey::CallCount` under `instance()` again) but are not
automatically cleaned up; a fresh deployment is the only way to start
with a clean slate.

## Guarantees and Non-Guarantees

What `contracts/verifier` actually provides:

- **Soundness of the pairing check**: `verify_proof` returns `true` only
  if the supplied Groth16 proof is valid against the currently-stored
  verifying key and the given public inputs — assuming that key is a
  legitimate one (see finding #9: the admin can replace it).
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
