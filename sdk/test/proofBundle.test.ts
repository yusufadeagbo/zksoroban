// sdk/test/proofBundle.test.ts
import assert from "node:assert/strict";
import test from "node:test";

import { assertBundleNetwork } from "../src/verify";
import {
  NetworkMismatchError,
  ProofBundle,
  SorobanZkError,
  SorobanZkErrorCode
} from "../src/types";
import { VALID_PUBLIC_SIGNALS, VALID_SNARKJS_PROOF } from "./fixtures";

const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
const MAINNET_PASSPHRASE = "Public Global Stellar Network ; September 2015";

function makeBundle(networkPassphrase: string): ProofBundle {
  return {
    proof: VALID_SNARKJS_PROOF,
    publicSignals: VALID_PUBLIC_SIGNALS,
    circuit: "poseidon_preimage",
    generatedAt: "2026-05-29T00:00:00.000Z",
    networkPassphrase
  };
}

test("ProofBundle carries proof, publicSignals, circuit, generatedAt, and networkPassphrase", () => {
  const bundle = makeBundle(TESTNET_PASSPHRASE);

  assert.equal(bundle.proof, VALID_SNARKJS_PROOF);
  assert.deepEqual(bundle.publicSignals, VALID_PUBLIC_SIGNALS);
  assert.equal(bundle.circuit, "poseidon_preimage");
  assert.equal(bundle.generatedAt, "2026-05-29T00:00:00.000Z");
  assert.equal(bundle.networkPassphrase, TESTNET_PASSPHRASE);
});

test("assertBundleNetwork passes when passphrases match", () => {
  assert.doesNotThrow(() =>
    assertBundleNetwork(makeBundle(TESTNET_PASSPHRASE), TESTNET_PASSPHRASE)
  );
});

test("assertBundleNetwork throws NetworkMismatchError on mismatch", () => {
  assert.throws(
    () => assertBundleNetwork(makeBundle(TESTNET_PASSPHRASE), MAINNET_PASSPHRASE),
    (error: unknown) =>
      error instanceof NetworkMismatchError &&
      error instanceof SorobanZkError &&
      error.code === SorobanZkErrorCode.NETWORK_MISMATCH &&
      error.expected === TESTNET_PASSPHRASE &&
      error.actual === MAINNET_PASSPHRASE
  );
});
