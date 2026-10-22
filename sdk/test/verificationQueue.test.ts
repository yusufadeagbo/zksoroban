/**
 * Unit tests for createVerificationQueue()'s semaphore behavior.
 *
 * The RPC layer is replaced with a lightweight stub, the same way
 * verify.unit.test.ts does it — no funded account or real network call is
 * needed. Concurrency is observed deterministically by gating the stub's
 * first RPC request (`getNetwork`, verifyOnChain's first await) with
 * manually resolved promises, so at any point the test knows exactly how
 * many verifications are in flight.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { Keypair, rpc } from "@stellar/stellar-sdk";

import * as stellarSdk from "@stellar/stellar-sdk";

import { createVerificationQueue } from "../src/verificationQueue";
import { SorobanZkError, SorobanZkErrorCode, VerifyOptions, VerifyResult } from "../src/types";
import { xdr } from "@stellar/stellar-sdk";

const STUB_PASSPHRASE = "Test SDF Network ; September 2015";
const STUB_KEYPAIR = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 11));

function withStubbedServer(
  stubFactory: () => object,
  fn: () => Promise<void>
): Promise<void> {
  const original = (stellarSdk.rpc as any).Server;
  (stellarSdk.rpc as any).Server = function () {
    return stubFactory();
  };
  return fn().finally(() => {
    (stellarSdk.rpc as any).Server = original;
  });
}

function buildTransactionResult(feeCharged = "100"): xdr.TransactionResult {
  const result = xdr.TransactionResultResult.txSuccess([]);
  const ext = xdr.TransactionResultExt.v0();
  return new xdr.TransactionResult({
    feeCharged: xdr.Int64.fromString(feeCharged),
    result,
    ext
  });
}

/**
 * Tracks how many verifications are simultaneously inside the RPC layer.
 * `getNetwork` is verifyOnChain's first await, so counting entries into
 * it (and never releasing a gate until the test says so) pins down the
 * exact in-flight count at every point of the test.
 */
interface GateState {
  /** Verifications currently inside the gated RPC call. */
  active: number;
  /** Highest `active` ever reached. */
  maxActive: number;
  /** Total gated-call entries so far (= started verifications). */
  started: number;
  /** One promise-resolution callback per entry, in arrival order. */
  gates: Array<() => void>;
}

function newGateState(): GateState {
  return { active: 0, maxActive: 0, started: 0, gates: [] };
}

function buildGatedSuccessStub(state: GateState) {
  return {
    getNetwork: async () => {
      state.started += 1;
      state.active += 1;
      state.maxActive = Math.max(state.maxActive, state.active);
      await new Promise<void>((resolve) => state.gates.push(resolve));
      state.active -= 1;
      return { passphrase: STUB_PASSPHRASE };
    },
    getAccount: async (id: string) => new stellarSdk.Account(id, "0"),
    prepareTransaction: async (tx: any) => tx,
    sendTransaction: async () => ({ status: "PENDING", hash: "a".repeat(64) }),
    getTransaction: async () => ({
      status: rpc.Api.GetTransactionStatus.SUCCESS,
      txHash: "b".repeat(64),
      ledger: 12345,
      resultXdr: buildTransactionResult(),
      returnValue: xdr.ScVal.scvBool(true)
    })
  };
}

const DEFAULT_OPTS: VerifyOptions = {
  network: {
    rpcUrl: "http://localhost:8000",
    networkPassphrase: STUB_PASSPHRASE,
    contractId: "CBL6MAWJALQP25LYKUUOC34K464XPSF6BLKUW6MXZDEXEDXMQUSP7HNN"
  },
  keypair: STUB_KEYPAIR,
  calldata: {
    proofA: Buffer.alloc(64, 1),
    proofB: Buffer.alloc(128, 2),
    proofC: Buffer.alloc(64, 3),
    publicInputs: [Buffer.alloc(32, 4)]
  }
};

/** Release the gate of the i-th started verification (0-based). */
function releaseGate(state: GateState, i: number): void {
  const gate = state.gates[i];
  assert.ok(gate, `gate ${i} should exist`);
  gate();
}

test("createVerificationQueue respects the concurrency cap under load", async () => {
  const state = newGateState();

  await withStubbedServer(
    () => buildGatedSuccessStub(state),
    async () => {
      const queue = createVerificationQueue({ concurrency: 2 });

      // Fire 6 verifications against a 2-slot queue: 2 run, 4 queue.
      const results = Array.from({ length: 6 }, () => queue.verify(DEFAULT_OPTS));

      assert.equal(queue.running, 2, "cap allows exactly 2 running immediately");
      assert.equal(queue.pending, 4, "excess calls wait in the queue");
      assert.equal(state.started, 2, "only 2 verifications have entered the RPC layer");
      assert.equal(state.active, 2);

      // Free the first two slots: their verifications complete and the
      // next two queued jobs take their place.
      releaseGate(state, 0);
      releaseGate(state, 1);
      const [first, second] = await Promise.all([results[0], results[1]]);
      assert.deepEqual(first, { verified: true, txHash: "b".repeat(64), ledger: 12345, fee: "100" } satisfies VerifyResult);
      assert.equal(second.verified, true);

      assert.equal(queue.running, 2, "freed slots are refilled by queued jobs");
      assert.equal(queue.pending, 2, "two jobs still wait");
      assert.equal(state.started, 4, "verifications 3 and 4 have started");

      // Free the next two slots the same way.
      releaseGate(state, 2);
      releaseGate(state, 3);
      await Promise.all([results[2], results[3]]);

      assert.equal(queue.running, 2, "the last two queued jobs are running");
      assert.equal(queue.pending, 0);
      assert.equal(state.started, 6);

      releaseGate(state, 4);
      releaseGate(state, 5);
      const settled = await Promise.all(results);
      assert.equal(settled.length, 6);
      assert.ok(settled.every((r) => r.verified), "every queued job completes");

      assert.equal(queue.running, 0, "queue drains to 0 running");
      assert.equal(queue.pending, 0, "queue drains to 0 pending");
      assert.equal(state.maxActive, 2, "at most 2 verifications were ever in flight");
    }
  );
});

test("createVerificationQueue starts queued jobs as soon as a slot opens (concurrency 1)", async () => {
  const state = newGateState();

  await withStubbedServer(
    () => buildGatedSuccessStub(state),
    async () => {
      const queue = createVerificationQueue({ concurrency: 1 });

      const results = [queue.verify(DEFAULT_OPTS), queue.verify(DEFAULT_OPTS), queue.verify(DEFAULT_OPTS)];

      assert.equal(queue.running, 1);
      assert.equal(queue.pending, 2);
      assert.equal(state.started, 1);

      releaseGate(state, 0);
      await results[0];

      // Slot 1 handed over to the next queued job without any delay.
      assert.equal(queue.running, 1);
      assert.equal(queue.pending, 1);
      assert.equal(state.started, 2);

      releaseGate(state, 1);
      await results[1];

      assert.equal(queue.running, 1);
      assert.equal(queue.pending, 0);
      assert.equal(state.started, 3);

      releaseGate(state, 2);
      await Promise.all(results);

      assert.equal(queue.running, 0);
      assert.equal(queue.pending, 0);
      assert.equal(state.maxActive, 1);
      assert.equal(state.started, 3);
    }
  );
});

test("createVerificationQueue rejects a failing verification without breaking the rest of the queue", async () => {
  const state = newGateState();

  await withStubbedServer(
    () => ({
      ...buildGatedSuccessStub(state),
      // The first submission fails; later submissions (other jobs in the
      // same queue) go through.
      sendTransaction: async () => {
        if (state.started === 1) {
          throw new SorobanZkError(
            "Transaction submission failed with status ERROR",
            SorobanZkErrorCode.TRANSACTION_REJECTED
          );
        }
        return { status: "PENDING", hash: "a".repeat(64) };
      }
    }),
    async () => {
      const queue = createVerificationQueue({ concurrency: 1 });
      const failing = queue.verify(DEFAULT_OPTS);
      const ok = queue.verify(DEFAULT_OPTS);

      assert.equal(queue.pending, 1, "the second verification waits");

      // Push the first verification through the gate into sendTransaction,
      // which fails for started === 1.
      releaseGate(state, 0);

      await assert.rejects(failing, (err: unknown) => {
        assert.ok(err instanceof SorobanZkError);
        assert.equal(err.code, SorobanZkErrorCode.TRANSACTION_REJECTED);
        return true;
      });

      // The failed job frees its slot and the waiting one takes over.
      assert.equal(queue.running, 1, "a failed job frees its slot for the next one");
      assert.equal(queue.pending, 0);
      assert.equal(state.started, 2, "the queued job has started");

      releaseGate(state, 1);
      assert.equal((await ok).verified, true, "the queued job still completes");
      assert.equal(queue.running, 0);
    }
  );
});

test("createVerificationQueue surfaces error codes unchanged from verifyOnChain", async () => {
  const original = (stellarSdk.rpc as any).Server;
  (stellarSdk.rpc as any).Server = function () {
    return {
      getNetwork: async () => ({ passphrase: STUB_PASSPHRASE }),
      getAccount: async (id: string) => new stellarSdk.Account(id, "0"),
      prepareTransaction: async () => {
        throw new Error("HostError: Error(Contract, #4)");
      }
    };
  };

  try {
    const queue = createVerificationQueue({ concurrency: 1 });
    await assert.rejects(
      queue.verify(DEFAULT_OPTS),
      (err: unknown) => {
        assert.ok(err instanceof SorobanZkError);
        assert.equal(err.code, SorobanZkErrorCode.PROOF_EXPIRED);
        return true;
      }
    );
    assert.equal(queue.pending, 0);
  } finally {
    (stellarSdk.rpc as any).Server = original;
  }
});

test("createVerificationQueue rejects a non-positive concurrency", () => {
  assert.throws(() => createVerificationQueue({ concurrency: 0 }), SorobanZkError);
  assert.throws(() => createVerificationQueue({ concurrency: -1 }), SorobanZkError);
  assert.throws(() => createVerificationQueue({ concurrency: 1.5 }), SorobanZkError);
});

test("a fresh queue reports 0 running and 0 pending", () => {
  const queue = createVerificationQueue({ concurrency: 2 });
  assert.equal(queue.running, 0);
  assert.equal(queue.pending, 0);
});
