/**
 * Unit tests for checkNetwork() (zksoroban#87).
 *
 * Like getContractConfig.test.ts, the RPC layer is replaced with a
 * lightweight stub — no funded account or real network call is needed.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { checkNetwork } from "../src/checkNetwork";
import { TESTNET } from "../src/types";

import * as stellarSdk from "@stellar/stellar-sdk";

function withStubbedServer(stubFactory: () => object, fn: () => Promise<void>): Promise<void> {
  const original = (stellarSdk.rpc as any).Server;
  (stellarSdk.rpc as any).Server = function () {
    return stubFactory();
  };
  return fn().finally(() => {
    (stellarSdk.rpc as any).Server = original;
  });
}

function withStubbedWarn(fn: (calls: unknown[][]) => Promise<void>): Promise<void> {
  const calls: unknown[][] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    calls.push(args);
  };
  return fn(calls).finally(() => {
    console.warn = original;
  });
}

test("checkNetwork returns reachable: true with latency and network info on success", async () => {
  await withStubbedServer(
    () => ({
      getNetwork: async () => ({ passphrase: TESTNET.networkPassphrase, protocolVersion: "21" })
    }),
    async () => {
      const health = await checkNetwork(TESTNET);

      assert.equal(health.reachable, true);
      assert.equal(typeof health.latencyMs, "number");
      assert.ok((health.latencyMs as number) >= 0);
      assert.equal(health.networkPassphrase, TESTNET.networkPassphrase);
      assert.equal(health.protocolVersion, "21");
      assert.equal(health.error, undefined);
    }
  );
});

test("checkNetwork returns reachable: false with an error message when the endpoint is unreachable", async () => {
  await withStubbedServer(
    () => ({
      getNetwork: async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:8000");
      }
    }),
    async () => {
      const health = await checkNetwork({ ...TESTNET, rpcUrl: "http://127.0.0.1:8000" });

      assert.equal(health.reachable, false);
      assert.equal(health.error, "connect ECONNREFUSED 127.0.0.1:8000");
      assert.equal(health.latencyMs, undefined);
      assert.equal(health.networkPassphrase, undefined);
      assert.equal(health.protocolVersion, undefined);
    }
  );
});

test("checkNetwork warns, but still reports reachable: true, when the passphrase doesn't match", async () => {
  await withStubbedWarn(async (calls) => {
    await withStubbedServer(
      () => ({
        getNetwork: async () => ({
          passphrase: "Public Global Stellar Network ; September 2015",
          protocolVersion: "21"
        })
      }),
      async () => {
        const health = await checkNetwork(TESTNET);

        assert.equal(health.reachable, true, "a passphrase mismatch is a warning, not an unreachable endpoint");
        assert.equal(health.networkPassphrase, "Public Global Stellar Network ; September 2015");
        assert.equal(calls.length, 1, "exactly one warning should be emitted");
      }
    );
  });
});

test("checkNetwork does not warn when the passphrase matches", async () => {
  await withStubbedWarn(async (calls) => {
    await withStubbedServer(
      () => ({
        getNetwork: async () => ({ passphrase: TESTNET.networkPassphrase, protocolVersion: "21" })
      }),
      async () => {
        await checkNetwork(TESTNET);
        assert.equal(calls.length, 0);
      }
    );
  });
});

test("checkNetwork is exported from the SDK entry point", async () => {
  const sdk = await import("../src/index");
  assert.ok("checkNetwork" in sdk, "checkNetwork exported from index");
});
