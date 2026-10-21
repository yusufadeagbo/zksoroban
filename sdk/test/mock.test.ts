/**
 * Unit tests for `@zksoroban/sdk/mock` (zksoroban#66) — no real Stellar
 * network, wasm/zkey files, or real proofs involved.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { Keypair } from "@stellar/stellar-sdk";

import { createMockSdk } from "../src/mock";
import { ProofBundle, TESTNET, VerifyOptions } from "../src/types";

const KEYPAIR = Keypair.random();

const BUNDLE: ProofBundle = {
  proof: {
    pi_a: ["1", "2", "1"],
    pi_b: [
      ["1", "2"],
      ["3", "4"],
      ["1", "0"]
    ],
    pi_c: ["1", "2", "1"],
    protocol: "groth16"
  },
  publicSignals: ["123"],
  circuit: "poseidon_preimage",
  generatedAt: new Date().toISOString(),
  networkPassphrase: TESTNET.networkPassphrase
};

const VERIFY_OPTS: VerifyOptions = {
  network: TESTNET,
  keypair: KEYPAIR,
  bundle: BUNDLE
};

test("verifyOnChain resolves with the configured verifyResult (default true)", async () => {
  const sdk = createMockSdk();
  const result = await sdk.verifyOnChain(VERIFY_OPTS);
  assert.equal(result.verified, true);
  assert.equal(typeof result.txHash, "string");
  assert.equal(typeof result.ledger, "number");
  assert.equal(typeof result.fee, "string");
});

test("verifyOnChain resolves with verified: false when configured", async () => {
  const sdk = createMockSdk({ verifyResult: false });
  const result = await sdk.verifyOnChain(VERIFY_OPTS);
  assert.equal(result.verified, false);
});

test("verifyOnChain rejects with the configured Error", async () => {
  const sdk = createMockSdk({ verifyResult: new Error("simulated rejection") });
  await assert.rejects(sdk.verifyOnChain(VERIFY_OPTS), /simulated rejection/);
});

test("verifyOnChain waits at least `delay` ms before resolving", async () => {
  const sdk = createMockSdk({ delay: 50 });
  const started = Date.now();
  await sdk.verifyOnChain(VERIFY_OPTS);
  assert.ok(Date.now() - started >= 50);
});

test("verifyOnChain records every call in order, before delay resolves", async () => {
  const sdk = createMockSdk({ delay: 10 });
  await sdk.verifyOnChain(VERIFY_OPTS);
  await sdk.verifyOnChain(VERIFY_OPTS);

  assert.equal(sdk.calls.length, 2);
  assert.equal(sdk.calls[0].method, "verifyOnChain");
  assert.equal(sdk.calls[1].method, "verifyOnChain");
});

test("verifyOnChain emits submit_start then submit_done on success", async () => {
  const stages: string[] = [];
  const sdk = createMockSdk();
  await sdk.verifyOnChain({ ...VERIFY_OPTS, onProgress: (stage) => stages.push(stage) });
  assert.deepEqual(stages, ["submit_start", "submit_done"]);
});

test("verifyOnChain does not emit submit_done when it rejects", async () => {
  const stages: string[] = [];
  const sdk = createMockSdk({ verifyResult: new Error("boom") });
  await assert.rejects(
    sdk.verifyOnChain({ ...VERIFY_OPTS, onProgress: (stage) => stages.push(stage) })
  );
  assert.deepEqual(stages, ["submit_start"]);
});

test("generateProof returns a deterministic fake proof tied to the given commitment", async () => {
  const sdk = createMockSdk();
  const wasm = new Uint8Array([1, 2, 3]);
  const zkey = new Uint8Array([4, 5, 6]);

  const first = await sdk.generateProof(1n, 42n, wasm, zkey);
  const second = await sdk.generateProof(999n, 42n, wasm, zkey);

  assert.deepEqual(first.proof, second.proof);
  assert.deepEqual(first.publicSignals, ["42"]);
  assert.deepEqual(second.publicSignals, ["42"]);
});

test("generateProof waits at least `delay` ms and records the call", async () => {
  const sdk = createMockSdk({ delay: 50 });
  const started = Date.now();
  await sdk.generateProof(1n, 2n, new Uint8Array(), new Uint8Array());
  assert.ok(Date.now() - started >= 50);

  assert.equal(sdk.calls.length, 1);
  assert.equal(sdk.calls[0].method, "generateProof");
  assert.deepEqual((sdk.calls[0] as { args: [bigint, bigint] }).args.slice(0, 2), [1n, 2n]);
});

test("generateProof emits all four progress stages in order", async () => {
  const stages: string[] = [];
  const sdk = createMockSdk();
  await sdk.generateProof(1n, 2n, new Uint8Array(), new Uint8Array(), (stage) => stages.push(stage));
  assert.deepEqual(stages, ["witness_start", "witness_done", "proof_start", "proof_done"]);
});

test("separate createMockSdk() instances do not share calls or txHash/ledger counters", async () => {
  const first = createMockSdk();
  const second = createMockSdk();

  await first.verifyOnChain(VERIFY_OPTS);
  await first.verifyOnChain(VERIFY_OPTS);
  const result = await second.verifyOnChain(VERIFY_OPTS);

  assert.equal(first.calls.length, 2);
  assert.equal(second.calls.length, 1);
  assert.equal(result.txHash, "mock-tx-hash-1", "a fresh instance starts its own counter at 1");
});
