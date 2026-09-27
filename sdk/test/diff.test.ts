import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import { diffProofs } from "../src/diff";
import { calldataBuffersFromHex } from "./fixtures";

test("diffProofs returns equal for identical calldata", () => {
  const a = calldataBuffersFromHex();
  const b = calldataBuffersFromHex();

  assert.deepEqual(diffProofs(a, b), { equal: true });
});

test("diffProofs finds the exact byte offset of a single-byte difference", () => {
  const a = calldataBuffersFromHex();
  const b = calldataBuffersFromHex();
  b.proofA = Buffer.from(b.proofA);
  b.proofA[40] ^= 0xff;

  const result = diffProofs(a, b);

  assert.equal(result.equal, false);
  if (result.equal) throw new Error("unreachable");
  assert.equal(result.differences.length, 1);
  assert.deepEqual(result.differences[0], {
    field: "proofA",
    expectedHex: a.proofA.toString("hex"),
    actualHex: b.proofA.toString("hex"),
    firstDifferentByte: 40
  });
});

test("diffProofs reports every field for an entirely different proof", () => {
  const a = calldataBuffersFromHex();
  const b = {
    proofA: Buffer.alloc(64, 0xaa),
    proofB: Buffer.alloc(128, 0xbb),
    proofC: Buffer.alloc(64, 0xcc),
    publicInputs: [Buffer.alloc(32, 0xdd)]
  };

  const result = diffProofs(a, b);

  assert.equal(result.equal, false);
  if (result.equal) throw new Error("unreachable");
  assert.deepEqual(
    result.differences.map((d) => d.field),
    ["proofA", "proofB", "proofC", "publicInputs[0]"]
  );
  for (const d of result.differences) {
    assert.equal(d.firstDifferentByte, 0);
  }
});

test("diffProofs treats a missing publicInputs entry as a difference", () => {
  const a = calldataBuffersFromHex();
  const b = { ...calldataBuffersFromHex(), publicInputs: [] };

  const result = diffProofs(a, b);

  assert.equal(result.equal, false);
  if (result.equal) throw new Error("unreachable");
  assert.equal(result.differences.length, 1);
  assert.equal(result.differences[0].field, "publicInputs[0]");
  assert.equal(result.differences[0].actualHex, "");
  assert.equal(result.differences[0].firstDifferentByte, 0);
});
