# Merkle Inclusion Circuit

This circuit proves that a leaf is included in a depth-20 Poseidon Merkle tree without revealing the leaf or its sibling path.

It proves knowledge of a private `leaf` and a Merkle authentication path such that:

```text
root == MerkleProof(leaf, pathElements, pathIndices)
```

where each parent node is `Poseidon(left, right)`.

## Inputs

Private:

- `leaf`: the committed leaf value
- `pathElements[20]`: the sibling hash at each level, from leaf to root
- `pathIndices[20]`: the position of the current node at each level (`0` = left, `1` = right)

Public:

- `root`: the Merkle root the proof is checked against

## How the Circuit Works

At each of the 20 levels, a `DualMux` orders the current hash and its sibling according to `pathIndices[i]`, then `Poseidon(2)` hashes the ordered pair to produce the parent. The final computed hash is constrained to equal the public `root`. Each `pathIndices[i]` is constrained to be boolean.

## Files

- `circuit.circom`: the Circom circuit
- `input_example.json`: a sample input with a precomputed root
- `generate_witness.sh`: helper to compute a witness from an input file
- `setup/circuit.zkey`: testnet-only proving key
- `setup/verification_key.json`: verifying key exported from the same setup
- `fixtures/proof.json`, `fixtures/public.json`: a passing snarkjs proof fixture

## Compiling

Install the demo dependencies once so `circomlib` is available:

```bash
cd ../../demo && npm install && cd ../circuits/merkle_inclusion
```

Compile the circuit:

```bash
mkdir -p build
circom circuit.circom --r1cs --wasm --sym -o build -l ../../demo/node_modules
```

## Generating a Witness

```bash
./generate_witness.sh input_example.json build/witness.wtns
```

## Trusted Setup

The circuit has roughly 10,400 constraints, so the powers-of-tau ceremony needs power 14.

```bash
SNARKJS=../../demo/node_modules/.bin/snarkjs

$SNARKJS powersoftau new bn128 14 setup/pot14_0000.ptau -v
$SNARKJS powersoftau contribute setup/pot14_0000.ptau setup/pot14_0001.ptau --name="first" -v
$SNARKJS powersoftau prepare phase2 setup/pot14_0001.ptau setup/pot14_final.ptau -v

$SNARKJS groth16 setup build/circuit.r1cs setup/pot14_final.ptau setup/circuit_0000.zkey
$SNARKJS zkey contribute setup/circuit_0000.zkey setup/circuit.zkey --name="first contribution" -v
$SNARKJS zkey export verificationkey setup/circuit.zkey setup/verification_key.json
```

## Generating and Verifying a Proof

```bash
$SNARKJS groth16 fullprove input_example.json build/circuit_js/circuit.wasm setup/circuit.zkey fixtures/proof.json fixtures/public.json
$SNARKJS groth16 verify setup/verification_key.json fixtures/public.json fixtures/proof.json
```

## Important Note

The files in `setup/` are testnet-only reference artifacts produced by a single-contributor ceremony. They are suitable for reproducing the demo and tests in this repository, but they are not production ceremony outputs and must not be used to back an application handling real value.
