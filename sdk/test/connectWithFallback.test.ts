import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { connectWithFallback } from "../src/verify";
import { AllEndpointsUnavailableError } from "../src/types";

const MOCK_PASSPHRASE = "Test SDF Network ; September 2015";

async function startMockRpcServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: {
            friendbotUrl: "https://friendbot.example.org",
            passphrase: MOCK_PASSPHRASE,
            protocolVersion: 21
          }
        })
      );
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("failed to determine mock server address");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
}

test("connectWithFallback falls back to the next endpoint when the first is unreachable", async () => {
  const mock = await startMockRpcServer();
  try {
    const { network } = await connectWithFallback(["http://127.0.0.1:1", mock.url]);
    assert.equal(network.passphrase, MOCK_PASSPHRASE);
  } finally {
    await mock.close();
  }
});

test("connectWithFallback accepts a single string rpcUrl for backward compatibility", async () => {
  const mock = await startMockRpcServer();
  try {
    const { network } = await connectWithFallback(mock.url);
    assert.equal(network.passphrase, MOCK_PASSPHRASE);
  } finally {
    await mock.close();
  }
});

test("connectWithFallback throws AllEndpointsUnavailableError when every endpoint fails", async () => {
  await assert.rejects(
    () => connectWithFallback(["http://127.0.0.1:1", "http://127.0.0.1:2"]),
    (error: unknown) =>
      error instanceof AllEndpointsUnavailableError && error.attempted.length === 2
  );
});
