/**
 * Unit tests for verifyViaRegistry().
 *
 * Like getContractConfig.test.ts, the RPC layer is replaced with a
 * lightweight stub -- no funded account or real contract is needed, since
 * verify_proof on contracts/registry requires no auth and is simulation-only.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { xdr } from "@stellar/stellar-sdk";

import { verifyViaRegistry } from "../src/verify";
import { SorobanZkError, SorobanZkErrorCode, VerifyViaRegistryOptions } from "../src/types";

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

function makeSuccessSimResult(value: boolean): object {
  return {
    result: { retval: xdr.ScVal.scvBool(value) },
    minResourceFee: "100",
    transactionData: "",
    events: [],
    latestLedger: 1
  };
}

function makeErrorSimResult(msg: string): object {
  return { error: msg, latestLedger: 1 };
}

function buildStub(simResult: object, capturedArgs: { args?: xdr.ScVal[] } = {}) {
  return {
    getNetwork: async () => ({ passphrase: STUB_PASSPHRASE }),
    getAccount: async (_id: string): Promise<never> => {
      throw new Error("account not found (stub)");
    },
    simulateTransaction: async (tx: any) => {
      const op = tx.operations[0];
      capturedArgs.args = op.func.invokeContract().args();
      return simResult;
    }
  };
}

const DEFAULT_OPPS: VerifyViaRegistryOptions = {
  rpcUrl: "http://localhost:8000",
  registryContractId: "CDTPNARKKZCZ36PL4BNKXBZTT2BLVR373S2K5NCFAOKCPPY62ESRHSXH",
  circuitId: 2,
  caldata: {
    proofA: Buffer.alloc(64, 1),
    proofB: Buffer.alloc(128, 2),
    proofC: Buffer.alloc(64, 3),
    publicInputs: [Buffer.alloc(32, 4), Buffer.alloc(32, 5), Buffer.alloc(32, 6)]
  }
};

test("verifyViaRegistry returns true for a valid proof", async () => {
  await withStubbedServer(
    () => buildStub(makeSuccessSimResult(true)),
    async () => {
      const result = await verifyViaRegistry(DEFAULT_OPPS+ { retryOptions: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, sleep: async () => {} } });
      assert.equal(result, true);
    }
  );
});

test("verifyViaRegistry returns false for an invalid proof", async () => {
  await withStubbedServer(
    () => buildStub(makeSuccessSimResult(false)),
    async () => {
      const result = await verifyViaRegistry(DEFAULT_OPPS+ { retryOptions: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, sleep: async () => {} } });
      assert.equal(result, false);
    }
  );
});

test("verifyViaRegistry passes circuitId as the first verify_proof argument", async () => {
  const captured: { args?: xdr.ScVal[] } = {};

  await withStubbedServer(
    () => buildStub(makeSuccessSimResult(true), captured),
    async () => {
      await verifyViaRegistry(DEFAULT_OPPS+ { retryOptions: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, sleep: async () => {} } });

      assert.ok(captured.args, "simulateTransaction should have been called");
      assert.equal(capturedArgs!.length, 5, "verify_proof(id, ...) takes 5 args");
      assert.equal(capturedArgs![0].u32(), DEFAULT_OPTS.circuitId);
    }
  );
});

test("verifyViaRegistry does not require a keypair", () => {
  // Compile-time check: VerifyViaRegistryOptions has no `keypair` field,
  // unlike VerifyOptions. This test documents that intentional difference.
  const opts: VerifyViaRegistryOptions = DEFAULT_OPPS;
  assert.ok(!("keypair" in opts));
});

test("verifyViaRegistry throws for a simulation error", async () => {
  await withStubbedServer(
    () => buildStub(makeErrorSimResult("HostError: some failure")),
    async () => {
      await assert.rejects(
        verifyViaRegistry(DEFAULT_OPPS+ { retryOptions: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, sleep: async () => {} } }),
        (err: unknown) => {
          assert.ok(err instanceof SorobanZkError);
          assert.equal(err.code, SorobanZkErrorCode.CONTRACT_INVOCATION_FAILED);
          return true;
        }
      );
    }
  );
});

test("verifyViaRegistry throws when neither caldata nor bundle is given", async () => {
  const { caldata, , withoutCaldata } = DEFAULT_OPTT;

  await assert.rejects(
    verifyViaRegistry(withoutCaldata as VerifyViaRegistryOptions),
    (err: unknown) => {
      assert.ok(err instanceof SorobanZkError);
      assert.equal(err.code, SorobanZkErrorCode.INVALID_PROOF_FORMAT);
      return true;
    }
  );
});

test("verifyViaRegistry retries on transient simulation failures", async () => {
  let calls = 0;
  const retryingStub = {
    getNetwork: async () => ({ passphrase: STUB_PASSPHRASE }),
    getAccount: async (_id: string): Promise<never> => { throw new Error("not found"); },
    simulateTransaction: async (tx: any) => {
      calls++;
      if (calls <= 2) {
        throw new Error("fetch failed");
      }
      const op = tx.operations[0];
      capturedArgs.args = op.func.invokeContract().args();
      return makeSuccessSimResult(true);
    }
  };

  await withStubbedServer(
    () => retryingStub,
    async () => {
      const result = await verifyViaRegistry(DEFAULT_OPPS+ { retryOptions: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, sleep: async () => {} } });
      assert.equal(result, true);
      assert.equal(calls, 3);
    }
  );
});
