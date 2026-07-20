import assert from "node:assert/strict";
import test from "node:test";

import { getContractVersion } from "../src/version";
import { SorobanZkError, SorobanZkErrorCode } from "../src/types";
import { TESTNET_CONTRACT_ID } from "./fixtures";

test("getContractVersion surfaces a network error for an unreachable RPC URL", async () => {
  await assert.rejects(
    () => getContractVersion(TESTNET_CONTRACT_ID, "http://127.0.0.1:1"),
    (error: unknown) =>
      error instanceof SorobanZkError &&
      error.code === SorobanZkErrorCode.NETWORK_ERROR
  );
});
