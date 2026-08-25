/**
 * Unit tests for formatVerifyingKey() (issue #183).
 *
 * registryVkVectors.json's expected hex was extracted directly from
 * contracts/registry/src/tests.rs's hardcoded `[u8; N]` VK constants —
 * those bytes are already exercised there by real register_circuit /
 * verify_proof round trips against a test Env, so matching them here
 * cross-validates the SDK's encoding against the Rust side's, not just
 * against itself.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { formatVerifyingKey } from "../src/proof";
import { SorobanZkError, SorobanZkErrorCode, VerificationKey } from "../src/types";

interface RegistryVkVector {
  alpha: string;
  beta: string;
  gamma: string;
  delta: string;
  ic: string[];
}

const VECTORS: Record<string, RegistryVkVector> = JSON.parse(
  fs.readFileSync(path.join(__dirname, "registryVkVectors.json"), "utf8")
);

const CIRCUITS_DIR = path.resolve(__dirname, "../../circuits");

function loadVerificationKey(circuit: string): VerificationKey {
  return JSON.parse(
    fs.readFileSync(path.join(CIRCUITS_DIR, circuit, "setup/verification_key.json"), "utf8")
  );
}

for (const circuit of ["range_proof", "threshold_2of3", "merkle_inclusion"]) {
  test(`formatVerifyingKey matches contracts/registry's tests.rs constants for ${circuit}`, () => {
    const vk = loadVerificationKey(circuit);
    const expected = VECTORS[circuit];

    const result = formatVerifyingKey(vk);

    assert.equal(result.alpha.toString("hex"), expected.alpha, "alpha");
    assert.equal(result.beta.toString("hex"), expected.beta, "beta");
    assert.equal(result.gamma.toString("hex"), expected.gamma, "gamma");
    assert.equal(result.delta.toString("hex"), expected.delta, "delta");
    assert.equal(result.ic.length, expected.ic.length, "ic length");
    result.ic.forEach((point, i) => {
      assert.equal(point.toString("hex"), expected.ic[i], `ic[${i}]`);
    });
  });
}

test("formatVerifyingKey produces 64-byte G1 and 128-byte G2 points", () => {
  const vk = loadVerificationKey("range_proof");
  const result = formatVerifyingKey(vk);

  assert.equal(result.alpha.length, 64);
  assert.equal(result.beta.length, 128);
  assert.equal(result.gamma.length, 128);
  assert.equal(result.delta.length, 128);
  for (const point of result.ic) {
    assert.equal(point.length, 64);
  }
});

test("formatVerifyingKey throws for a non-groth16 protocol", () => {
  const vk = loadVerificationKey("range_proof");

  assert.throws(
    () => formatVerifyingKey({ ...vk, protocol: "plonk" }),
    (err: unknown) =>
      err instanceof SorobanZkError && err.code === SorobanZkErrorCode.INVALID_PROOF_FORMAT
  );
});

test("formatVerifyingKey throws for a missing IC array", () => {
  const vk = loadVerificationKey("range_proof");

  assert.throws(
    () => formatVerifyingKey({ ...vk, IC: [] }),
    (err: unknown) =>
      err instanceof SorobanZkError && err.code === SorobanZkErrorCode.INVALID_PROOF_FORMAT
  );
});

test("formatVerifyingKey throws for a malformed alpha point", () => {
  const vk = loadVerificationKey("range_proof");

  assert.throws(
    () => formatVerifyingKey({ ...vk, vk_alpha_1: ["not-a-number", "2", "1"] }),
    (err: unknown) =>
      err instanceof SorobanZkError && err.code === SorobanZkErrorCode.INVALID_PROOF_FORMAT
  );
});

test("formatVerifyingKey and RegistryVerifyingKey are exported from the SDK entry point", async () => {
  const sdk = await import("../src/index");
  assert.ok("formatVerifyingKey" in sdk, "formatVerifyingKey exported from index");
});
