# Security Model

This document describes the security guarantees `zksoroban` provides across
its full stack — circuit, SDK, and on-chain contract — and, just as
importantly, what it does not. It is written for developers building
applications on top of `zksoroban`, so they do not carry over false
assumptions from other ZK stacks or from the phrase "zero-knowledge" alone.

For a threat-by-threat audit of the deployed verifier contract's code, see
[`docs/security.md`](security.md). This document is broader: it covers the
whole pipeline (circuit → SDK → contract) and is written for application
developers, not contract auditors.

## Guarantees

What `zksoroban` actually provides, end to end:

- **Soundness of the pairing check.** `contracts/verifier`'s `verify_proof`
  returns `true` only if the supplied Groth16 proof is valid against the
  hardcoded verifying key and the given public inputs — assuming the
  trusted setup was honest (see Trust Assumptions below). No proof can make
  it return `true` for a false statement without either breaking the
  underlying elliptic-curve assumptions or compromising the trusted setup.
- **Zero-knowledge of the private witness.** The `secret` input to the
  reference circuit (`circuits/poseidon_preimage`) is never transmitted,
  logged, or reconstructible from the proof, the public `commitment`, or
  anything the contract stores. Only `Poseidon(secret) == commitment` is
  proven — the value of `secret` itself stays private.
- **Caller authentication on-chain.** Every `verify_proof` and
  `set_limits` call to `contracts/verifier` requires real Soroban auth
  from the relevant address. An attacker cannot attribute a rate-limit
  hit, or a verification, to an address that never authorized that
  specific invocation.
- **Expiry enforcement.** A proof whose `expiry_ledger` public input has
  already passed is rejected with `Error::ProofExpired`, not silently
  accepted, once past its intended validity window.
- **SDK-side input validation.** `sdk/src/validate.ts` rejects malformed
  proof coordinates, out-of-field-range values, and malformed public
  inputs *before* they reach the network — see `validateProofInput` and
  `validateCalldata`. This catches encoding mistakes early; it is not a
  cryptographic guarantee about what the contract will do (the contract
  performs its own independent validation of anything it receives).

## Trust Assumptions

`zksoroban` is not trustless in every dimension. Concretely:

- **The trusted setup is not a production ceremony.** The proving/verifying
  key pair in `circuits/poseidon_preimage/setup/` is explicitly documented
  as testnet-only (see that circuit's README: "not production ceremony
  outputs"). Whoever generated this setup could, in principle, have
  retained the toxic waste and forged proofs for statements that are
  false. **Do not treat a testnet deployment of this reference circuit as
  trustworthy for anything of real value.** A real deployment needs its
  own multi-party ceremony with the toxic waste provably destroyed.
- **The admin key is fully trusted for its scope.** `contracts/verifier`'s
  admin can call `set_limits` to change the per-caller rate-limiting
  window and cap. A compromised admin key lets an attacker either starve
  legitimate callers (setting `max_calls` to 0 or near-0) or remove rate
  limiting entirely (setting it arbitrarily high) — it **cannot** forge a
  proof, bypass the pairing check, or read any private witness. The
  blast radius of a compromised admin key is availability/rate-limiting,
  not soundness or privacy.
- **The BN254 pairing and Poseidon hash are assumed secure.** Like any
  Groth16/BN254 system, this stack inherits the standard cryptographic
  assumptions of that curve and hash function. `zksoroban` does not
  introduce new cryptographic primitives or attempt to justify them —
  it relies on the same assumptions the broader Groth16/BN254 ecosystem
  does.
- **The SDK's encoder is trusted to be correct, not verified independently
  on-chain.** `formatProof` converts snarkjs JSON into the exact byte
  layout the contract expects. If the SDK's encoding has a bug, it could
  produce calldata that mismatches the prover's actual proof — the
  contract has no way to know the SDK "meant" something different from
  what it received. This is why `sdk/test/vectors.json` and the
  property-based tests (`sdk/test/proof.property.test.ts`) exist: to
  catch encoding regressions before they reach production, not because
  the contract can catch them itself.

## Threat Model

| Threat | Attacker Capability | Impact | Mitigation / Accepted Risk |
|---|---|---|---|
| Forged proof for a false statement | Controls the trusted setup's toxic waste (only realistic if they generated it, or the ceremony was compromised) | Complete break — contract accepts a proof for a statement that isn't true | **Accepted risk on testnet** (setup is explicitly not production-grade); **mitigation for production** is a real multi-party ceremony with provable toxic-waste destruction |
| Proof replay | None beyond ability to resubmit previously-seen, still-valid transaction data | The same valid proof can be verified more than once, within the rate-limit budget and before its `expiry_ledger` passes | **Accepted risk, by design** — `contracts/verifier` has no nullifier/single-use tracking (see Known Limitations). Applications needing single-use semantics must implement their own replay protection |
| Rate-limit storage growth (DoS via cost inflation) | Any address that can submit transactions (no special privilege) | Each new `(caller, window)` pair permanently occupies instance storage, which is loaded on every future invocation — this makes every future call incrementally more expensive over time, for everyone | **Tracked, unresolved** — filed as [zksoroban#178](https://github.com/yusufadeagbo/zksoroban/issues/178); the fix is moving this storage to Soroban's `temporary()` storage class |
| Admin key compromise | Controls the private key configured as `admin` at contract construction | Can disable or misconfigure rate limiting (denial-of-service or resource-cost attack against the contract itself); **cannot** forge proofs or break confidentiality | **Accepted risk inherent to having an admin role at all** — standard key-management practices (cold storage, multi-sig) apply; not something this contract's code can mitigate on its own |
| Malformed/adversarial proof bytes | Any address that can submit transactions | Attempting to trigger a panic or unexpected contract behavior with malformed byte lengths | **Mitigated** — `read_g1`/`read_g2` panic cleanly on wrong lengths, and Soroban's atomic transaction semantics roll back *all* state changes (including any rate-limit counter increment) on panic, so malformed submissions cannot even be used to grief the rate limit |
| SDK encoding bug | None (this is a correctness risk, not an adversarial one) | A bug in `formatProof` could silently produce calldata that doesn't match what the prover actually proved, causing the contract to correctly reject a proof the application believed was valid (or, in the worst case, misencode in a way that happens to still parse) | **Mitigated** — property-based tests and fixed test vectors (`sdk/test/vectors.json`, `sdk/test/proof.property.test.ts`) assert the encoding against known-correct byte layouts across randomized and adversarial inputs |

## Known Limitations

Stated plainly, so applications don't have to discover these by
experimentation:

- **`zksoroban` does not hide the fact that a verification occurred.**
  Calling `verify_proof` is a normal Soroban transaction — it is publicly
  visible on-chain, in the same way any contract call is. What stays
  private is the witness (`secret`); the *act* of verifying, the calling
  address, and the timing are all public, exactly like any other Soroban
  transaction.
- **No replay protection.** Covered above — the same valid proof can be
  submitted more than once.
- **No privacy for public inputs.** The `commitment` (and any other public
  input) is, by definition, public — it's an argument to `verify_proof`
  and appears in the transaction. Only values the circuit marks `private`
  are hidden.
- **Single-circuit verifier, unless using the registry.**
  `contracts/verifier` hardcodes exactly one verifying key.
  `contracts/registry` supports multiple named circuits, but as of this
  writing only `poseidon_preimage` is registered under it (see
  [zksoroban#183](https://github.com/yusufadeagbo/zksoroban/issues/183)
  for wiring up the other reference circuits).
- **No trusted-setup ceremony has been run for production use.** Repeated
  from Trust Assumptions because it is the single most consequential
  limitation for anyone considering a real (non-testnet) deployment.

## Recommendations for Applications

If you are building on top of `zksoroban`:

1. **Do not deploy the reference circuit's testnet setup artifacts to
   mainnet or anywhere real value is at stake.** Run your own trusted
   setup ceremony for your circuit, with toxic waste destruction you can
   verify or attest to.
2. **Add your own replay/nullifier protection if your application needs
   single-use semantics** (voting, one-time claims, airdrops). Do not
   assume the contract does this for you — it does not.
3. **Treat the admin key as a standard privileged key**, not a
   cryptographic trust anchor. Secure it the way you would any contract
   admin key (multi-sig, cold storage, timelocks if you add them) —
   compromising it affects availability, not proof soundness.
4. **Don't rely on `verify_proof` alone for privacy of the fact that a
   verification happened.** If your application needs to hide *who*
   verified *when*, you need additional design beyond what this stack
   provides — e.g. relayers, mixers, or batching, none of which
   `zksoroban` implements.
5. **Pin your SDK version to a verifying key / circuit version.** If you
   change your circuit, its verifying key and the SDK's encoding
   assumptions must change together — see
   [`docs/proof-format.md`](proof-format.md)'s Interoperability Checklist
   for the exact list of things that must all agree.
