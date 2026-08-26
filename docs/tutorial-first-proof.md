# Tutorial: Verify Your First ZK Proof on Stellar

This tutorial walks you through generating and verifying a zero-knowledge proof on Stellar Testnet — from a fresh clone to seeing:

```
✓ Proof verified on-chain: true
```

No prior ZK knowledge is required.

---

## What You Will Build

You will prove that you know a secret number whose Poseidon hash equals a public commitment — without ever revealing the secret. `contracts/registry`, the multi-circuit verifying-key registry deployed on Testnet, will check the proof against the `poseidon_preimage` circuit's registered key and return `true`.

---

## Prerequisites

Install the following before starting.

### Node.js 22 or later

```bash
node --version
# must print v22.x.x or higher
```

Download from [nodejs.org](https://nodejs.org) or use a version manager such as `nvm`.

### circom 2.x

circom compiles the circuit into the `.wasm` file the prover needs.

```bash
cargo install circom
circom --version
# should print circom compiler 2.x.x
```

Requires Rust. If Rust is not installed:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

### Stellar CLI (optional)

Only needed for the [optional fee-estimation walkthrough](#optional-estimate-a-transaction-fee) at the end of this tutorial, which uses the older, single-circuit `contracts/verifier` and needs a funded Testnet account. The main tutorial below does not need it — the registry's `verify_proof` requires no auth, so it's checked with a read-only simulation call, not a signed transaction.

```bash
cargo install --locked stellar-cli
stellar --version
# should print stellar x.x.x
```

---

## Step 1 — Clone the Repository

```bash
git clone https://github.com/yusufadeagbo/zksoroban.git
cd zksoroban
```

---

## Step 2 — Install Dependencies

Install the SDK dependencies first, then the demo dependencies.

```bash
cd sdk
npm install
cd ..

cd demo
npm install
cd ..
```

Expected output for each: a list of resolved packages with no errors.

---

## Step 3 — Compile the Circuit

The circuit describes the ZK statement: `Poseidon(secret) == commitment`. You need to compile it to a `.wasm` file that the prover can execute.

```bash
cd circuits/poseidon_preimage
circom circuit.circom --r1cs --wasm --sym -o build -l ../../demo/node_modules
cd ../..
```

Expected output:

```
template instances: 2
non-linear constraints: 1
linear constraints: 0
public inputs: 1
private inputs: 1
public outputs: 0
wires: 4
labels: 9
Written successfully: build/circuit.r1cs
Written successfully: build/circuit.sym
Written successfully: build/circuit_js/circuit.wasm
Everything went okay
```

Verify the `.wasm` was created:

```bash
ls circuits/poseidon_preimage/build/circuit_js/circuit.wasm
```

---

## Step 4 — Run the Demo

No funded Testnet account or secret key needed: `contracts/registry`'s
`verify_proof` requires no auth, so the demo checks your proof with a
read-only simulation call, not a signed transaction.

```bash
cd demo
npm start
```

The script prompts you for a few things, then runs. Press **Enter** to
accept each default shown in brackets:

```
Secret value (decimal, or 'random'): 42
Network (testnet/mainnet) [testnet]:
Registry contract address [CDTPNARKKZCZ36PL4BNKBXZTT2BLVR373S2K5NCFAOKCPPY62ESRHSXH]:
Verbosity (quiet/normal/verbose) [normal]:
```

It then:

1. Computes your secret's Poseidon commitment.
2. Runs `snarkjs` to generate a Groth16 proof that `Poseidon(secret) == commitment`.
3. Formats the proof into Soroban calldata.
4. Simulates a call to `contracts/registry`'s `verify_proof(id, ...)` — circuit ID `1`, `poseidon_preimage` — against the live Testnet deployment.
5. Runs the same check again with a mismatched public input, to show what a real rejection looks like.
6. Prints both results.

Expected output (abbreviated — the full script also prints a third
scenario showing a malformed-input rejection that never touches the
network):

```
commitment: 12326503012965816391338144612242952408728683609716147019497703475006801258307

=== Scenario 1: success — valid proof ===
✓ Proof verified on-chain: true

=== Scenario 2: failure — valid proof, wrong public input ===
✓ Proof verified on-chain: false
```

The exact `secret` and `commitment` values will differ each run (unless
you typed a fixed secret like `42` above, as shown here). Scenario 1's
line must read `✓ Proof verified on-chain: true`; Scenario 2's must read
`✓ Proof verified on-chain: false` — a wrong public input is a correct
rejection, not an error. See [`demo/README.md`](../demo/README.md) for
the full transcript, all three scenarios, and what each one demonstrates.

---

## Troubleshooting

### Error: `ENOENT: no such file or directory, open '…/build/circuit_js/circuit.wasm'`

The circuit has not been compiled yet, or the build output is missing.

Run Step 3 again:

```bash
cd circuits/poseidon_preimage
circom circuit.circom --r1cs --wasm --sym -o build -l ../../demo/node_modules
cd ../..
```

Make sure `circom` is installed and on your `PATH` (`circom --version`). If the `build/` directory was created but the `.wasm` is missing, delete `build/` and re-run the command.

---

### Error: network timeout or `fetch failed` connecting to RPC

The RPC URL may be wrong, or the Testnet RPC endpoint is temporarily unavailable.

Verify the URL is exactly:

```
https://soroban-testnet.stellar.org
```

Test connectivity:

```bash
curl -s https://soroban-testnet.stellar.org -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth","params":{}}' \
  | head -c 200
```

Expected: a JSON response containing `"status":"healthy"`. If the endpoint is down, check [Stellar Status](https://status.stellar.org) and try again later.

---

## What Just Happened?

The line `✓ Proof verified on-chain: true` means `contracts/registry` looked up the verifying key registered under circuit ID `1` (`poseidon_preimage`) and ran a BN254 pairing check using your proof points against it — and the math checked out. The contract never learned your secret, only that `Poseidon(secret) == commitment` is true.

For more background on how ZK proofs work and why Stellar Protocol 25 makes this possible, see [docs/zk-primer.md](./zk-primer.md).

For the byte-level encoding spec for proof calldata, see [docs/proof-format.md](./proof-format.md).

For how `contracts/registry` supports multiple circuits, and why it's what this tutorial (and `demo/`) target instead of the older, single-circuit `contracts/verifier`, see [docs/architecture.md](./architecture.md#verifying-key-registry).

---

## Optional: Estimate a Transaction Fee

Everything above uses `contracts/registry`, which needs no auth and is checked with a free simulation call — there's no transaction fee to speak of. `demo/src/estimateFee.ts` is a separate, standalone script that demonstrates the fee-aware flow (`estimateVerifyFee` then `verifyOnChain`) against the older, single-circuit `contracts/verifier`, which *does* require a signed, fee-paying transaction. It's optional — skip this if you only wanted to verify your first proof.

Generate and fund a Testnet keypair:

```bash
stellar keys generate --global demo-key --network testnet
stellar keys address demo-key
# prints your public key (starts with G)

curl "https://friendbot.stellar.org?addr=<YOUR_PUBLIC_KEY>"
# expect a JSON response containing "successful": true

stellar account details --account <YOUR_PUBLIC_KEY> --network testnet
# should show a balance of 10,000 XLM
```

Export the secret key `estimateFee.ts` reads (`stellar keys show demo-key` prints it, starting with `S`):

```bash
export SOROBAN_SECRET_KEY=S<your-secret-key>
```

Run it:

```bash
cd demo
npm run estimate-fee
```

Expected output:

```
secret: 12345678901234567890123456789012345678901234567
commitment: 7891234567890123456789012345678901234567890
generating proof...

=== Step 1: estimate the fee (simulateTransaction — nothing submitted) ===
estimated fee: 0.0001234 XLM (1234 stroops)

=== Step 2: submit the real transaction ===
txHash: 020bf0bf7a05e92efa2188f2f0b74e474f06a03a9a84b4042b159219bdb8ede6
actual fee charged: 100 stroops
✓ Proof verified on-chain: true
```

If it fails with `Missing required environment variable: SOROBAN_SECRET_KEY`, the export above didn't take — check `echo $SOROBAN_SECRET_KEY` prints a non-empty value. If it fails with `HostError: … insufficient balance`, re-fund via Friendbot and wait a few seconds for the funding transaction to confirm before retrying.
