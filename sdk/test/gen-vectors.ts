// Run: node_modules/.bin/tsx test/gen-vectors.ts > test/vectors.json
import { formatProof } from "../src/proof";

const Fr = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function bn(n: bigint): string { return n.toString(); }
function hex(n: bigint, len = 64): string { return n.toString(16).padStart(len, "0"); }
function h(s: string): bigint { return BigInt("0x" + s); }
function g1(x: bigint, y: bigint): [string, string, string] { return [bn(x), bn(y), "1"]; }
function g2(xc0: bigint, xc1: bigint, yc0: bigint, yc1: bigint): [[string,string],[string,string],[string,string]] {
  return [[bn(xc0), bn(xc1)], [bn(yc0), bn(yc1)], ["1", "0"]];
}

const REF_A = "1c9f4896deda7ee2355d0450495c287824c2d7a7273526cb4e379a2bb7331bef2774e1ccdf712d4b913fa2fb73a9e9d3c411325f0a606457672dde2e164feccf";
const REF_B = "012a0542a3eb25f9dd3b1c1a1c8dde882c7d39cdaeab789ed7052598802f6db30ac39707cbd15b1dd86963d88639f9263f1c3d10edb06a3b6a7f8496adf91827252a07f51df2b1b6aa65162f17933bfaa2245f427a024b1abc76654a2fc1ffa80b743e4f2c12b5c36eff491f6343c52b1d979dd222f786261f170403314d1b0d";
const REF_C = "11c9db1a44293dd937839d0b271f95fbe7ac78df2331560beed6a29803aac9190c3780eb59106c3791d39969fca352f41f146690cda50d1c3c80c5def64501de";
const REF_PUB = "29176100eaa962bdc1fe6c654d6a3c130e96a4d1168b33848b897dc502820133";

const cases = [
  { id: "reference", description: "reference Testnet proof",
    snarkjsProof: { pi_a: [bn(h(REF_A.slice(0,64))), bn(h(REF_A.slice(64,128))), "1"] as [string,string,string],
      pi_b: [[bn(h(REF_B.slice(64,128))), bn(h(REF_B.slice(0,64)))],[bn(h(REF_B.slice(192,256))), bn(h(REF_B.slice(128,192)))],["1","0"]] as [[string,string],[string,string],[string,string]],
      pi_c: [bn(h(REF_C.slice(0,64))), bn(h(REF_C.slice(64,128))), "1"] as [string,string,string], protocol: "groth16" as const },
    publicSignals: [bn(h(REF_PUB))] },
  { id: "public_input_zero", description: "public input is zero",
    snarkjsProof: { pi_a: g1(1n,2n), pi_b: g2(3n,4n,5n,6n), pi_c: g1(7n,8n), protocol: "groth16" as const },
    publicSignals: ["0"] },
  { id: "public_input_one", description: "public input is one",
    snarkjsProof: { pi_a: g1(1n,2n), pi_b: g2(3n,4n,5n,6n), pi_c: g1(7n,8n), protocol: "groth16" as const },
    publicSignals: ["1"] },
  { id: "public_input_max_fr", description: "public input is Fr - 1 (max scalar field value)",
    snarkjsProof: { pi_a: g1(1n,2n), pi_b: g2(3n,4n,5n,6n), pi_c: g1(7n,8n), protocol: "groth16" as const },
    publicSignals: [bn(Fr - 1n)] },
  { id: "all_ones", description: "all proof coordinates are 1",
    snarkjsProof: { pi_a: g1(1n,1n), pi_b: g2(1n,1n,1n,1n), pi_c: g1(1n,1n), protocol: "groth16" as const },
    publicSignals: ["1"] },
  { id: "g1_zero_coords", description: "G1 and G2 coordinates are zero",
    snarkjsProof: { pi_a: g1(0n,0n), pi_b: g2(0n,0n,0n,0n), pi_c: g1(0n,0n), protocol: "groth16" as const },
    publicSignals: ["0"] },
  { id: "g1_max_fr", description: "G1 and G2 coordinates are Fr - 1 (max value accepted by SDK validator)",
    snarkjsProof: { pi_a: g1(Fr-1n,Fr-1n), pi_b: g2(Fr-1n,Fr-1n,Fr-1n,Fr-1n), pi_c: g1(Fr-1n,Fr-1n), protocol: "groth16" as const },
    publicSignals: [bn(Fr - 1n)] },
  { id: "mixed_small_large", description: "G1 small coordinates, G2 near-max Fr coordinates",
    snarkjsProof: { pi_a: g1(2n,3n), pi_b: g2(Fr-2n,Fr-3n,Fr-4n,Fr-5n), pi_c: g1(5n,6n), protocol: "groth16" as const },
    publicSignals: ["42"] },
  { id: "public_input_hex_string", description: "public input provided as 0x-prefixed hex string",
    snarkjsProof: { pi_a: g1(1n,2n), pi_b: g2(3n,4n,5n,6n), pi_c: g1(7n,8n), protocol: "groth16" as const },
    publicSignals: ["0x" + hex(12345678901234567890n)] },
  { id: "two_public_inputs", description: "two public inputs",
    snarkjsProof: { pi_a: g1(10n,20n), pi_b: g2(30n,40n,50n,60n), pi_c: g1(70n,80n), protocol: "groth16" as const },
    publicSignals: ["100", "200"] },
  { id: "g2_c1_zero", description: "G2 Fq2 coefficients have c1 = 0 (element lies in base field)",
    snarkjsProof: { pi_a: g1(999n,888n), pi_b: g2(777n,0n,666n,0n), pi_c: g1(555n,444n), protocol: "groth16" as const },
    publicSignals: ["1"] },
  { id: "public_input_large", description: "large public input near mid-range of Fr",
    snarkjsProof: { pi_a: g1(1n,2n), pi_b: g2(3n,4n,5n,6n), pi_c: g1(7n,8n), protocol: "groth16" as const },
    publicSignals: [bn(Fr / 2n)] },
];

const vectors = cases.map(c => {
  const result = formatProof(c.snarkjsProof, c.publicSignals);
  return {
    id: c.id,
    description: c.description,
    snarkjsProof: c.snarkjsProof,
    publicSignals: c.publicSignals,
    expectedCalldata: {
      proofA: result.proofA.toString("hex"),
      proofB: result.proofB.toString("hex"),
      proofC: result.proofC.toString("hex"),
      publicInputs: result.publicInputs.map((b: Buffer) => b.toString("hex"))
    }
  };
});

console.log(JSON.stringify(vectors, null, 2));
