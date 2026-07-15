# Range Proof Circuit

This circuit proves that a private `secret` lies within a public inclusive range `[min, max]`, while only revealing a Poseidon commitment to the secret.

It proves knowledge of a private `secret` such that:

```text
min <= secret <= max   AND   Poseidon(secret) == commitment
```

The verifier learns `min`, `max`, and the commitment. They do not learn `secret`, only that it falls in the stated range.

## Inputs

Private:

- `secret`: the value being range-checked
- `secret_bits[64]`: the bit decomposition of `secret`, supplied as a witness

Public:

- `min`: inclusive lower bound
- `max`: inclusive upper bound
- `commitment`: `Poseidon(secret)`

## The Bit Decomposition Technique

The BN254 scalar field has no native "less than" operator, so comparisons are built from bit decomposition.

The circuit takes `secret_bits[64]` as an explicit witness and enforces two things:

1. **Each entry is boolean.** `secret_bits[i] * (secret_bits[i] - 1) === 0` forces every value to be 0 or 1.
2. **The bits reconstruct the secret.** The linear combination `Σ secret_bits[i] * 2^i === secret` ties the bits to `secret` and proves `0 <= secret < 2^64`.

A valid 64-bit decomposition bounds `secret` to a known field range, which is what makes the subsequent comparisons sound. Without the bound, field wraparound would let an attacker satisfy a comparison with an out-of-range value.

The two range comparisons use circomlib's `LessEqThan(64)`:

- `LessEqThan(64)(min, secret).out === 1` enforces `secret >= min`
- `LessEqThan(64)(secret, max).out === 1` enforces `secret <= max`

`LessEqThan` itself works by checking the sign bit of the difference over 64 bits, which is why all inputs must be known to fit in 64 bits.

Finally, `Poseidon(secret) === commitment` binds the proof to a published commitment so the same range proof cannot be reused for a different secret.

## Constraint Count

From `circom`:

```text
non-linear constraints: 410
linear constraints:     208
public inputs:          3
private inputs:         65
wires:                  617
```

Breakdown:

- `Poseidon(1)`: ~213 non-linear constraints
- 64 boolean checks for the bit decomposition
- two `LessEqThan(64)` comparators for the bounds

## Files

- `circuit.circom`: the Circom circuit
- `input_example.json`: sample input (`secret = 25`, `min = 18`, `max = 100`)
- `setup/circuit.zkey`: testnet-only proving key
- `setup/verification_key.json`: verifying key exported from the same setup
- `fixtures/proof.json`, `fixtures/public.json`: a passing snarkjs proof fixture for `min=18, max=100, secret=25`

## Compiling

Install the demo dependencies once so `circomlib` is available:

```bash
cd ../../demo && npm install && cd ../circuits/range_proof
```

Compile the circuit:

```bash
mkdir -p build
circom circuit.circom --r1cs --wasm --sym -o build -l ../../demo/node_modules
```

## Trusted Setup

The circuit is small, so a power-12 powers-of-tau ceremony is sufficient.

```bash
SNARKJS=../../demo/node_modules/.bin/snarkjs

$SNARKJS powersoftau new bn128 12 setup/pot12_0000.ptau -v
$SNARKJS powersoftau contribute setup/pot12_0000.ptau setup/pot12_0001.ptau --name="first" -v
$SNARKJS powersoftau prepare phase2 setup/pot12_0001.ptau setup/pot12_final.ptau -v

$SNARKJS groth16 setup build/circuit.r1cs setup/pot12_final.ptau setup/circuit_0000.zkey
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
