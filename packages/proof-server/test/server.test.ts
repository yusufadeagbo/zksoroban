import assert from "node:assert/strict";
import test, { describe, before, after } from "node:test";
import type { Server } from "node:http";
import { createApp } from "../src/app.js";
import { WorkerPool } from "../src/workerPool.js";
import type { ProveSuccessResponse } from "../src/types.js";

// Mock worker pool for fast, circuit-free testing
class MockWorkerPool extends WorkerPool {
  public mockDelayMs = 20;
  public mockFail = false;
  public mockFailConstraint = false;
  public executedJobs: any[] = [];

  constructor() {
    super(0);
  }

  // Override execute to simulate asynchronous proving without needing compiled circuit wasm
  public override async execute(jobData: any): Promise<ProveSuccessResponse> {
    this.executedJobs.push(jobData);
    if (this.mockDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.mockDelayMs));
    }
    if (this.mockFailConstraint) {
      throw new Error("PROOF_GENERATION_FAILED: witness calculation failed, input does not satisfy constraints");
    }
    if (this.mockFail) {
      throw new Error("Internal worker crash or unexpected failure");
    }
    return {
      proof: {
        pi_a: ["1", "2", "1"],
        pi_b: [
          ["1", "2"],
          ["3", "4"],
          ["1", "0"]
        ],
        pi_c: ["5", "6", "1"],
        protocol: "groth16",
        curve: "bn128"
      },
      publicSignals: [jobData.commitment]
    };
  }

  public override async close(): Promise<void> {
    // Mock cleanup
  }
}

describe("Proof Generation HTTP Server", () => {
  let server: Server;
  let port: number;
  let mockPool: MockWorkerPool;
  const TEST_API_KEY = "test-secret-key-123";

  before(async () => {
    mockPool = new MockWorkerPool(2);
    const app = createApp({
      workerPool: mockPool,
      apiKey: TEST_API_KEY
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (typeof addr === "object" && addr) {
          port = addr.port;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mockPool.close();
  });

  test("GET /health returns 200 with pool status", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      headers: { "x-api-key": TEST_API_KEY }
    });
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.equal(data.status, "ok");
    assert.ok(typeof data.workers === "number");
  });

  test("POST /prove returns 401 when x-api-key header is missing", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/prove`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: "1", commitment: "2" })
    });
    assert.equal(res.status, 401);
    const data = await res.json() as any;
    assert.equal(data.error, "Unauthorized");
  });

  test("POST /prove returns 401 when x-api-key header is incorrect", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/prove`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "wrong-key"
      },
      body: JSON.stringify({ secret: "1", commitment: "2" })
    });
    assert.equal(res.status, 401);
    const data = await res.json() as any;
    assert.equal(data.error, "Unauthorized");
  });

  test("POST /prove returns 400 when missing secret", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/prove`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": TEST_API_KEY
      },
      body: JSON.stringify({ commitment: "123" })
    });
    assert.equal(res.status, 400);
    const data = await res.json() as any;
    assert.equal(data.error, "Missing required input: secret");
  });

  test("POST /prove returns 400 when missing commitment", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/prove`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": TEST_API_KEY
      },
      body: JSON.stringify({ secret: "123" })
    });
    assert.equal(res.status, 400);
    const data = await res.json() as any;
    assert.equal(data.error, "Missing required input: commitment");
  });

  test("POST /prove returns 400 when secret is not numeric", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/prove`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": TEST_API_KEY
      },
      body: JSON.stringify({ secret: "not-a-number", commitment: "123" })
    });
    assert.equal(res.status, 400);
    const data = await res.json() as any;
    assert.ok(data.error.includes("Input 'secret' must be a valid integer"));
  });

  test("POST /prove returns 400 when commitment is not numeric", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/prove`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": TEST_API_KEY
      },
      body: JSON.stringify({ secret: "123", commitment: "invalid-field-val" })
    });
    assert.equal(res.status, 400);
    const data = await res.json() as any;
    assert.ok(data.error.includes("Input 'commitment' must be a valid integer"));
  });

  test("POST /prove returns 200 with proof and publicSignals on valid input", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/prove`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": TEST_API_KEY
      },
      body: JSON.stringify({
        circuit: "poseidon_preimage",
        inputs: {
          secret: "12345",
          commitment: "67890"
        }
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.ok(data.proof);
    assert.equal(data.proof.protocol, "groth16");
    assert.deepEqual(data.publicSignals, ["67890"]);
  });

  test("POST /prove supports top-level secret and commitment fields", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/prove`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": TEST_API_KEY
      },
      body: JSON.stringify({
        secret: "999",
        commitment: "888"
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.ok(data.proof);
    assert.deepEqual(data.publicSignals, ["888"]);
  });

  test("POST /prove returns 400 on constraint satisfaction failure", async () => {
    mockPool.mockFailConstraint = true;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/prove`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": TEST_API_KEY
        },
        body: JSON.stringify({
          secret: "1",
          commitment: "2"
        })
      });
      assert.equal(res.status, 400);
      const data = await res.json() as any;
      assert.ok(data.error.includes("PROOF_GENERATION_FAILED"));
    } finally {
      mockPool.mockFailConstraint = false;
    }
  });

  test("handles concurrent prove requests", async () => {
    const requests = Array.from({ length: 5 }, (_, i) =>
      fetch(`http://127.0.0.1:${port}/prove`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": TEST_API_KEY
        },
        body: JSON.stringify({
          secret: String(100 + i),
          commitment: String(200 + i)
        })
      })
    );

    const responses = await Promise.all(requests);
    for (const res of responses) {
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.ok(data.proof);
    }
  });
});

describe("Server without API key authentication", () => {
  let server: Server;
  let port: number;
  let mockPool: MockWorkerPool;

  before(async () => {
    mockPool = new MockWorkerPool(1);
    const app = createApp({
      workerPool: mockPool
      // No apiKey passed
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (typeof addr === "object" && addr) {
          port = addr.port;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mockPool.close();
  });

  test("permits requests when authentication is disabled", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/prove`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: "111", commitment: "222" })
    });
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.ok(data.proof);
  });
});
