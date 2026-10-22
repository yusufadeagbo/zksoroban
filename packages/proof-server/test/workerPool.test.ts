import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { WorkerPool } from "../src/workerPool.js";

describe("WorkerPool Thread Lifecycle", () => {
  test("initializes worker threads and handles file-missing gracefully", async () => {
    const pool = new WorkerPool(2);
    assert.equal(pool.size, 2);
    assert.equal(pool.queueLength, 0);

    // Attempting to execute with non-existent circuit file should reject with descriptive error
    await assert.rejects(
      pool.execute({
        circuit: "poseidon_preimage",
        secret: "123",
        commitment: "456",
        wasmPath: "./non-existent-circuit.wasm",
        zkeyPath: "./non-existent-circuit.zkey"
      }),
      (err: Error) => {
        assert.ok(err.message.includes("not found"));
        return true;
      }
    );

    await pool.close();
  });
});
