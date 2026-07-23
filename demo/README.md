# zksoroban Demo

An interactive end-to-end demo: it proves knowledge of a Poseidon preimage and verifies the proof on Stellar through the deployed verifier contract.

Unlike a script with hardcoded values, this demo prompts for everything it needs at runtime, so you can try different secrets, networks, and contracts without editing source.

Once the proof is generated, the demo runs three scenarios in sequence
using that same proof, so you see both the success path and what real
failures look like:

1. **Success** — the proof, verified against the commitment it actually
   proves. Expect `verified: true`.
2. **Failure: wrong public input** — the same proof, submitted against a
   *different* commitment. This is a soundness rejection, not an
   exception: the pairing check fails and `verifyOnChain` resolves
   normally with `verified: false`.
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

3. Export a funded Stellar secret key for signing the verification transaction:

   ```bash
   export SOROBAN_SECRET_KEY=S...
   ```

   The Stellar signing key is read from the environment. Everything else is prompted interactively.

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
Secret value (decimal, or 'random'): random
Network (testnet/mainnet) [testnet]: foonet
  Unknown network. Choose 'testnet' or 'mainnet'.
Network (testnet/mainnet) [testnet]: testnet
Contract address [CBL6MAWJALQP25LYKUUOC34K464XPSF6BLKUW6MXZDEXEDXMQUSP7HNN]:
Verbosity (quiet/normal/verbose) [normal]: verbose

secret: 4827...921
network: testnet (https://soroban-testnet.stellar.org)
commitment: 1095...6991
generating proof...

=== Scenario 1: success — valid proof ===
submitting to the verifier contract...
txHash: 18cb98023255f3867b13925b459a88955041ff9a959ca51ea2390589fa710b01
ledger: 1234567
fee: 100
✓ Proof verified on-chain: true

=== Scenario 2: failure — valid proof, wrong public input ===
using the same proof, but a different commitment than the one it actually proves
submitting to the verifier contract...
txHash: e5ffae9fbc164648e55d8de868b1a552a384265216020ae61286dfb0b4da69c9
ledger: 1234571
fee: 100
✓ Proof verified on-chain: false

=== Scenario 3: failure — malformed public input ===
a public input at or beyond the BN254 field modulus is rejected before any network call
✗ formatProof threw ZkInputError, as expected:
  code: INVALID_PUBLIC_INPUT
  message: publicSignals[0] exceeds the BN254 field size (2188824287183927522224640574525727508854836440041603434369820418…)
```

Notes on the flow above:

- The first **Enter** on the secret prompt is rejected (empty secret), so it re-prompts.
- `random` generates a fresh secret; you can also type a decimal value.
- `foonet` is rejected as an unknown network and re-prompts.
- The contract prompt is pre-filled with the Testnet verifier; pressing Enter accepts it.
- Verbosity controls output: `quiet` prints only the final result, `normal` adds the commitment and tx hash, `verbose` prints everything including the secret, network, and progress messages.
- All three scenarios above are real: they were run against the live
  Testnet verifier contract, not simulated. Scenario 2's `txHash` is a
  genuine on-chain transaction that resolved to `verified: false` —
  the contract really was called with a proof that doesn't match the
  given commitment, and correctly rejected it.
- Scenario 3 never touches the network at all — the SDK's own
  validation in `formatProof` rejects the malformed input immediately,
  which is why there's no `txHash` for it.

## Implementation Notes

- All prompts use Node.js's built-in `readline` module — there are no new dependencies.
- `Ctrl+C` during any prompt closes the interface and exits with status 0 (`Aborted.`).
