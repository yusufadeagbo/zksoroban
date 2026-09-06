/**
 * Unit tests for ProofResultCache and its integration with verifyViaRegistry /
 * verifyBatchViaRegistry.
 *
 * Tests cover:
 *  - cache miss on empty cache
 *  - cache hit after set
 *  - LRU eviction when maxSize is reached
 *  - TTL expiry
 *  - clear() resets both entries and counters
 *  - stats() reports correct hit/miss/size/maxSize/ttlMs
 *  - computeCacheKey differentiates distinct inputs
 *  - verifyViaRegistry: first call misses → stores; second call hits → no simulate
 *  - verifyViaRegistry without cache: simulate called every time
 *  - verifyBatchViaRegistry: all-hit path skips simulate; partial-miss re-runs full batch
 *  - verifyBatchViaRegistry stores results in cache after simulate
 */

import assert from "node:assert/strict";
import test from "node:test";

import { xdr } from "@stellar/stellar-sdk";
import * as stellarSdk from "@stellar/stellar-sdk";

import { ProofResultCache, computeCacheKey } from "../src/cache";
import { verifyViaRegistry } from "../src/verify";
import { verifyBatchViaRegistry } from "../src/verify";
import {
  SorobanProofCalldata,
  VerifyViaRegistryOptions,
  VerifyBatchViaRegistryOptions
} from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STUB_PASSPHRASE = "Test SDF Network ; September 2015";
const REGISTRY_CONTRACT = "CDTPNARKKZCZ36PL4BNKBXZTT2BLVR373S2K5NCFAOKCPPY62ESRHSXH";

/** Minimal SorobanProofCalldata for keying tests. */
function makeCalldata(fill = 1): SorobanProofCalldata {
  return {
    proofA: Buffer.alloc(64, fill),
    proofB: Buffer.alloc(128, fill + 1),
    proofC: Buffer.alloc(64, fill + 2),
    publicInputs: [Buffer.alloc(32, fill + 3)]
  };
}

/**
 * Replace rpc.Server with a lightweight stub for the duration of `fn`.
 * Returns the number of times `simulateTransaction` was called.
 */
function withStubbedServer(
  simResult: object,
  fn: (simulateCallCount: () => number) => Promise<void>
): Promise<void> {
  let count = 0;
  const original = (stellarSdk.rpc as any).Server;
  (stellarSdk.rpc as any).Server = function () {
    return {
      getNetwork: async () => ({ passphrase: STUB_PASSPHRASE }),
      getAccount: async (_id: string): Promise<never> => {
        throw new Error("account not found (stub)");
      },
      simulateTransaction: async (_tx: any) => {
        count++;
        return simResult;
      }
    };
  };
  return fn(() => count).finally(() => {
    (stellarSdk.rpc as any).Server = original;
  });
}

function makeSimResult(value: boolean): object {
  return {
    result: { retval: xdr.ScVal.scvBool(value) },
    minResourceFee: "100",
    transactionData: "",
    events: [],
    latestLedger: 1
  };
}

function makeBatchSimResult(values: boolean[]): object {
  return {
    result: {
      retval: xdr.ScVal.scvVec(values.map((v) => xdr.ScVal.scvBool(v)))
    },
    minResourceFee: "100",
    transactionData: "",
    events: [],
    latestLedger: 1
  };
}

const VALID_CALLDATA = makeCalldata(1);

const BASE_REGISTRY_OPTS: VerifyViaRegistryOptions = {
  rpcUrl: "http://localhost:8000",
  registryContractId: REGISTRY_CONTRACT,
  circuitId: 1,
  calldata: VALID_CALLDATA
};

// ---------------------------------------------------------------------------
// ProofResultCache — unit tests
// ---------------------------------------------------------------------------

test("ProofResultCache: miss on empty cache", () => {
  const cache = new ProofResultCache();
  assert.equal(cache.get("nonexistent"), undefined);
  assert.equal(cache.stats().misses, 1);
  assert.equal(cache.stats().hits, 0);
});

test("ProofResultCache: hit after set", () => {
  const cache = new ProofResultCache();
  cache.set("k1", true);
  assert.equal(cache.get("k1"), true);
  assert.equal(cache.stats().hits, 1);
  assert.equal(cache.stats().misses, 0);
  assert.equal(cache.stats().size, 1);
});

test("ProofResultCache: stores false result", () => {
  const cache = new ProofResultCache();
  cache.set("k1", false);
  assert.equal(cache.get("k1"), false);
});

test("ProofResultCache: update replaces value in place", () => {
  const cache = new ProofResultCache({ maxSize: 2 });
  cache.set("k1", true);
  cache.set("k1", false);
  assert.equal(cache.get("k1"), false);
  // Only one entry despite two sets.
  assert.equal(cache.stats().size, 1);
});

test("ProofResultCache: LRU eviction at maxSize", () => {
  const cache = new ProofResultCache({ maxSize: 3 });
  cache.set("a", true);   // LRU order: a
  cache.set("b", true);   // LRU order: b, a
  cache.set("c", true);   // LRU order: c, b, a  — size=3, full
  // Access "a" so "b" becomes LRU.
  cache.get("a");          // LRU order: a, c, b
  cache.set("d", true);   // evicts "b" (LRU)
  assert.equal(cache.stats().size, 3);
  assert.equal(cache.get("b"), undefined, '"b" should have been evicted');
  assert.notEqual(cache.get("a"), undefined, '"a" should still be present');
  assert.notEqual(cache.get("c"), undefined, '"c" should still be present');
  assert.notEqual(cache.get("d"), undefined, '"d" should still be present');
});

test("ProofResultCache: oldest entry evicted when maxSize=1", () => {
  const cache = new ProofResultCache({ maxSize: 1 });
  cache.set("first", true);
  cache.set("second", false);
  assert.equal(cache.get("first"), undefined, '"first" should be evicted');
  assert.equal(cache.get("second"), false, '"second" should survive');
});

test("ProofResultCache: TTL expiry returns undefined and counts as miss", async () => {
  const cache = new ProofResultCache({ ttlMs: 10 });
  cache.set("k", true);
  // Entry is fresh — should hit.
  assert.equal(cache.get("k"), true);
  // Wait for TTL to expire.
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(cache.get("k"), undefined, "entry should be expired");
  assert.equal(cache.stats().misses, 1, "expired read counted as miss");
});

test("ProofResultCache: entries without TTL never expire", async () => {
  const cache = new ProofResultCache(); // no ttlMs
  cache.set("k", true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(cache.get("k"), true, "entry should still be present");
});

test("ProofResultCache: clear() removes all entries and resets counters", () => {
  const cache = new ProofResultCache();
  cache.set("a", true);
  cache.set("b", false);
  cache.get("a"); // increment hit
  cache.get("missing"); // increment miss
  cache.clear();
  assert.equal(cache.stats().size, 0);
  assert.equal(cache.stats().hits, 0);
  assert.equal(cache.stats().misses, 0);
  assert.equal(cache.get("a"), undefined);
});

test("ProofResultCache: stats() reflects maxSize and ttlMs", () => {
  const cache = new ProofResultCache({ maxSize: 10, ttlMs: 5000 });
  const s = cache.stats();
  assert.equal(s.maxSize, 10);
  assert.equal(s.ttlMs, 5000);
  assert.equal(s.size, 0);
});

test("ProofResultCache: stats() has undefined ttlMs when none set", () => {
  const cache = new ProofResultCache({ maxSize: 10 });
  assert.equal(cache.stats().ttlMs, undefined);
});

test("ProofResultCache: default maxSize is 256", () => {
  const cache = new ProofResultCache();
  assert.equal(cache.stats().maxSize, 256);
});

// ---------------------------------------------------------------------------
// computeCacheKey — differentiates distinct inputs
// ---------------------------------------------------------------------------

test("computeCacheKey: same inputs produce the same key", () => {
  const cd = makeCalldata(5);
  const k1 = computeCacheKey(REGISTRY_CONTRACT, 1, cd);
  const k2 = computeCacheKey(REGISTRY_CONTRACT, 1, cd);
  assert.equal(k1, k2);
});

test("computeCacheKey: different contractId → different key", () => {
  const cd = makeCalldata(5);
  const k1 = computeCacheKey("CONTRACT_A", 1, cd);
  const k2 = computeCacheKey("CONTRACT_B", 1, cd);
  assert.notEqual(k1, k2);
});

test("computeCacheKey: different circuitId → different key", () => {
  const cd = makeCalldata(5);
  const k1 = computeCacheKey(REGISTRY_CONTRACT, 1, cd);
  const k2 = computeCacheKey(REGISTRY_CONTRACT, 2, cd);
  assert.notEqual(k1, k2);
});

test("computeCacheKey: different proofA → different key", () => {
  const cd1 = makeCalldata(1);
  const cd2 = { ...makeCalldata(1), proofA: Buffer.alloc(64, 99) };
  const k1 = computeCacheKey(REGISTRY_CONTRACT, 1, cd1);
  const k2 = computeCacheKey(REGISTRY_CONTRACT, 1, cd2);
  assert.notEqual(k1, k2);
});

test("computeCacheKey: different publicInputs → different key", () => {
  const cd1 = makeCalldata(1);
  const cd2 = {
    ...makeCalldata(1),
    publicInputs: [Buffer.alloc(32, 0xaa)]
  };
  const k1 = computeCacheKey(REGISTRY_CONTRACT, 1, cd1);
  const k2 = computeCacheKey(REGISTRY_CONTRACT, 1, cd2);
  assert.notEqual(k1, k2);
});

test("computeCacheKey: returns a 64-character hex string (SHA-256)", () => {
  const k = computeCacheKey(REGISTRY_CONTRACT, 1, makeCalldata(1));
  assert.match(k, /^[0-9a-f]{64}$/);
});

// ---------------------------------------------------------------------------
// verifyViaRegistry integration with cache
// ---------------------------------------------------------------------------

test("verifyViaRegistry: cache miss on first call, hit on second (no simulate second time)", async () => {
  const cache = new ProofResultCache();

  await withStubbedServer(makeSimResult(true), async (simulateCount) => {
    const opts: VerifyViaRegistryOptions = { ...BASE_REGISTRY_OPTS, cache };

    const result1 = await verifyViaRegistry(opts);
    assert.equal(result1, true);
    assert.equal(simulateCount(), 1, "simulate called once on miss");

    const result2 = await verifyViaRegistry(opts);
    assert.equal(result2, true);
    assert.equal(simulateCount(), 1, "simulate NOT called again on hit");
  });

  assert.equal(cache.stats().hits, 1);
  assert.equal(cache.stats().misses, 1);
  assert.equal(cache.stats().size, 1);
});

test("verifyViaRegistry: without cache, simulate is called every time", async () => {
  await withStubbedServer(makeSimResult(true), async (simulateCount) => {
    const opts: VerifyViaRegistryOptions = { ...BASE_REGISTRY_OPTS };

    await verifyViaRegistry(opts);
    await verifyViaRegistry(opts);

    assert.equal(simulateCount(), 2, "simulate called twice without cache");
  });
});

test("verifyViaRegistry: caches a false result", async () => {
  const cache = new ProofResultCache();

  await withStubbedServer(makeSimResult(false), async (simulateCount) => {
    const opts: VerifyViaRegistryOptions = { ...BASE_REGISTRY_OPTS, cache };

    const result1 = await verifyViaRegistry(opts);
    assert.equal(result1, false);

    const result2 = await verifyViaRegistry(opts);
    assert.equal(result2, false);
    assert.equal(simulateCount(), 1, "simulate called only once");
  });
});

test("verifyViaRegistry: different circuitId → separate cache entries", async () => {
  const cache = new ProofResultCache();

  await withStubbedServer(makeSimResult(true), async (simulateCount) => {
    await verifyViaRegistry({ ...BASE_REGISTRY_OPTS, circuitId: 1, cache });
    await verifyViaRegistry({ ...BASE_REGISTRY_OPTS, circuitId: 2, cache });

    // Both are misses → 2 simulate calls; then cached separately.
    assert.equal(simulateCount(), 2);
    assert.equal(cache.stats().size, 2);
  });
});

test("verifyViaRegistry: different proofA → separate cache entries", async () => {
  const cache = new ProofResultCache();
  const cd2 = { ...VALID_CALLDATA, proofA: Buffer.alloc(64, 9) };

  await withStubbedServer(makeSimResult(true), async (simulateCount) => {
    await verifyViaRegistry({ ...BASE_REGISTRY_OPTS, cache });
    await verifyViaRegistry({ ...BASE_REGISTRY_OPTS, calldata: cd2, cache });

    assert.equal(simulateCount(), 2, "two different proofs → two simulate calls");
    assert.equal(cache.stats().size, 2);
  });
});

test("verifyViaRegistry: TTL expiry causes re-simulate", async () => {
  const cache = new ProofResultCache({ ttlMs: 10 });

  await withStubbedServer(makeSimResult(true), async (simulateCount) => {
    const opts: VerifyViaRegistryOptions = { ...BASE_REGISTRY_OPTS, cache };

    await verifyViaRegistry(opts);
    assert.equal(simulateCount(), 1);

    // Wait for TTL to expire.
    await new Promise((r) => setTimeout(r, 20));

    await verifyViaRegistry(opts);
    assert.equal(simulateCount(), 2, "simulate called again after TTL expiry");
  });
});

// ---------------------------------------------------------------------------
// verifyBatchViaRegistry integration with cache
// ---------------------------------------------------------------------------

/** Minimal valid SnarkjsProof-shaped objects (no real circuit; we stub simulate). */
const VALID_SNARKJS_PROOF = {
  pi_a: ["1", "2", "1"] as [string, string, string],
  pi_b: [
    ["1", "2"],
    ["3", "4"],
    ["1", "0"]
  ] as [[string, string], [string, string], [string, string]],
  pi_c: ["5", "6", "1"] as [string, string, string],
  protocol: "groth16" as const
};

const VALID_SIGNALS = [
  "21888242871839275222246405745257275088548364400416034343698204186575808495616"
];

const BATCH_OPTS_BASE: Omit<VerifyBatchViaRegistryOptions, "items"> = {
  rpcUrl: "http://localhost:8000",
  registryContractId: REGISTRY_CONTRACT
};

test("verifyBatchViaRegistry: results stored in cache after simulate", async () => {
  const cache = new ProofResultCache();

  await withStubbedServer(makeBatchSimResult([true, false]), async (simulateCount) => {
    const items = [
      { circuitId: 1, proof: VALID_SNARKJS_PROOF, publicSignals: VALID_SIGNALS },
      { circuitId: 2, proof: VALID_SNARKJS_PROOF, publicSignals: VALID_SIGNALS }
    ];
    const opts: VerifyBatchViaRegistryOptions = { ...BATCH_OPTS_BASE, items, cache };

    const results = await verifyBatchViaRegistry(opts);
    assert.deepEqual(results, [true, false]);
    assert.equal(simulateCount(), 1);
    assert.equal(cache.stats().size, 2, "two entries stored");
  });
});

test("verifyBatchViaRegistry: all-hit path skips simulate entirely", async () => {
  const cache = new ProofResultCache();

  await withStubbedServer(makeBatchSimResult([true, false]), async (simulateCount) => {
    const items = [
      { circuitId: 1, proof: VALID_SNARKJS_PROOF, publicSignals: VALID_SIGNALS },
      { circuitId: 2, proof: VALID_SNARKJS_PROOF, publicSignals: VALID_SIGNALS }
    ];
    const opts: VerifyBatchViaRegistryOptions = { ...BATCH_OPTS_BASE, items, cache };

    // Populate the cache via first call.
    await verifyBatchViaRegistry(opts);
    assert.equal(simulateCount(), 1);

    // Second call — all items cached.
    const results2 = await verifyBatchViaRegistry(opts);
    assert.deepEqual(results2, [true, false]);
    assert.equal(simulateCount(), 1, "simulate NOT called on all-hit batch");
  });
});

test("verifyBatchViaRegistry: partial cache miss re-runs full batch", async () => {
  const cache = new ProofResultCache();

  await withStubbedServer(makeBatchSimResult([true, false]), async (simulateCount) => {
    const item1 = { circuitId: 1, proof: VALID_SNARKJS_PROOF, publicSignals: VALID_SIGNALS };
    const item2 = { circuitId: 2, proof: VALID_SNARKJS_PROOF, publicSignals: VALID_SIGNALS };

    // Prime cache with only item1 via a single-item batch.
    await verifyBatchViaRegistry({ ...BATCH_OPTS_BASE, items: [item1], cache });
    assert.equal(simulateCount(), 1);
    assert.equal(cache.stats().size, 1);

    // Call with both items — item2 is a miss → full simulate re-runs.
    await verifyBatchViaRegistry({ ...BATCH_OPTS_BASE, items: [item1, item2], cache });
    assert.equal(simulateCount(), 2, "simulate called again for partial miss");
    assert.equal(cache.stats().size, 2, "both items now cached");
  });
});

test("verifyBatchViaRegistry: without cache, simulate called every time", async () => {
  await withStubbedServer(makeBatchSimResult([true]), async (simulateCount) => {
    const items = [
      { circuitId: 1, proof: VALID_SNARKJS_PROOF, publicSignals: VALID_SIGNALS }
    ];
    const opts: VerifyBatchViaRegistryOptions = { ...BATCH_OPTS_BASE, items };

    await verifyBatchViaRegistry(opts);
    await verifyBatchViaRegistry(opts);

    assert.equal(simulateCount(), 2, "simulate called both times without cache");
  });
});
