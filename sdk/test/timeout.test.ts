/**
 * Unit tests for withTimeout()/ProofGenerationTimeout (zksoroban#86) — the
 * shared mechanism `generateProof` and `verifyOnChain` both use for their
 * optional `timeoutMs`. Tested directly here against hand-rolled delayed
 * promises (the issue's own "simulate a slow proof via a delayed mock"),
 * rather than through a real circuit or RPC stub, since the timing
 * guarantees being tested belong to `withTimeout` itself regardless of
 * which caller uses it.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ProofGenerationTimeout, SorobanZkError, SorobanZkErrorCode, withTimeout } from "../src/types";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("withTimeout is a no-op passthrough when timeoutMs is undefined", async () => {
  const result = await withTimeout(Promise.resolve("value"), undefined);
  assert.equal(result, "value");
});

test("withTimeout resolves with the promise's value when it finishes before the timeout", async () => {
  const fast = delay(5).then(() => "done");
  const result = await withTimeout(fast, 1000);
  assert.equal(result, "done");
});

test("withTimeout rejects with ProofGenerationTimeout when the promise is slower than timeoutMs", async () => {
  const started = Date.now();
  const slow = delay(200).then(() => "too slow");

  await assert.rejects(
    withTimeout(slow, 20),
    (err: unknown) => {
      assert.ok(err instanceof ProofGenerationTimeout);
      assert.ok(err instanceof SorobanZkError);
      assert.equal(err.code, SorobanZkErrorCode.PROOF_GENERATION_TIMEOUT);
      assert.equal(err.name, "ProofGenerationTimeout");
      assert.equal(err.timeoutMs, 20);
      assert.ok(err.elapsedMs >= 20, "elapsedMs should be at least the configured timeout");
      return true;
    }
  );

  const elapsed = Date.now() - started;
  assert.ok(elapsed < 200, "should reject around the 20ms timeout, not wait out the full 200ms promise");
});

test("withTimeout propagates the promise's own rejection when it rejects before the timeout", async () => {
  const fails = delay(5).then(() => {
    throw new Error("real failure");
  });

  await assert.rejects(withTimeout(fails, 1000), /real failure/);
});

test("a promise that rejects after the timeout already fired does not surface as an unhandled rejection", async () => {
  let unhandled = false;
  const onUnhandledRejection = () => {
    unhandled = true;
  };
  process.on("unhandledRejection", onUnhandledRejection);

  try {
    const slowFailure = delay(30).then(() => {
      throw new Error("late failure, after the timeout already won the race");
    });

    await assert.rejects(withTimeout(slowFailure, 5), ProofGenerationTimeout);

    // Give the abandoned `slowFailure` promise time to actually reject and
    // for Node to decide whether it was "handled" -- withTimeout's own
    // `.catch(() => {})` on the losing side should prevent this from ever
    // firing.
    await delay(60);
    assert.equal(unhandled, false, "the late rejection should have been swallowed, not left unhandled");
  } finally {
    process.off("unhandledRejection", onUnhandledRejection);
  }
});
