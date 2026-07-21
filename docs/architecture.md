# Architecture

`zksoroban` is split into four layers:

- `circuits/`: the zk statement definition
- `sdk/`: the client bridge from `circom` / `snarkjs` output into Soroban calldata
- `contracts/`: the on-chain verifier
- `demo/`: the end-to-end proof generation and verification flow

## Reference Statement

The reference circuit proves knowledge of a private `secret` such that:

```text
Poseidon(secret) == commitment
```

Inputs:

- private: `secret`
- public: `commitment`

The circuit lives in [circuit.circom](/home/amuda/sorobanzk/circuits/poseidon_preimage/circuit.circom).

## Data Flow

```text
secret
  |
  v
Poseidon hash off-chain
  |
  v
commitment
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
reconstructs vk_x and runs pairing check
  |
  v
bool result
```

## Circuit Layer

The circuit is intentionally minimal. It demonstrates the complete zk integration path on Stellar without introducing application-specific logic like nullifiers, Merkle proofs, or registries.

Artifacts:

- `circuit.circom`
- `input_example.json`
- `setup/circuit.zkey`
- `setup/verification_key.json`

The setup artifacts are testnet-only and tied to this exact circuit. If the circuit changes, the proving key, verification key, proof vectors, and contract constants must all change with it.

## SDK Layer

The SDK has three responsibilities:

- `poseidon.ts`: compute the same Poseidon hash used by the reference circuit
- `proof.ts`: convert `snarkjs` proof JSON into the exact BN254 byte layout expected by the contract
- `verify.ts`: build, submit, and decode the Soroban verifier transaction

Public API:

- `poseidon(inputs: bigint[]): bigint`
- `formatProof(proof, publicSignals): SorobanProofCalldata`
- `verifyOnChain(opts): Promise<VerifyResult>`

The SDK is stateless. RPC URL, contract ID, and source keypair are passed in at call time.

## Contract Layer

The Soroban verifier contract stores no proofs or nullifiers, but it is
no longer fully stateless: it holds an admin address and per-caller
rate-limit state (see Auth Model below).

The contract:

1. requires the caller's own Soroban auth
2. enforces a per-caller, per-window rate limit
3. parses `proof_a`, `proof_b`, `proof_c`
4. parses the public input field element and the `expiry_ledger` field,
   rejecting proofs whose expiry has already passed
5. reconstructs `vk_x = IC[0] + IC[1] * public_input`
6. runs the Groth16 BN254 pairing equation
7. returns `true` or `false`

The verifying key is hardcoded for the reference circuit. That keeps the MVP small and auditable.

Current Testnet deployment:
`CBL6MAWJALQP25LYKUUOC34K464XPSF6BLKUW6MXZDEXEDXMQUSP7HNN`

### Auth Model

`verify_proof` calls `caller.require_auth()` unconditionally — every
call must be authorized by the address passed as `caller`, not merely
submitted by it. This means:

- An attacker cannot attribute rate-limit usage, or a successful
  verification, to an address that did not itself sign off on this
  specific invocation.
- Authorization is separate from *who pays for and submits* the
  transaction — Soroban's auth framework is meta-transaction friendly,
  so a relayer can submit on a caller's behalf as long as the caller
  supplied a valid auth entry.

`set_limits` similarly requires the *stored* admin address's auth,
looked up from contract storage — not whatever address happens to be
passed as an argument.

There is no allowlist/permission-tiering above this: any address that
can produce a valid Soroban auth entry for itself can call
`verify_proof`, subject only to the rate limit. See
[`docs/security.md`](security.md) for the full threat checklist this
auth model was evaluated against.

## Demo Layer

The demo script proves the full stack works on Testnet:

1. generate a fresh random secret
2. compute its Poseidon commitment
3. generate a Groth16 proof with `snarkjs`
4. format the proof through the SDK
5. invoke the Soroban verifier
6. print the transaction hash and verification result

This is the strongest practical test in the repo because it exercises:

- the circuit
- the setup artifacts
- the SDK encoding
- Soroban transaction submission
- the deployed verifier contract

## Verifying Key Registry

The single-circuit verifier hardcodes one verifying key. The registry contract in `contracts/registry/` generalizes this so multiple circuits can be supported without redeploying.

The registry stores a verifying key per circuit ID and dispatches verification to the matching key:

```text
register_circuit(id, vk)         verify_proof(id, proof, public_inputs)
        |                                   |
        v                                   v
  admin.require_auth()              lookup vk by circuit id
        |                                   |
        v                          +--------+--------+
  store vk under                   |                 |
  Circuit(id)                  found vk         unknown id
        |                          |                 |
        v                          v                 v
  persistent storage      reconstruct vk_x      return false
                          + BN254 pairing        (no panic)
                                   |
                                   v
                            bool result
```

Key properties:

- `register_circuit(id, vk)` is gated by the admin address configured at construction.
- `verify_proof(id, ...)` returns `false` for unknown circuit IDs instead of panicking.
- The verifying key is variable-length: it carries `alpha`, `beta`, `gamma`, `delta`, and an `ic` vector whose length is one greater than the circuit's public input count.

### Testnet Deployment

The registry is deployed and live on Stellar Testnet:

- Contract address: `CDTPNARKKZCZ36PL4BNKBXZTT2BLVR373S2K5NCFAOKCPPY62ESRHSXH`
- `poseidon_preimage` is registered under circuit ID `1`, using the same
  verifying key as `contracts/verifier`'s hardcoded constants (encoded
  identically — verified byte-for-byte against
  `contracts/registry/src/tests.rs`'s known-correct test constants
  before registering).
- Verified against real, previously-proven-valid proof bytes (the same
  ones `sdk/test/fixtures.ts` uses): a correct proof returns `true`, and
  a deliberately tampered proof (negated `proof_a` y-coordinate) returns
  `false`. Both checked directly on-chain via `stellar contract invoke`,
  not simulated.

**What is not yet done**: the SDK and `demo/` still target the older,
single-circuit `contracts/verifier` deployment — `sdk/src/verify.ts`'s
`verifyOnChain` doesn't speak the registry's `verify_proof(id, ...)`
signature (or the current `contracts/verifier`'s `verify_proof(caller,
...)` signature, for that matter — see #184). Wiring the SDK and demo
up to call the registry for any of the three additional circuits
(`merkle_inclusion`, `range_proof`, `threshold_2of3`) is tracked in
#183. Deploying the registry was a prerequisite for that work, not the
completion of it.

## Design Choices

Why the verifier keeps its state minimal (admin + rate-limit counters,
nothing proof- or nullifier-related):

- simpler to audit
- cheaper to invoke
- enough for an MVP reference implementation

Why the verifying key is hardcoded:

- this repo demonstrates one reference circuit
- removing dynamic key management reduces moving parts
- multi-circuit key registries are future work

Why Groth16:

- proofs are compact
- verification is efficient
- the Soroban BN254 host support makes it practical on-chain

## Non-Goals for This MVP

Out of scope for the current architecture:

- nullifier tracking
- multi-circuit verifier registries
- privacy-preserving application logic
- production trusted setup ceremonies
- wallet UX

Those are downstream systems that can be built on top of this foundation.
