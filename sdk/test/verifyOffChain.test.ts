// sdk/test/verifyOffChain.test.ts
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { VerificationKey } from "../src/types";
import { verifyOffChain } from "../src/verifyOffChain";
import {
  VALID_PUBLIC_SIGNALS,
  VALID_SNARKJS_PROOF,
  tamperedProofAHex
} from "./fixtures";

function loadVerificationKey(): VerificationKey {
  const vkPath = path.resolve(
    __dirname,
    "../../circuits/poseidon_preimage/setup/verification_key.json"
  );
  return require(vkPath) as VerificationKey;
}

function g1FromHex(hex: string): [string, string, string] {
  return [
    BigInt(`0x${hex.slice(0, 64)}`).toString(),
    BigInt(`0x${hex.slice(64, 128)}`).toString(),
    "1"
  ];
}

const VK = loadVerificationKey();

test("verifyOffChain returns true for a valid proof", async () => {
  const result = await verifyOffChain(VALID_SNARKJS_PROOF, VALID_PUBLIC_SIGNALS, VK);
  assert.equal(result, true);
});

test("verifyOffChain returns false for a tampered proof", async () => {
  const tamperedHex = tamperedProofAHex();
  const tamperedProof = {
    ...VALID_SNARKJS_PROOF,
    pi_a: g1FromHex(tamperedHex)
  };
  const result = await verifyOffChain(tamperedProof, VALID_PUBLIC_SIGNALS, VK);
  assert.equal(result, false);
});

test("verifyOffChain returns false for wrong public signals", async () => {
  const wrongSignals = ["1234567890"];
  const result = await verifyOffChain(VALID_SNARKJS_PROOF, wrongSignals, VK);
  assert.equal(result, false);
});

test("verifyOffChain throws for non-groth16 proof", async () => {
  await assert.rejects(
    () =>
      verifyOffChain(
        { ...VALID_SNARKJS_PROOF, protocol: "plonk" as "groth16" },
        VALID_PUBLIC_SIGNALS,
        VK
      ),
    (error: unknown) =>
      error instanceof Error && error.message.includes("Groth16")
  );
});

test("verifyOffChain throws for null proof", async () => {
  await assert.rejects(
    () => verifyOffChain(null as unknown as any, VALID_PUBLIC_SIGNALS, VK),
    (error: unknown) => error instanceof Error
  );
});

test("verifyOffChain throws for missing pi_a", async () => {
  const badProof = { ...VALID_SNARKJS_PROOF, pi_a: null as unknown as any };
  await assert.rejects(
    () => verifyOffChain(badProof, VALID_PUBLIC_SIGNALS, VK),
    (error: unknown) =>
      error instanceof Error && error.message.includes("pi_a")
  );
});

test("verifyOffChain throws for non-array publicSignals", async () => {
  await assert.rejects(
    () => verifyOffChain(VALID_SNARKJS_PROOF, "bad" as unknown as string[], VK),
    (error: unknown) =>
      error instanceof Error && error.message.includes("publicSignals")
  );
});

test("verifyOffChain throws for null verificationKey", async () => {
  await assert.rejects(
    () =>
      verifyOffChain(
        VALID_SNARKJS_PROOF,
        VALID_PUBLIC_SIGNALS,
        null as unknown as VerificationKey
      ),
    (error: unknown) =>
      error instanceof Error && error.message.includes("verificationKey")
  );
});

test("verifyOffChain throws for non-groth16 verificationKey", async () => {
  await assert.rejects(
    () =>
      verifyOffChain(VALID_SNARKJS_PROOF, VALID_PUBLIC_SIGNALS, {
        ...VK,
        protocol: "plonk"
      }),
    (error: unknown) =>
      error instanceof Error && error.message.includes("verificationKey")
  );
});
