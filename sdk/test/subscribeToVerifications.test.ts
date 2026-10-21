/**
 * Unit tests for subscribeToVerifications() (zksoroban#32).
 *
 * Like getContractConfig.test.ts, the RPC layer is replaced with a
 * lightweight stub returning pre-built getEvents responses — no funded
 * account, real contract, or real network polling interval is needed.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { Keypair, xdr } from "@stellar/stellar-sdk";

import { subscribeToVerifications } from "../src/subscribe";
import { TESTNET } from "../src/types";

import * as stellarSdk from "@stellar/stellar-sdk";

const STUB_PASSPHRASE = "Test SDF Network ; September 2015";
const CALLER_KP = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 11));

function withStubbedServer(stubFactory: () => object, fn: () => Promise<void>): Promise<void> {
  const original = (stellarSdk.rpc as any).Server;
  (stellarSdk.rpc as any).Server = function () {
    return stubFactory();
  };
  return fn().finally(() => {
    (stellarSdk.rpc as any).Server = original;
  });
}

function callerScVal(): xdr.ScVal {
  return xdr.ScVal.scvAddress(
    xdr.ScAddress.scAddressTypeAccount(
      xdr.PublicKey.publicKeyTypeEd25519(CALLER_KP.rawPublicKey())
    )
  );
}

function verificationResultScVal(success: boolean, inputsHashByte: number): xdr.ScVal {
  const entry = (key: string, val: xdr.ScVal) =>
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val });

  return xdr.ScVal.scvMap([
    entry("caller", callerScVal()),
    entry("inputs_hash", xdr.ScVal.scvBytes(Buffer.alloc(32, inputsHashByte))),
    entry("success", xdr.ScVal.scvBool(success))
  ]);
}

interface FakeEvent {
  ledger: number;
  transactionIndex: number;
  operationIndex: number;
  txHash: string;
  success: boolean;
  inputsHashByte: number;
}

function buildEventResponse(e: FakeEvent): object {
  return {
    id: `${e.ledger}-${e.transactionIndex}-${e.operationIndex}`,
    type: "contract",
    ledger: e.ledger,
    ledgerClosedAt: new Date().toISOString(),
    transactionIndex: e.transactionIndex,
    operationIndex: e.operationIndex,
    inSuccessfulContractCall: true,
    txHash: e.txHash,
    topic: [],
    value: verificationResultScVal(e.success, e.inputsHashByte)
  };
}

/** Collects up to `limit` events, then returns (calling .return() on the iterator via `break`). */
async function collect(
  iterable: AsyncIterable<import("../src/subscribe").VerificationEvent>,
  limit: number
): Promise<import("../src/subscribe").VerificationEvent[]> {
  const results: import("../src/subscribe").VerificationEvent[] = [];
  for await (const event of iterable) {
    results.push(event);
    if (results.length >= limit) {
      break;
    }
  }
  return results;
}

test("subscribeToVerifications yields events in ledger order even when a single response returns them out of order", async () => {
  let getEventsCalls = 0;

  await withStubbedServer(
    () => ({
      getNetwork: async () => ({ passphrase: STUB_PASSPHRASE }),
      getLatestLedger: async () => ({ sequence: 100 }),
      getEvents: async () => {
        getEventsCalls += 1;
        // Deliberately scrambled: ledger 102 first, then 100, then 101.
        return {
          events: [
            buildEventResponse({ ledger: 102, transactionIndex: 0, operationIndex: 0, txHash: "c".repeat(64), success: true, inputsHashByte: 3 }),
            buildEventResponse({ ledger: 100, transactionIndex: 0, operationIndex: 0, txHash: "a".repeat(64), success: true, inputsHashByte: 1 }),
            buildEventResponse({ ledger: 101, transactionIndex: 0, operationIndex: 0, txHash: "b".repeat(64), success: false, inputsHashByte: 2 })
          ],
          cursor: "cursor-1",
          latestLedger: 102,
          oldestLedger: 1,
          latestLedgerCloseTime: "",
          oldestLedgerCloseTime: ""
        };
      }
    }),
    async () => {
      const events = await collect(subscribeToVerifications({ network: TESTNET }), 3);

      assert.equal(getEventsCalls, 1, "a single getEvents call already had all 3 events");
      assert.deepEqual(
        events.map((e) => e.ledger),
        [100, 101, 102],
        "yielded in ascending ledger order, not response order"
      );
      assert.equal(events[0].txHash, "a".repeat(64));
      assert.equal(events[1].success, false);
      assert.equal(events[2].txHash, "c".repeat(64));
    }
  );
});

test("subscribeToVerifications decodes success, caller, inputsHash, ledger, and txHash", async () => {
  await withStubbedServer(
    () => ({
      getNetwork: async () => ({ passphrase: STUB_PASSPHRASE }),
      getLatestLedger: async () => ({ sequence: 100 }),
      getEvents: async () => ({
        events: [
          buildEventResponse({ ledger: 50, transactionIndex: 0, operationIndex: 0, txHash: "d".repeat(64), success: true, inputsHashByte: 7 })
        ],
        cursor: "cursor-1",
        latestLedger: 50,
        oldestLedger: 1,
        latestLedgerCloseTime: "",
        oldestLedgerCloseTime: ""
      })
    }),
    async () => {
      const [event] = await collect(subscribeToVerifications({ network: TESTNET }), 1);

      assert.equal(event.success, true);
      assert.equal(event.caller, CALLER_KP.publicKey());
      assert.deepEqual(event.inputsHash, Buffer.alloc(32, 7));
      assert.equal(event.ledger, 50);
      assert.equal(event.txHash, "d".repeat(64));
    }
  );
});

test("subscribeToVerifications stops polling once the consumer breaks out of the loop", async () => {
  let getEventsCalls = 0;

  await withStubbedServer(
    () => ({
      getNetwork: async () => ({ passphrase: STUB_PASSPHRASE }),
      getLatestLedger: async () => ({ sequence: 100 }),
      getEvents: async () => {
        getEventsCalls += 1;
        return {
          events: [
            buildEventResponse({ ledger: 100, transactionIndex: 0, operationIndex: 0, txHash: "a".repeat(64), success: true, inputsHashByte: 1 }),
            buildEventResponse({ ledger: 100, transactionIndex: 1, operationIndex: 0, txHash: "b".repeat(64), success: true, inputsHashByte: 2 })
          ],
          cursor: "cursor-1",
          latestLedger: 100,
          oldestLedger: 1,
          latestLedgerCloseTime: "",
          oldestLedgerCloseTime: ""
        };
      }
    }),
    async () => {
      // Break after the first of two events in the same batch -- proves
      // the generator doesn't just stop polling afterward, but stops
      // yielding mid-batch too.
      const events = await collect(subscribeToVerifications({ network: TESTNET }), 1);

      assert.equal(events.length, 1);
      assert.equal(getEventsCalls, 1, "must not poll a second time after the consumer stopped");
    }
  );
});

test("subscribeToVerifications uses the given startLedger instead of fetching the latest ledger", async () => {
  let getLatestLedgerCalls = 0;
  let receivedStartLedger: number | undefined;

  await withStubbedServer(
    () => ({
      getNetwork: async () => ({ passphrase: STUB_PASSPHRASE }),
      getLatestLedger: async () => {
        getLatestLedgerCalls += 1;
        return { sequence: 999 };
      },
      getEvents: async (request: { startLedger?: number }) => {
        receivedStartLedger = request.startLedger;
        return {
          events: [
            buildEventResponse({ ledger: 42, transactionIndex: 0, operationIndex: 0, txHash: "e".repeat(64), success: true, inputsHashByte: 1 })
          ],
          cursor: "cursor-1",
          latestLedger: 42,
          oldestLedger: 1,
          latestLedgerCloseTime: "",
          oldestLedgerCloseTime: ""
        };
      }
    }),
    async () => {
      await collect(subscribeToVerifications({ network: TESTNET, startLedger: 42 }), 1);

      assert.equal(getLatestLedgerCalls, 0, "explicit startLedger means getLatestLedger is never called");
      assert.equal(receivedStartLedger, 42);
    }
  );
});

test("subscribeToVerifications is exported from the SDK entry point", async () => {
  const sdk = await import("../src/index");
  assert.ok("subscribeToVerifications" in sdk, "subscribeToVerifications exported from index");
});
