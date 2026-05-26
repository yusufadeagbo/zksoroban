# Proof Format Specification

This document defines the exact byte encoding used by `zksoroban` between `snarkjs`, the TypeScript SDK, and the Soroban verifier contract.

The goal is interoperability. Any client in any language can submit a compatible proof if it follows this format exactly.

## Contract Interface

The verifier contract entrypoint is:

```text
verify_proof(
  proof_a: Bytes,
  proof_b: Bytes,
  proof_c: Bytes,
  public_inputs: Vec<BytesN<32>>
) -> bool
```

The contract expects:

- `proof_a`: 64 bytes
- `proof_b`: 128 bytes
- `proof_c`: 64 bytes
- `public_inputs[i]`: exactly 32 bytes each

If any proof byte length is wrong, the contract panics during parsing. If the number of public inputs is wrong, the contract returns `false`.

## Field and Curve Context

The proof system is Groth16 over BN254.

- G1 points are affine points over the BN254 base field `Fq`
- G2 points are affine points over the quadratic extension field `Fq2`
- public inputs are BN254 scalar field elements `Fr`

The SDK treats all public inputs as unsigned integers encoded as 32-byte big-endian values.

## `snarkjs` Input Shape

The SDK accepts the standard `snarkjs` proof structure:

```ts
interface SnarkjsProof {
  pi_a: [string, string, string]
  pi_b: [[string, string], [string, string], [string, string]]
  pi_c: [string, string, string]
  protocol: "groth16"
}
```

For Groth16 on BN254:

- `pi_a = [ax, ay, "1"]`
- `pi_b = [[bx.c0, bx.c1], [by.c0, by.c1], ["1", "0"]]`
- `pi_c = [cx, cy, "1"]`

All coordinates are decimal strings in the `snarkjs` JSON format.

## G1 Encoding

G1 points are encoded as:

```text
x || y
```

where:

- `x` is a 32-byte big-endian encoding of the affine x-coordinate
- `y` is a 32-byte big-endian encoding of the affine y-coordinate

Total length:

```text
32 + 32 = 64 bytes
```

In the SDK this is:

```text
proofA = be32(pi_a[0]) || be32(pi_a[1])
proofC = be32(pi_c[0]) || be32(pi_c[1])
```

## G2 Encoding

The subtle part is G2.

`snarkjs` exposes an `Fq2` value as two decimal strings `[c0, c1]`. The Soroban verifier expects each `Fq2` element serialized in the order:

```text
c1 || c0
```

Each coefficient is still 32-byte big-endian.

For a G2 point `(x, y)`, the final layout is:

```text
x.c1 || x.c0 || y.c1 || y.c0
```

Total length:

```text
32 + 32 + 32 + 32 = 128 bytes
```

Given:

```text
pi_b = [
  [bx.c0, bx.c1],
  [by.c0, by.c1],
  ["1", "0"]
]
```

the SDK computes:

```text
proofB =
  be32(bx.c1) ||
  be32(bx.c0) ||
  be32(by.c1) ||
  be32(by.c0)
```

This ordering is non-negotiable. Reversing it produces an invalid proof at the contract boundary.

## Public Input Encoding

Each public input is encoded independently as a 32-byte big-endian field element:

```text
publicInputs[i] = be32(publicSignals[i])
```

The contract currently expects exactly one public input for the reference Poseidon preimage circuit.

For the reference example:

```text
commitment =
18586133768512220936620570745912940619677854269274689475585506675881198879027
```

its byte encoding is:

```text
29176100eaa962bdc1fe6c654d6a3c130e96a4d1168b33848b897dc502820133
```

## Size Summary

The serialized calldata sizes are:

- `proofA`: 64 bytes
- `proofB`: 128 bytes
- `proofC`: 64 bytes
- `publicInputs[i]`: 32 bytes each

Total proof bytes excluding public input vector overhead:

```text
64 + 128 + 64 = 256 bytes
```

## Reference Example

Reference proof bytes used by the current Testnet verifier:

```text
proofA =
1c9f4896deda7ee2355d0450495c287824c2d7a7273526cb4e379a2bb7331bef2774e1ccdf712d4b913fa2fb73a9e9d3c411325f0a606457672dde2e164feccf

proofB =
012a0542a3eb25f9dd3b1c1a1c8dde882c7d39cdaeab789ed7052598802f6db30ac39707cbd15b1dd86963d88639f9263f1c3d10edb06a3b6a7f8496adf91827252a07f51df2b1b6aa65162f17933bfaa2245f427a024b1abc76654a2fc1ffa80b743e4f2c12b5c36eff491f6343c52b1d979dd222f786261f170403314d1b0d

proofC =
11c9db1a44293dd937839d0b271f95fbe7ac78df2331560beed6a29803aac9190c3780eb59106c3791d39969fca352f41f146690cda50d1c3c80c5def64501de

publicInput[0] =
29176100eaa962bdc1fe6c654d6a3c130e96a4d1168b33848b897dc502820133
```

## Validation Rules

A conforming client should enforce:

- proof object uses protocol `"groth16"`
- `pi_a`, `pi_b`, and `pi_c` have the expected tuple lengths
- every coordinate parses as a non-negative integer
- every coordinate and public input fits in the relevant BN254 field
- encoded lengths are exact

That is what `sdk/src/proof.ts` does today.

## Soroban-Side Parsing

The contract parses:

- `proof_a` into `Bn254G1Affine`
- `proof_b` into `Bn254G2Affine`
- `proof_c` into `Bn254G1Affine`
- `public_inputs[0]` into `Fr`

It then computes:

```text
vk_x = IC[0] + IC[1] * public_input
```

and checks the Groth16 pairing equation with the hardcoded verifying key constants.

## Canonical Test Vectors

[`sdk/test/vectors.json`](../sdk/test/vectors.json) is the canonical interoperability reference for this format. It contains 12 test cases covering:

- the reference Testnet proof
- edge cases: zero coordinates, all-ones coordinates, max scalar field value (`Fr - 1`), max accepted coordinate value (`Fr - 1`)
- public input variants: zero, one, large mid-range value, `0x`-prefixed hex string, two inputs
- G2 structural variants: `c1 = 0` (element lies in base field), near-max coordinates

Each entry has the shape:

```json
{
  "id": "reference",
  "description": "reference Testnet proof",
  "snarkjsProof": { "pi_a": [...], "pi_b": [...], "pi_c": [...], "protocol": "groth16" },
  "publicSignals": ["..."],
  "expectedCalldata": {
    "proofA": "<128 hex chars>",
    "proofB": "<256 hex chars>",
    "proofC": "<128 hex chars>",
    "publicInputs": ["<64 hex chars>", ...]
  }
}
```

An SDK implementation in any language is considered compatible if it produces byte-identical `expectedCalldata` for every vector. The TypeScript SDK verifies this in `sdk/test/vectors.test.ts`.

To regenerate the vectors after changing the encoding logic:

```sh
cd sdk
node_modules/.bin/tsx test/gen-vectors.ts > test/vectors.json
```

## Interoperability Checklist

If another implementation wants to interoperate with this verifier, it must:

1. use the same circuit
2. use the same trusted setup artifacts and verifying key
3. encode G1 points as `x || y`
4. encode G2 points as `x.c1 || x.c0 || y.c1 || y.c0`
5. encode public inputs as 32-byte big-endian field elements
6. submit calldata in the exact contract argument order

If any one of those steps differs, the proof will fail on-chain even if the off-chain prover reports success.
