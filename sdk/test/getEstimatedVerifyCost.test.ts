/**
 * Unit tests for getEstimatedVerifyCost() (zksoroban#141).
 *
 * Like getContractConfig.test.ts, the RPC layer is replaced with a
 * lightweight stub that returns a pre-built simResult — no funded account
 * or real contract is needed.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { xdr } from "@stellar/stellar-sdk";

import { getEstimatedVerifyCost } from "../src/verify";
import { SorobanZkError, SorobanZkErrorCode, TESTNET } from "../src/types";

import * as stellarSdk from "@stellar/stellar-sdk";

const STUB_PASSPHRASE = "Test SDF Network ; September 2015";

function withStubbedServer(stubFactory: () => object, fn: () => Promise<void>): Promise<void> {
  const original = (stellarSdk.rpc as any).Server;
  (stellarSdk.rpc as any).Server = function () {
    return stubFactory();
  };
  return fn().finally(() => {
    (stellarSdk.rpc as any).Server = original;
  });
}

function makeSuccessSimResult(retval: xdr.ScVal): object {
  return {
    result: { retval },
    minResourceFee: "100",
    transactionData: "",
    events: [],
    latestLedger: 1
  };
}

/**
 * Mirrors getContractConfig.test.ts's buildStub: getAccount() rejects,
 * triggering the synthetic-account fallback — the expected path for an
 * ephemeral address that isn't funded on the network.
 */
function buildStub(simResult: object) {
  return {
    getNetwork: async () => ({ passphrase: STUB_PASSPHRASE }),
    getAccount: async (_id: string): Promise<never> => {
      throw new Error("account not found (stub)");
    },
    simulateTransaction: async (_tx: unknown) => simResult
  };
}

test("getEstimatedVerifyCost returns the contract's reported instruction count as a bigint", async () => {
  const retval = xdr.ScVal.scvU64(xdr.Uint64.fromString("26897863"));

  await withStubbedServer(() => buildStub(makeSuccessSimResult(retval)), async () => {
    const cost = await getEstimatedVerifyCost({ network: TESTNET });
    assert.equal(typeof cost, "bigint");
    assert.equal(cost, 26_897_863n);
  });
});

test("getEstimatedVerifyCost throws SorobanZkError on simulation error", async () => {
  await withStubbedServer(() => buildStub({ error: "contract trap: NotInitialized", latestLedger: 1 }), async () => {
    await assert.rejects(
      () => getEstimatedVerifyCost({ network: TESTNET }),
      (err: unknown) => err instanceof SorobanZkError
    );
  });
});

test("getEstimatedVerifyCost throws CONTRACT_INVOCATION_FAILED when result is missing", async () => {
  const noResultSim = { minResourceFee: "100", latestLedger: 1, events: [] };

  await withStubbedServer(() => buildStub(noResultSim), async () => {
    await assert.rejects(
      () => getEstimatedVerifyCost({ network: TESTNET }),
      (err: unknown) =>
        err instanceof SorobanZkError && err.code === SorobanZkErrorCode.CONTRACT_INVOCATION_FAILED
    );
  });
});

test("getEstimatedVerifyCost is exported from the SDK entry point", async () => {
  const sdk = await import("../src/index");
  assert.ok("getEstimatedVerifyCost" in sdk, "getEstimatedVerifyCost exported from index");
});
