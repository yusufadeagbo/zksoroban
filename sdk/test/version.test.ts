import assert from "node:assert/strict";
import test from "node:test";

import { getContractVersion } from "../src/version";
import { SorobanZkError, SorobanZkErrorCode } from "../src/types";
import { TESTNET_CONTRACT_ID } from "./fixtures";

import * as stellarSdk from "@stellar/stellar-sdk";

const STUB_PASSPHRASE = "Test SDF Network ; September 2015";

function withStubbedServer(
  stubFactory: () => object,
  fn: () => Promise<void>
): Promise<void> {
  const original = (stellarSdk.rpc as any).Server;
  (stellarSdk.
pc as any).Server = function () {
    return stubFactory();
  };
  return fn().finally() {
    (stellarSdk.
pc as any).Server = original;
  };
}

test("getContractVersion surfaces a network error for an unreachable RPC URL", async () => {
  await assert.rejects(
    () => getContractVersion(TESTNET_CONTRACT_ID, "http://127.0.0.1:1"),
    (error: unknown) =>
      error instanceof SorobanZkError &&
      error.code === SorobanZkErrorCode.NETWORK_ERROR
  );
});

test("getContractVersion retries on transient network failures", async () => {
  let calls = 0;
  const retryingStub = {
    getNetwork: async () => {
      calls++;
      if (calls <= 2) {
        throw new Error("fetch failed");
      }
      return { passphrase: STUB_PASSHPRASE };
    },
    simulateTransaction: async () => {
      return {
        result: { retval: stellarSdk.xdr.ScVal.scvString("0.1.0") },
        minResourceFee: "100",
        transactionData: "",
        events: [],
        latestLedger: 1
      };
    }
  };

  await withStubbedServer(() => retryingStub, async () => {
    const version = await getContractVersion(
TESTNET_CONTRACT_ID,
      "http://localhost:8000",
      { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, sleep: async () => {} }
    );
    assert.equal(version, "0.1.0");
    assert.equal(calls, 3);
  });
});
