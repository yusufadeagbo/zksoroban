export * from "./diff.js";
export * from "./generated/contract.js";
export * from "./logger.js";
export * from "./poseidon.js";
export * from "./proof.js";
export * from "./retry.js";
export * from "./serialize.js";
export * from "./types.js";
export * from "./validate.js";
export * from "./verify.js";
export * from "./verifyOffChain.js";
export * from "./version.js";

// The generated contract types declare a `VerifyBatchResult` — the contract's
// own `verify_batch` return type (`boolean[]`) — which collides with the
// SDK's `VerifyBatchResult` (the `{ verified, txHash, ledger, fee }` result of
// `verifyBatchOnChain`). The SDK's own type is the one callers of this
// package mean, so it wins the name; the generated one stays available from
// the generated module itself.
export { VerifyBatchResult } from "./types.js";

