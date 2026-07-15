# 2-of-3 Threshold Proof Circuit

This circuit proves that at least 2 of 3 registered members approved a message, without revealing which members signed.

It proves knowledge of private keys for at least 2 of the 3 public commitments:

```text
sum(active) >= 2
AND  for every active signer i:  Poseidon(key_i) == commitment_i
```

The verifier learns the message hash and the three public commitments. They learn that a quorum of 2 was reached, but not which 2 members it was.

## Inputs

Private:

- `key0`, `key1`, `key2`: the secret key of each member (a dummy value, e.g. `0`, is supplied for members that are not signing)
- `active[3]`: one boolean flag per member, `1` if that member is signing, `0` otherwise

Public:

- `messageHash`: the message being approved
- `commitment0`, `commitment1`, `commitment2`: `Poseidon(key_i)` for each registered member

## The Construction

### Boolean activation flags

Each `active[i]` is constrained to be 0 or 1:

```text
active[i] * (active[i] - 1) === 0
```

### Threshold check

A `GreaterEqThan(3)` comparator enforces that the number of active signers is at least 2:

```text
GreaterEqThan(3)(active[0] + active[1] + active[2], 2).out === 1
```

### Conditional commitment opening

The key insight is a **selector-gated equality**. For each member:

```text
active[i] * (Poseidon(key_i) - commitment_i) === 0
```

- When `active[i] == 1`, the factor `(Poseidon(key_i) - commitment_i)` must be zero, so the prover must know a `key_i` whose Poseidon hash equals the published `commitment_i`.
- When `active[i] == 0`, the whole product is zero regardless of `key_i`, so no knowledge of that member's key is required and any dummy value passes.

This lets the prover demonstrate knowledge of any 2 of the 3 keys while the inactive slot imposes no constraint.

### Message binding

`messageHash` is folded into the constraint system (`mhSquared <== messageHash * messageHash`) and exposed as a public input, so each proof is bound to a specific message via the Groth16 public-input commitment. A proof produced for one message hash will not verify against another.

## Privacy Properties

- **Signer anonymity:** `active[3]` is private. The public signals reveal only the three commitments and the message — not the activation vector — so an observer cannot tell which 2 members signed.
- **Key secrecy:** keys never leave the prover. Only Poseidon commitments are public.
- **Quorum soundness:** the threshold comparator guarantees the proof cannot be produced with fewer than 2 valid openings.
- **Limits:** this is a knowledge-of-preimage scheme, not a signature scheme. It proves keys were known at proving time; it does not bind a specific signer identity to the message beyond the shared `messageHash` public input. Arbitrary k-of-n, on-chain key registries, and ECDSA compatibility are out of scope.

## Constraint Count

From `circom`:

```text
non-linear constraints: 659
linear constraints:     602
public inputs:          4
private inputs:         6
wires:                  1264
```

Most of the cost is the three `Poseidon(1)` instances (~213 each); the comparator and selector gates are comparatively small.

## Files

- `circuit.circom`: the Circom circuit
- `input_example.json`: sample input with 2 active signers (members 0 and 1)
- `setup/circuit.zkey`: testnet-only proving key
- `setup/verification_key.json`: verifying key exported from the same setup
- `fixtures/proof.json`, `fixtures/public.json`: a passing snarkjs proof fixture with 2 active signers

## Compiling

Install the demo dependencies once so `circomlib` is available:

```bash
cd ../../demo && npm install && cd ../circuits/threshold_2of3
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
