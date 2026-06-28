// sdk/test/expiry.test.ts
import assert from "node:assert/strict";
import test from "node:test";

import { formatProof } from "../src/proof";
import { SorobanZkError, SorobanZkErrorCode } from "../src/types";
import { VALID_PUBLIC_SIGNALS, VALID_SNARKJS_PROOF } from "./fixtures";

test("formatProof without expiryLedger keeps a single public input", () => {
  const calldata = formatProof(VALID_SNARKJS_PROOF, VALID_PUBLIC_SIGNALS);
  assert.equal(calldata.publicInputs.length, 1);
});

test("formatProof appends expiryLedger as a second 32-byte public input", () => {
  const calldata = formatProof(VALID_SNARKJS_PROOF, VALID_PUBLIC_SIGNALS, 1000);

  assert.equal(calldata.publicInputs.length, 2);
  assert.equal(calldata.publicInputs[1].length, 32);
  assert.equal(
    calldata.publicInputs[1].toString("hex"),
    "00000000000000000000000000000000000000000000000000000000000003e8"
  );
});

test("formatProof encodes expiryLedger 0 as all zero bytes", () => {
  const calldata = formatProof(VALID_SNARKJS_PROOF, VALID_PUBLIC_SIGNALS, 0);

  assert.equal(calldata.publicInputs.length, 2);
  assert.equal(calldata.publicInputs[1].toString("hex"), "0".repeat(64));
});

test("formatProof rejects a non-integer expiryLedger", () => {
  assert.throws(
    () => formatProof(VALID_SNARKJS_PROOF, VALID_PUBLIC_SIGNALS, 1.5),
    (error: unknown) =>
      error instanceof SorobanZkError &&
      error.code === SorobanZkErrorCode.INVALID_PUBLIC_INPUT
  );
});

test("formatProof rejects an expiryLedger above u32 range", () => {
  assert.throws(
    () => formatProof(VALID_SNARKJS_PROOF, VALID_PUBLIC_SIGNALS, 0x1_0000_0000),
    (error: unknown) =>
      error instanceof SorobanZkError &&
      error.code === SorobanZkErrorCode.INVALID_PUBLIC_INPUT
  );
});
