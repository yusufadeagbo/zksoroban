// sdk/test/rangeProof.test.ts
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { formatProof } from "../src/proof";
import { SnarkjsProof, VerificationKey } from "../src/types";
import { verifyOffChain } from "../src/verifyOffChain";

const PROOF = require("./range_proof_fixture.json") as SnarkjsProof;
const PUBLIC_SIGNALS = [
  "12326503012965816391338144612242952408728683609716147019497703475006801258307"
];

function loadRangeVk(): VerificationKey {
  return require(path.resolve(
    __dirname,
    "../../circuits/range_proof/setup/verification_key.json"
  )) as VerificationKey;
}

const VK = loadRangeVk();

test("range proof encodes to the expected calldata byte lengths", () => {
  const calldata = formatProof(PROOF, PUBLIC_SIGNALS);

  assert.equal(calldata.proofA.length, 64);
  assert.equal(calldata.proofB.length, 128);
  assert.equal(calldata.proofC.length, 64);
  assert.equal(calldata.publicInputs.length, 1);
  assert.equal(calldata.publicInputs[0].length, 32);
});

test("range proof verifies locally with verifyOffChain", async () => {
  const result = await verifyOffChain(PROOF, PUBLIC_SIGNALS, VK);
  assert.equal(result, true);
});

test("range proof fails verifyOffChain when public signal is wrong", async () => {
  const result = await verifyOffChain(PROOF, ["1"], VK);
  assert.equal(result, false);
});
