# zksoroban

The first developer SDK and reference verifier contract for zero-knowledge proofs on Stellar, built on Protocol 25's native BN254 and Poseidon host functions.

Testnet verifier contract:
`CBL6MAWJALQP25LYKUUOC34K464XPSF6BLKUW6MXZDEXEDXMQUSP7HNN`

## Quick Start

1. Install prerequisites: Node.js 22+, Rust, Stellar CLI, and `circom`.
2. Fund a Testnet account and export a secret key:
   `export SOROBAN_SECRET_KEY=...`
3. In `sdk/`, install dependencies and run the SDK tests:
   `npm install && npm test`
4. In `demo/`, install dependencies and export:
   `export SOROBAN_RPC_URL=https://soroban-testnet.stellar.org`
   `export SOROBAN_CONTRACT_ID=CBL6MAWJALQP25LYKUUOC34K464XPSF6BLKUW6MXZDEXEDXMQUSP7HNN`
5. Run the end-to-end demo:
   `npx ts-node src/run.ts`

Expected result:
`✓ Proof verified on-chain: true`

## What This Repo Contains

- `contracts/verifier/`: a Soroban verifier contract for a Groth16 proof over BN254.
- `sdk/`: a TypeScript SDK for Poseidon hashing, snarkjs proof formatting, and on-chain verification.
- `circuits/poseidon_preimage/`: the reference Poseidon preimage circuit plus testnet-only setup artifacts.
- `demo/`: an end-to-end script that generates a fresh secret, proves knowledge of its Poseidon commitment, and verifies it on Stellar Testnet.
- `docs/`: architecture notes, ZK primer, proof format specification, and Poseidon parameter notes.

## Architecture

```text
User secret
   |
   v
Poseidon(secret) -> commitment
   |
   v
circom + snarkjs
generate Groth16 proof
   |
   v
SDK formatProof()
encodes proofA / proofB / proofC / publicInputs
   |
   v
SDK verifyOnChain()
submits Soroban transaction
   |
   v
Verifier contract
reconstructs vk_x and runs BN254 pairing check
   |
   v
bool result on-chain
```

## Reference Flow

The reference circuit exposes one public input, `commitment`, and one private input, `secret`. The prover shows that `Poseidon(secret) == commitment` without revealing `secret`. The contract is stateless and only returns a boolean, which keeps the MVP easy to audit and inexpensive to call.

## Repository Status

- Phase 0: foundation complete
- Phase 1: verifier contract deployed and resource-gated
- Phase 2: SDK complete with Testnet integration tests
- Phase 3: reference circuit, setup artifacts, and demo complete
- Phase 4: documentation and submission polish complete

## Testnet Proof

- Contract address:
  `CBL6MAWJALQP25LYKUUOC34K464XPSF6BLKUW6MXZDEXEDXMQUSP7HNN`
- Example successful demo transaction:
  `020bf0bf7a05e92efa2188f2f0b74e474f06a03a9a84b4042b159219bdb8ede6`

## verifyOffChain vs verifyOnChain

The SDK exposes two verification helpers.

**`verifyOffChain(proof, publicSignals, verificationKey)`** runs Groth16 verification locally using `snarkjs`. It does not touch the network, costs no fees, and returns in milliseconds. Use it during development to confirm that proof generation worked before submitting a transaction — this catches bad proofs, encoding mismatches, or wrong circuit parameters without spending Testnet or Mainnet funds.

```ts
import { verifyOffChain } from "@zksoroban/sdk";
import vk from "../circuits/poseidon_preimage/setup/verification_key.json";

const valid = await verifyOffChain(proof, publicSignals, vk);
if (!valid) throw new Error("Proof invalid — will not submit");
```

**`verifyOnChain(opts)`** submits a Soroban transaction to the deployed verifier contract. Use it when you need an on-chain record of verification or are building a dApp that depends on the contract's return value. It requires an RPC endpoint, a funded keypair, and pays a small transaction fee.

A typical workflow is to call `verifyOffChain` first and only proceed to `verifyOnChain` once the local check passes.

## Notes

- The setup artifacts in `circuits/poseidon_preimage/setup/` are testnet-only and non-production.
- The verifier currently hardcodes one circuit's verifying key.
- The contract is intentionally stateless; nullifiers and key registries are future extensions, not MVP scope.

See [docs/zk-primer.md](https://github.com/yusufadeagbo/zksoroban/blob/main/docs/zk-primer.md) and [docs/proof-format.md](https://github.com/yusufadeagbo/zksoroban/blob/main/docs/proof-format.md) for the detailed background and byte-level interoperability spec.
