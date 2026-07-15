import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { formatProof } from "../src/proof";
import { SnarkjsProof } from "../src/types";

interface VectorCalldata {
  proofA: string;
  proofB: string;
  proofC: string;
  publicInputs: string[];
}

interface Vector {
  id: string;
  description: string;
  snarkjsProof: SnarkjsProof;
  publicSignals: string[];
  expectedCalldata: VectorCalldata;
}

const vectors: Vector[] = JSON.parse(
  readFileSync(join(__dirname, "vectors.json"), "utf8")
);

for (const v of vectors) {
  test(`vector ${v.id}: ${v.description}`, () => {
    const result = formatProof(v.snarkjsProof, v.publicSignals);

    assert.equal(result.proofA.toString("hex"), v.expectedCalldata.proofA,
      `proofA mismatch for vector "${v.id}"`);
    assert.equal(result.proofB.toString("hex"), v.expectedCalldata.proofB,
      `proofB mismatch for vector "${v.id}"`);
    assert.equal(result.proofC.toString("hex"), v.expectedCalldata.proofC,
      `proofC mismatch for vector "${v.id}"`);
    assert.equal(result.publicInputs.length, v.expectedCalldata.publicInputs.length,
      `publicInputs length mismatch for vector "${v.id}"`);
    for (let i = 0; i < result.publicInputs.length; i++) {
      assert.equal(result.publicInputs[i].toString("hex"), v.expectedCalldata.publicInputs[i],
        `publicInputs[${i}] mismatch for vector "${v.id}"`);
    }
  });
}
