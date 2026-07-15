// sdk/test/encodingVectors.test.ts
import assert from "node:assert/strict";
import test from "node:test";

import { formatProof } from "../src/proof";
import { VALID_PUBLIC_SIGNALS, VALID_SNARKJS_PROOF } from "./fixtures";

const DOC_PROOF_A =
  "1c9f4896deda7ee2355d0450495c287824c2d7a7273526cb4e379a2bb7331bef" +
  "2774e1ccdf712d4b913fa2fb73a9e9d3c411325f0a606457672dde2e164feccf";

const DOC_PROOF_B =
  "012a0542a3eb25f9dd3b1c1a1c8dde882c7d39cdaeab789ed7052598802f6db3" +
  "0ac39707cbd15b1dd86963d88639f9263f1c3d10edb06a3b6a7f8496adf91827" +
  "252a07f51df2b1b6aa65162f17933bfaa2245f427a024b1abc76654a2fc1ffa8" +
  "0b743e4f2c12b5c36eff491f6343c52b1d979dd222f786261f170403314d1b0d";

const DOC_PROOF_C =
  "11c9db1a44293dd937839d0b271f95fbe7ac78df2331560beed6a29803aac919" +
  "0c3780eb59106c3791d39969fca352f41f146690cda50d1c3c80c5def64501de";

const DOC_PUBLIC_INPUT_0 =
  "29176100eaa962bdc1fe6c654d6a3c130e96a4d1168b33848b897dc502820133";

test("Vector 1: proofA (G1) matches docs/proof-format.md", () => {
  const calldata = formatProof(VALID_SNARKJS_PROOF, VALID_PUBLIC_SIGNALS);
  assert.equal(calldata.proofA.length, 64);
  assert.equal(calldata.proofA.toString("hex"), DOC_PROOF_A);
});

test("Vector 2: proofB (G2) matches docs/proof-format.md", () => {
  const calldata = formatProof(VALID_SNARKJS_PROOF, VALID_PUBLIC_SIGNALS);
  assert.equal(calldata.proofB.length, 128);
  assert.equal(calldata.proofB.toString("hex"), DOC_PROOF_B);
});

test("Vector 3: publicInputs[0] (field element) matches docs/proof-format.md", () => {
  const calldata = formatProof(VALID_SNARKJS_PROOF, VALID_PUBLIC_SIGNALS);
  assert.equal(calldata.publicInputs[0].length, 32);
  assert.equal(calldata.publicInputs[0].toString("hex"), DOC_PUBLIC_INPUT_0);
});

test("proofC (G1) matches docs/proof-format.md", () => {
  const calldata = formatProof(VALID_SNARKJS_PROOF, VALID_PUBLIC_SIGNALS);
  assert.equal(calldata.proofC.length, 64);
  assert.equal(calldata.proofC.toString("hex"), DOC_PROOF_C);
});
