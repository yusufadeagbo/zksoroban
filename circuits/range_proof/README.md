# Range Proof Circuit

This is the second reference circuit for `zksoroban`. It demonstrates that the SDK and tooling work for more than one statement type.

It proves knowledge of a private value `x` such that:

```text
0 <= x < 2^32   AND   Poseidon(x) == commitment
```

The verifier learns only the commitment. They do not learn `x`, only that `x` fits in 32 bits.

## Inputs

- private: `x`
- public: `commitment`

## Files

- `circuit.circom`: the Circom circuit
- `input_example.json`: sample input (`x = 42`)
- `setup/circuit.zkey`: testnet-only proving key
- `setup/verification_key.json`: verifying key exported from the same setup

## How the Range Constraint Works

The circuit uses circomlib's `Num2Bits(32)` template. This decomposes the input into 32 binary signals and asserts each signal is 0 or 1:

```circom
component bits = Num2Bits(32);
bits.in <== x;
```

Because `Num2Bits(n)` reconstructs the input from exactly `n` bits, the constraint `x = sum(bits[i] * 2^i)` for `i in 0..31` implicitly bounds `x` to the range `[0, 2^32 - 1]`. Any `x` outside that range cannot satisfy a 32-bit decomposition, so proof generation fails.

The Poseidon binding (`Poseidon(x) == commitment`) prevents the prover from substituting a different value than the one they committed to.

## Gate Count

From `circom`:

```text
non-linear constraints: 248
linear constraints:     200
public inputs:          1
private inputs:         1
wires:                  449
```

Breakdown:

- `Num2Bits(32)`: 32 boolean constraints (`b * (b - 1) = 0` for each bit) plus the linear sum check
- `Poseidon(1)`: ~213 non-linear constraints for the permutation
- the equality `commitment === hash.out`: 1 constraint

This is roughly 5x the constraint count of the poseidon_preimage circuit, which is expected because the bit decomposition contributes the additional non-linear work.

## Rebuilding the Artifacts

Install the demo dependencies once so `circomlib` is available:

```bash
cd ../../demo && npm install && cd ../circuits/range_proof
```

Compile the circuit:

```bash
mkdir -p build
circom circuit.circom --r1cs --wasm --sym -o build -l ../../demo/node_modules
```

Run a Groth16 trusted setup (powers of tau + circuit-specific phase 2):

```bash
SNARKJS=../../demo/node_modules/.bin/snarkjs

$SNARKJS powersoftau new bn128 12 setup/pot12_0000.ptau -v
$SNARKJS powersoftau contribute setup/pot12_0000.ptau setup/pot12_0001.ptau --name="first" -v
$SNARKJS powersoftau prepare phase2 setup/pot12_0001.ptau setup/pot12_final.ptau -v

$SNARKJS groth16 setup build/circuit.r1cs setup/pot12_final.ptau setup/circuit_0000.zkey
$SNARKJS zkey contribute setup/circuit_0000.zkey setup/circuit.zkey --name="first contribution" -v
$SNARKJS zkey export verificationkey setup/circuit.zkey setup/verification_key.json
```

Generate and verify a proof:

```bash
$SNARKJS groth16 fullprove input_example.json build/circuit_js/circuit.wasm setup/circuit.zkey proof.json public.json
$SNARKJS groth16 verify setup/verification_key.json public.json proof.json
```

## Important Note

The files in `setup/` are testnet-only reference artifacts. They were produced by a single-contributor ceremony intended only for reproducing the demo and tests in this repository. They are not production ceremony outputs and must not be used to back any application that handles real value.

## Future Work

This circuit currently shares the verifier contract with `poseidon_preimage` only in form — the deployed contract hardcodes the poseidon_preimage verifying key. Deploying a second verifier (or a registry of verifiers) is tracked separately and is out of scope for this circuit.
