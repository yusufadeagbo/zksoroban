# zksoroban Demo

An interactive end-to-end demo: it proves knowledge of a Poseidon preimage and verifies the proof on Stellar through the deployed verifier contract.

Unlike a script with hardcoded values, this demo prompts for everything it needs at runtime, so you can try different secrets, networks, and contracts without editing source.

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
commitment: 2917...0133
generating proof...
submitting to the verifier contract...
txHash: 020bf0bf7a05e92efa2188f2f0b74e474f06a03a9a84b4042b159219bdb8ede6
ledger: 1234567
fee: 100
✓ Proof verified on-chain: true
```

Notes on the flow above:

- The first **Enter** on the secret prompt is rejected (empty secret), so it re-prompts.
- `random` generates a fresh secret; you can also type a decimal value.
- `foonet` is rejected as an unknown network and re-prompts.
- The contract prompt is pre-filled with the Testnet verifier; pressing Enter accepts it.
- Verbosity controls output: `quiet` prints only the final result, `normal` adds the commitment and tx hash, `verbose` prints everything including the secret, network, and progress messages.

## Implementation Notes

- All prompts use Node.js's built-in `readline` module — there are no new dependencies.
- `Ctrl+C` during any prompt closes the interface and exits with status 0 (`Aborted.`).
