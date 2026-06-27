import { randomBytes } from "node:crypto";
import path from "node:path";

import { Keypair, Networks } from "@stellar/stellar-sdk";

import { ProofBundle, poseidon, verifyOnChain } from "@zksoroban/sdk";

const snarkjs: any = require("snarkjs");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function randomSecret(): bigint {
  return BigInt(`0x${randomBytes(31).toString("hex")}`);
}

async function main(): Promise<void> {
  const rpcUrl = requireEnv("SOROBAN_RPC_URL");
  const contractId = requireEnv("SOROBAN_CONTRACT_ID");
  const secretKey = requireEnv("SOROBAN_SECRET_KEY");

  const circuitDir = path.resolve(__dirname, "../../circuits/poseidon_preimage");
  const wasmPath = path.join(circuitDir, "build/circuit_js/circuit.wasm");
  const zkeyPath = path.join(circuitDir, "setup/circuit.zkey");

  const secret = randomSecret();
  const commitment = poseidon([secret]);

  const input = {
    secret: secret.toString(),
    commitment: commitment.toString()
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
  const bundle: ProofBundle = {
    proof,
    publicSignals,
    circuit: "poseidon_preimage",
    generatedAt: new Date().toISOString(),
    networkPassphrase: Networks.TESTNET
  };

  console.log(`circuit: ${bundle.circuit}`);
  console.log(`generatedAt: ${bundle.generatedAt}`);

  const result = await verifyOnChain({
    rpcUrl,
    contractId,
    keypair: Keypair.fromSecret(secretKey),
    bundle
  });

  console.log(`secret: ${secret.toString()}`);
  console.log(`commitment: ${commitment.toString()}`);
  console.log(`txHash: ${result.txHash}`);
  console.log(`ledger: ${result.ledger}`);
  console.log(`fee: ${result.fee}`);
  console.log(`✓ Proof verified on-chain: ${result.verified}`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
