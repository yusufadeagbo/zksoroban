/**
 * Unit tests for generateProof() (the `@zksoroban/sdk/browser` entry point).
 *
 * generateProof takes wasm/zkey bytes as Uint8Array rather than file paths,
 * so these tests read the repo's already-compiled poseidon_preimage circuit
 * artifacts into Uint8Array with `fs` here (test-only — browser.ts itself
 * never touches fs) and pass the bytes straight through, the same way a
 * browser caller would after fetch()-ing them.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { generateProof } from "../src/browser";
import { poseidon } from "../src/poseidon";
import { SorobanZkError, SorobanZkErrorCode, ZkInputError } from "../src/types";

function loadCircuitBytes(): { wasm: Uint8Array; zkey: Uint8Array } {
  const circuitDir = path.resolve(__dirname, "../../circuits/poseidon_preimage");
  const wasm = new Uint8Array(
    fs.readFileSync(path.join(circuitDir, "build/circuit_js/circuit.wasm"))
  );
  const zkey = new Uint8Array(fs.readFileSync(path.join(circuitDir, "setup/circuit.zkey")));
  return { wasm, zkey };
}

test("generateProof produces a valid groth16 proof from Uint8Array wasm/zkey bytes", async () => {
  const { wasm, zkey } = loadCircuitBytes();
  const secret = 12345n;
  const commitment = poseidon([secret]);

  const { proof, publicSignals } = await generateProof(secret, commitment, wasm, zkey);

  assert.equal(proof.protocol, "groth16");
  assert.equal(proof.pi_a.length, 3);
  assert.equal(proof.pi_b.length, 3);
  assert.equal(proof.pi_c.length, 3);
  assert.deepEqual(publicSignals, [commitment.toString()]);
});

test("generateProof throws PROOF_GENERATION_FAILED when commitment doesn't match the secret", async () => {
  const { wasm, zkey } = loadCircuitBytes();
  const secret = 12345n;
  const wrongCommitment = poseidon([secret + 1n]);

  await assert.rejects(
    generateProof(secret, wrongCommitment, wasm, zkey),
    (err: unknown) => {
      assert.ok(err instanceof SorobanZkError);
      assert.equal(err.code, SorobanZkErrorCode.PROOF_GENERATION_FAILED);
      return true;
    }
  );
});

test("generateProof rejects a non-bigint secret", async () => {
  const { wasm, zkey } = loadCircuitBytes();

  await assert.rejects(
    generateProof("12345" as unknown as bigint, 1n, wasm, zkey),
    (err: unknown) => err instanceof ZkInputError && err.field === "secret"
  );
});

test("generateProof rejects a non-bigint commitment", async () => {
  const { wasm, zkey } = loadCircuitBytes();

  await assert.rejects(
    generateProof(1n, "1" as unknown as bigint, wasm, zkey),
    (err: unknown) => err instanceof ZkInputError && err.field === "commitment"
  );
});

test("generateProof rejects a non-Uint8Array wasm", async () => {
  const { zkey } = loadCircuitBytes();

  await assert.rejects(
    generateProof(1n, 1n, "not-bytes" as unknown as Uint8Array, zkey),
    (err: unknown) => err instanceof ZkInputError && err.field === "wasm"
  );
});

test("generateProof rejects a non-Uint8Array zkey", async () => {
  const { wasm } = loadCircuitBytes();

  await assert.rejects(
    generateProof(1n, 1n, wasm, "not-bytes" as unknown as Uint8Array),
    (err: unknown) => err instanceof ZkInputError && err.field === "zkey"
  );
});

test("the browser entry point exports generateProof and the shared error types, and nothing else Node-only", async () => {
  const browserEntry = await import("../src/browser");

  assert.ok("generateProof" in browserEntry, "generateProof exported");
  assert.ok("SorobanZkError" in browserEntry, "SorobanZkError exported");
  assert.ok("SorobanZkErrorCode" in browserEntry, "SorobanZkErrorCode exported");
  assert.ok("ZkInputError" in browserEntry, "ZkInputError exported");
  assert.ok(!("poseidon" in browserEntry), "poseidon (fs-based) is not exported from the browser entry");
  assert.ok(!("verifyOnChain" in browserEntry), "verifyOnChain (@stellar/stellar-sdk) is not exported from the browser entry");
});
