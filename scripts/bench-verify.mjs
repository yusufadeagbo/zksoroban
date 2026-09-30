#!/usr/bin/env node
/**
 * Testnet proof verification benchmark.
 *
 * Submits N proofs via the SDK's verifyOnChain, collects fee/latency per call,
 * and writes a CSV file plus prints a summary table (min, median, p95, max).
 *
 * Required env vars:
 *   SOROBAN_SECRET_KEY            - funded Testnet secret key
 *   SOROBAN_VERIFIER_CONTRACT_ID  - deployed contracts/verifier instance
 *
 * Optional env vars:
 *   BENCH_N                       - number of calls (default 20)
 *   BENCH_OUTPUT_CSV              - output CSV path (default ./bench-results.csv)
 *   BENCH_RPC_URL                 - RPC endpoint (default Testnet)
 */

import { Keypair, rpc } from "@stellar/stellar-sdk";
import { formatProof, verifyOnChain } from "../sdk/dist/index.mjs";
import * as fs from "node:fs";

const secretKey = process.env.SOROBAN_SECRET_KEY;
const contractId = process.env.SOROBAN_VERIFIER_CONTRACT_ID;
const n = parseInt(process.env.BENCH_N || "20", 10);
const rpcUrl = process.env.BENCH_RPC_URL || "https://soroban-testnet.stellar.org";
const outputCsvPath = process.env.BENCH_OUTPUT_CSV || "./bench-results.csv";

if (!secretKey) {
  console.error("SOROBAN_SECRET_KEY is required");
  process.exit(1);
}
if (!contractId) {
  console.error("SOROBAN_VERIFIER_CONTRACT_ID is required");
  process.exit(1);
}

const keypair = Keypair.fromSecret(secretKey);
const server = new rpc.Server(rpcUrl);

// Reference proof + public signal from the repo's test fixtures.
const VALID_PROOF_A_HEX =
  "1c9f4896deda7ee2355d0450495c287824c2d7a7273526cb4e379a2bb7331bef2774e1ccdf712d4b913fa2fb73a9e9d3c411325f0a606457672dde2e164feccf";
const VALID_PROOF_B_HEX =
  "012a0542a3eb25f9dd3b1c1a1c8dde882c7d39cdaeab789ed7052598802f6db30ac39707cbd15b1dd86963d88639f9263f1c3d10edb06a3b6a7f8496adf91827252a07f51df2b1b6aa65162f17933bfaa2245f427a024b1abc76654a2fc1ffa80b743e4f2c12b5c36eff491f6343c52b1d979dd222f786261f170403314d1b0d";
const VALID_PROOF_C_HEX =
  "11c9db1a44293dd937839d0b271f95fbe7ac78df2331560beed6a29803aac9190c3780eb59106c3791d39969fca352f41f146690cda50d1c3c80c5def64501de";
const VALID_PUBLIC_INPUT_HEX =
  "29176100eaa962bdc1fe6c654d6a3c130e96a4d1168b33848b897dc502820133";

function hexToBigInt(hex) {
  return BigInt("0x" + hex);
}

function g1FromHex(hex) {
  return [
    hexToBigInt(hex.slice(0, 64)).toString(),
    hexToBigInt(hex.slice(64, 128)).toString(),
    "1"
  ];
}

function g2FromHex(hex) {
  return [
    [
      hexToBigInt(hex.slice(64, 128)).toString(),
      hexToBigInt(hex.slice(0, 64)).toString()
    ],
    [
      hexToBigInt(hex.slice(192, 256)).toString(),
      hexToBigInt(hex.slice(128, 192)).toString()
    ],
    ["1", "0"]
  ];
}

const VALID_SNARKJS_PROOF = {
  pi_a: g1FromHex(VALID_PROOF_A_HEX),
  pi_b: g2FromHex(VALID_PROOF_B_HEX),
  pi_c: g1FromHex(VALID_PROOF_C_HEX),
  protocol: "groth16"
};

const VALID_PUBLIC_SIGNALS = [hexToBigInt(VALID_PUBLIC_INPUT_HEX).toString()];

const results = [];
for (let i = 0; i < n; i++) {
  // Fetch a fresh expiry ledger each iteration so proofs don't expire mid-benchmark.
  const { sequence } = await server.getLatestLedger();
  const expiryLedger = sequence + 10000;

  const calldata = formatProof(VALID_SNARKJS_PROOF, VALID_PUBLIC_SIGNALS, expiryLedger);

  const start = Date.now();
  const result = await verifyOnChain({
    rpcUrl,
    contractId,
    keypair,
    calldata
  });
  const latencyMs = Date.now() - start;

  results.push({
    txHash: result.txHash,
    ledger: result.ledger,
    fee: result.fee,
    latencyMs
  });

  console.log(
    `[${i + 1}/${n}] tx=${result.txHash.slice(0, 12)}... ` +
    `ledger=${result.ledger} fee=${result.fee} stroops latency=${latencyMs}ms`
  );
}

// Write CSV
const csvBody = results
  .map((r) => `${r.txHash},${r.ledger},${r.fee},${r.latencyMs}`)
  .join("\n") + "\n";
fs.writeFileSync(outputCsvPath, "tx_hash,ledger,fee,latency_ms\n" + csvBody);

// Summary
const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
const fees = results.map((r) => parseInt(r.fee, 10)).sort((a, b) => a - b);

function percentile(arr, p) {
  const idx = Math.ceil(arr.length * p) - 1;
  return arr[Math.max(0, idx)];
}

console.log("\n=== Benchmark Summary ===");
console.log(`Total calls:        ${results.length}`);
console.log(`Latency (ms):`);
console.log(`  min:              ${latencies[0]}`);
console.log(`  median (p50):     ${percentile(latencies, 0.5)}`);
console.log(`  p95:              ${percentile(latencies, 0.95)}`);
console.log(`  max:              ${latencies[latencies.length - 1]}`);
console.log(`Fee (stroops):`);
console.log(`  min:              ${fees[0]}`);
console.log(`  median (p50):     ${percentile(fees, 0.5)}`);
console.log(`  p95:              ${percentile(fees, 0.95)}`);
console.log(`  max:              ${fees[fees.length - 1]}`);
console.log(`\nResults written to ${outputCsvPath}`);