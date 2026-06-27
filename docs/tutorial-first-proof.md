# Tutorial: Verify Your First ZK Proof on Stellar

This tutorial walks you through generating and verifying a zero-knowledge proof on Stellar Testnet — from a fresh clone to seeing:

```
✓ Proof verified on-chain: true
```

No prior ZK knowledge is required.

---

## What You Will Build

You will prove that you know a secret number whose Poseidon hash equals a public commitment — without ever revealing the secret. The Soroban verifier contract on Testnet will check the proof and return `true`.

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

### Stellar CLI

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

## Step 4 — Fund a Testnet Account

You need a Stellar Testnet keypair with XLM to pay transaction fees.

Generate a new keypair:

```bash
stellar keys generate --global demo-key --network testnet
```

Display the secret key:

```bash
stellar keys show demo-key
```

Copy the secret key (it starts with `S`). Fund the account using Friendbot:

```bash
stellar keys address demo-key
# prints your public key (starts with G)

curl "https://friendbot.stellar.org?addr=<YOUR_PUBLIC_KEY>"
```

Expected Friendbot response: a JSON object containing `"successful": true` inside the envelope.

Verify the balance:

```bash
stellar account details --account <YOUR_PUBLIC_KEY> --network testnet
# should show a balance of 10,000 XLM
```

---

## Step 5 — Configure Environment Variables

Copy the example env file:

```bash
cp demo/.env.example demo/.env
```

Open `demo/.env` and fill in your secret key:

```
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
SOROBAN_CONTRACT_ID=CBL6MAWJALQP25LYKUUOC34K464XPSF6BLKUW6MXZDEXEDXMQUSP7HNN
SOROBAN_SECRET_KEY=S<your-secret-key-here>
```

Or export the variables in your shell directly:

```bash
export SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
export SOROBAN_CONTRACT_ID=CBL6MAWJALQP25LYKUUOC34K464XPSF6BLKUW6MXZDEXEDXMQUSP7HNN
export SOROBAN_SECRET_KEY=S<your-secret-key>
```

---

## Step 6 — Run the Demo

```bash
cd demo
npm start
```

The script will:

1. Generate a random secret.
2. Compute its Poseidon commitment.
3. Run `snarkjs` to generate a Groth16 proof.
4. Format the proof into Soroban calldata.
5. Submit a transaction to the verifier contract on Testnet.
6. Print the result.

Expected output:

```
secret: 12345678901234567890123456789012345678901234567
commitment: 7891234567890123456789012345678901234567890
txHash: 020bf0bf7a05e92efa2188f2f0b74e474f06a03a9a84b4042b159219bdb8ede6
ledger: 1234567
fee: 100
✓ Proof verified on-chain: true
```

The exact `secret`, `commitment`, `txHash`, and `ledger` values will differ each run. The final line must read `✓ Proof verified on-chain: true`.

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

### Error: `Missing required environment variable: SOROBAN_RPC_URL` (or `SOROBAN_CONTRACT_ID` / `SOROBAN_SECRET_KEY`)

One or more environment variables were not set before running the demo.

Check that all three are exported:

```bash
echo $SOROBAN_RPC_URL
echo $SOROBAN_CONTRACT_ID
echo $SOROBAN_SECRET_KEY
```

Each should print a non-empty value. If you are using `demo/.env`, make sure you ran `cp demo/.env.example demo/.env` and filled in `SOROBAN_SECRET_KEY`. Note: variables in a `.env` file are not automatically exported to the shell; the demo script reads them directly from the environment. Export them with `export VAR=value` or use a tool like `dotenv` to load them.

---

### Error: `HostError: … insufficient balance` or transaction fails with fee error

Your Testnet account has no XLM.

Fund it again via Friendbot:

```bash
curl "https://friendbot.stellar.org?addr=<YOUR_PUBLIC_KEY>"
```

Verify the balance before re-running:

```bash
stellar account details --account <YOUR_PUBLIC_KEY> --network testnet
```

Wait a few seconds for the funding transaction to be confirmed before running the demo.

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

The final line `✓ Proof verified on-chain: true` means the Soroban verifier contract ran a BN254 pairing check using your proof points and the embedded verifying key — and the math checked out. The contract never learned your secret, only that `Poseidon(secret) == commitment` is true.

For more background on how ZK proofs work and why Stellar Protocol 25 makes this possible, see [docs/zk-primer.md](./zk-primer.md).

For the byte-level encoding spec for proof calldata, see [docs/proof-format.md](./proof-format.md).
