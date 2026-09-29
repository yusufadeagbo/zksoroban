import assert from "node:assert/strict";
import test from "node:test";

import { formatProof } from "../src/proof";
import { SorobanZkError, SorobanZkErrorCode } from "../src/types";
import {
  VALID_PROOF_A_HEX,
  VALID_PROOF_B_HEX,
  VALID_PROOF_C_HEX,
  VALID_PUBLIC_INPUT_HEX,
  VALID_PUBLIC_SIGNALS,
  VALID_SNARKJS_PROOF
} from "./fixtures";

const VALID_VK = {
  protocol: "groth16",
  curve: "bn254",
  nPublic: 1,
  vk_alpha_1: ["1", "2", "1"],
  vk_beta_2: [["3", "4"], ["5", "6"], ["7", "8"]],
  vk_gamma_2: [["9", "10"], ["11", "12"], ["13", "14"]],
  vk_delta_2: [["15", "16"], ["17", "18"], ["19", "20"]],
  vk_alphabeta_12: [],
  IC: [["21", "22", "1"]]
};

test("formatProof produces the expected calldata lengths", () => {
  const result = formatProof(VALID_SNARKJS_PROOF, VALID_PUBLIC_SIGNALS);

  assert.equal(result.proofA.length, 64);
  assert.equal(result.proofB.length, 128);
  assert.equal(result.proofC.length, 64);
});

test("formatProof matches known G1 and G2 encodings", () => {
  const result = formatProof(VALID_SNARKJS_PROOF, VALID_PUBLIC_SIGNALS);

  assert.equal(result.proofA.toString("hex"), VALID_PROOF_A_HEX);
  assert.equal(result.proofB.toString("hex"), VALID_PROOF_B_HEX);
  assert.equal(result.proofC.toString("hex"), VALID_PROOF_C_HEX);
});

test("formatProof encodes public inputs as 32-byte big-endian field elements", () => {
  const result = formatProof(VALID_SNARKJS_PROOF, VALID_PUBLIC_SIGNALS);

  assert.equal(result.publicInputs.length, 1);
  assert.equal(result.publicInputs[0].toString("hex"), VALID_PUBLIC_INPUT_HEX);
});

test("formatProof throws typed errors for malformed proof input", () => {
  assert.throws(
    () =>
      formatProof(
        {
          ...VALID_SNARKJS_PROOF,
          pi_a: ["not-a-number", VALID_SNARKJS_PROOF.pi_a[1], "1"]
        },
        VALID_PUBLIC_SIGNALS
      ),
    (error: unknown) =>
      error instanceof SorobanZkError &&
      error.code === SorobanZkErrorCode.INVALID_PROOF_FORMAT
  );
});

test("formatProof throws typed errors for malformed public input", () => {
  assert.throws(
    () => formatProof(VALID_SNARKJS_PROOF, ["not-a-field-element"]),
    (error: unknown) =>
      error instanceof SorobanZkError &&
      error.code === SorobanZkErrorCode.INVALID_PUBLIC_INPUT
  );
});

test("error message includes the offending string value", () => {
  assert.throws(
    () => formatProof(VALID_SNARKJS_PROOF, ["not-a-field-element"]),
    (error: unknown) =>
      error instanceof SorobanZkError &&
      error.message.includes("not-a-field-element")
  );
});

test("error message includes type and value for non-string input", () => {
  assert.throws(
    () =>
      formatProof(
        {
          ...VALID_SNARKJS_PROOF,
          pi_a: [42 as unknown as string, VALID_SNARKJS_PROOF.pi_a[1], "1"]
        },
        VALID_PUBLIC_SIGNALS
      ),
    (error: unknown) =>
      error instanceof SorobanZkError &&
      error.message.includes("number") &&
      error.message.includes("42")
  );
});

test("error message truncates offending value at 64 chars", () => {
  const longValue = "x".repeat(80);
  assert.throws(
    () => formatProof(VALID_SNARKJS_PROOF, [longValue]),
    (error: unknown) =>
      error instanceof SorobanZkError &&
      error.message.includes("…") &&
      !error.message.includes("x".repeat(65))
  );
});

test("error message includes out-of-range value truncated at 64 chars", () => {
  const overModulus =
    "21888242871839275222246405745257275088548364400416034343698204186575808495618";
  assert.throws(
    () => formatProof(VALID_SNARKJS_PROOF, [overModulus]),
    (error: unknown) =>
      error instanceof SorobanZkError &&
      error.message.includes(overModulus.slice(0, 64)) &&
      error.message.includes("…")
  );
});

test("formatProof validates public signal count when vk is provided", () => {
  assert.throws(
    () => formatProof(VALID_SNARKJS_PROOF, VALID_PUBLIC_SIGNALS, undefined, { ...VALID_VK, nPublic: 2 }),
    (error: unknown) =>
      error instanceof SorobanZkError &&
      error.code === SorobanZkErrorCode.INVALID_PUBLIC_INPUT &&
      error.message.includes("publicSignals count mismatch") &&
      error.message.includes("expected 2") &&
      error.message.includes("got 1")
  );
});

test("formatProof validates under-count public signals when vk is provided", () => {
  assert.throws(
    () => formatProof(VALID_SNARKJS_PROOF, [], undefined, VALID_VK),
    (error: unknown) =>
      error instanceof SorobanZkError &&
      error.code === SorobanZkErrorCode.INVALID_PUBLIC_INPUT &&
      error.message.includes("expected 1") &&
      error.message.includes("got 0")
  );
});

test("formatProof validates over-count public signals when vk is provided", () => {
  assert.throws(
    () => formatProof(VALID_SNARKJS_PROOF, ["1", "2"], undefined, VALID_VK),
    (error: unknown) =>
      error instanceof SorobanZkError &&
      error.code === SorobanZkErrorCode.INVALID_PUBLIC_INPUT &&
      error.message.includes("expected 1") &&
      error.message.includes("got 2")
  );
});

test("formatProof passes when vk.nPublic matches publicSignals count", () => {
  const result = formatProof(VALID_SNARKJS_PROOF, VALID_PUBLIC_SIGNALS, undefined, VALID_VK);
  assert.equal(result.publicInputs.length, 1);
});

test("formatProof omits vk validation when vk is omitted (backward compatible)", () => {
  // 2-arg call should still work without vk
  const result = formatProof(VALID_SNARKJS_PROOF, VALID_PUBLIC_SIGNALS);
  assert.equal(result.publicInputs.length, 1);

  // 3-arg call with expiryLedger should still work without vk
  const result2 = formatProof(VALID_SNARKJS_PROOF, VALID_PUBLIC_SIGNALS, 12345);
  assert.equal(result2.publicInputs.length, 2);
});
