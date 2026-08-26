# zksoroban Demo

An interactive end-to-end demo: it proves knowledge of a Poseidon preimage and verifies the proof on Stellar through the deployed `contracts/registry` contract.

Unlike a script with hardcoded values, this demo prompts for everything it needs at runtime, so you can try different secrets, networks, and contracts without editing source.

Once the proof is generated, the demo runs three scenarios in sequence
using that same proof, so you see both the success path and what real
failures look like:

1. **Success** — the proof, verified against the commitment it actually
   proves. Expect `verified: true`.
2. **Failure: wrong public input** — the same proof, submitted against a
   *different* commitment. This is a soundness rejection, not an
   exception: the pairing check fails and `verifyViaRegistry` resolves
   normally with `false`.
3. **Failure: malformed public input** — a public input value at or
   beyond the BN254 field modulus. This one never reaches the network:
   `formatProof` throws a typed `ZkInputError` (with `.code` and
   `.message`) synchronously, before anything is submitted.

## Prerequisites

1. Install dependencies in `sdk/` and `demo/`:

   ```bash
   cd ../sdk && npm install && cd ../demo && npm install
   ```

2. Compile the reference circuit so the prover has the `.wasm`:

   ```bash
   cd ../circuits/poseidon_preimage
   mkdir -p build
   circom circuit.circom --r1cs --wasm --sym -o build -l ../../demo/node_modules
   cd ../../demo
   ```

That's it — no Stellar account or secret key needed. `contracts/registry`'s
`verify_proof` requires no auth, so the demo verifies via a read-only
simulation call (`verifyViaRegistry`), not a signed transaction.

## Running

```bash
npm run demo
```

## Prompt Flow

The demo prompts for the secret, network, contract address, and output verbosity. Press **Enter** to accept the value shown in brackets. Invalid inputs re-prompt instead of crashing, and **Ctrl+C** exits gracefully.

```text
$ npm run demo

Secret value (decimal, or 'random'):
  Secret cannot be empty.
Secret value (decimal, or 'random'): 42
Network (testnet/mainnet) [testnet]: foonet
  Unknown network. Choose 'testnet' or 'mainnet'.
Network (testnet/mainnet) [testnet]: testnet
Registry contract address [CDTPNARKKZCZ36PL4BNKBXZTT2BLVR373S2K5NCFAOKCPPY62ESRHSXH]:
Verbosity (quiet/normal/verbose) [normal]: verbose

secret: 42
network: testnet (https://soroban-testnet.stellar.org)
commitment: 12326503012965816391338144612242952408728683609716147019497703475006801258307
generating proof...

=== Scenario 1: success — valid proof ===
simulating verify_proof against the registry...
✓ Proof verified on-chain: true

=== Scenario 2: failure — valid proof, wrong public input ===
using the same proof, but a different commitment than the one it actually proves
simulating verify_proof against the registry...
✓ Proof verified on-chain: false

=== Scenario 3: failure — malformed public input ===
a public input at or beyond the BN254 field modulus is rejected before any network call
✗ formatProof threw ZkInputError, as expected:
  code: INVALID_PUBLIC_INPUT
  message: publicSignals[0] exceeds the BN254 field size (2188824287183927522224640574525727508854836440041603434369820418…)
```

Notes on the flow above:

- The first **Enter** on the secret prompt is rejected (empty secret), so it re-prompts.
- `random` generates a fresh secret; you can also type a decimal value — `42` is shown here so the commitment is reproducible.
- `foonet` is rejected as an unknown network and re-prompts.
- The contract prompt is pre-filled with the deployed registry; pressing Enter accepts it.
- Verbosity controls output: `quiet` prints only the final result, `normal` adds the commitment, `verbose` prints everything including the secret, network, and progress messages.
- Scenarios 1 and 2 above are real: run against the live Testnet
  registry, not simulated results faked locally — `verifyViaRegistry`
  itself performs a real RPC simulation against the deployed contract,
  it just doesn't submit a signed transaction, since `verify_proof` on
  the registry needs no auth. That's also why there's no `txHash` in
  this output, unlike a signed submission would produce.
- Scenario 3 never touches the network at all — the SDK's own
  validation in `formatProof` rejects the malformed input immediately.

## Implementation Notes

- All prompts use Node.js's built-in `readline` module — there are no new dependencies.
- `Ctrl+C` during any prompt closes the interface and exits with status 0 (`Aborted.`).

## Fee Estimation (optional, separate script)

`src/estimateFee.ts` is a standalone script, not part of the interactive
demo above — it demonstrates `estimateVerifyFee`/`verifyOnChain` against
the older, single-circuit `contracts/verifier`, which (unlike the
registry) requires a signed, fee-paying transaction. Run it with `npm run
estimate-fee`. See
[`docs/tutorial-first-proof.md`](../docs/tutorial-first-proof.md#optional-estimate-a-transaction-fee)
for the full walkthrough, including funding a Testnet account.
## Batch Verification

`src/batchVerify.ts` is a non-interactive integration test for the SDK's
`verifyBatchViaRegistry` — it batch-verifies 3 real, previously-generated
proofs across 3 different circuit IDs (`range_proof`, `threshold_2of3`,
`merkle_inclusion`) against `contracts/registry::verify_batch`, in a single
call. It loads each circuit's `fixtures/{proof,public}.json` directly, so it
needs no `circom` toolchain and no witness generation, unlike the main demo's
`poseidon_preimage` flow.

```bash
npm run batch-verify
```

By default this targets the live Testnet registry
(`CDTPNARKKZCZ36PL4BNKBXZTT2BLVR373S2K5NCFAOKCPPY62ESRHSXH`), which today
only has `poseidon_preimage` (circuit ID 1) registered — not the three
circuits this batch asks about (IDs 2/3/4). Every result will correctly come
back `false` in that case (the registry reporting "unknown circuit," not a
bug), and the script prints a note explaining that rather than asserting
success.

To see real `true` results, register those three circuits' verifying keys
(see [`docs/multi-circuit.md`](../docs/multi-circuit.md) and
`sdk/src/proof.ts`'s `formatVerifyingKey`) with your own registry instance,
then point the script at it — this also makes the script assert that every
result comes back `true`, failing the run (non-zero exit) if any doesn't:

```bash
SOROBAN_TEST_REGISTRY_CONTRACT_ID=<your registry contract id> npm run batch-verify
```

If you registered the circuits under different IDs than this script's
defaults (2/3/4, matching `contracts/registry/src/tests.rs`'s own scheme),
override them individually:

```bash
SOROBAN_TEST_REGISTRY_CONTRACT_ID=<id> \
SOROBAN_RANGE_PROOF_CIRCUIT_ID=<id> \
SOROBAN_THRESHOLD_2OF3_CIRCUIT_ID=<id> \
SOROBAN_MERKLE_INCLUSION_CIRCUIT_ID=<id> \
npm run batch-verify
```
