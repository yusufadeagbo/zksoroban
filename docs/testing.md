# Testing Applications Built on zksoroban

`sdk/test/` covers the SDK's own correctness. This document is for the
other side: unit-testing *your application's* integration code — a
"generate a proof, then submit it" flow, a UI that reacts to
`onProgress`, an error-handling path for a rejected verification —
without a real Stellar network, real `.wasm`/`.zkey` circuit files, or a
real proof.

## `@zksoroban/sdk/mock`

A separate entry point, alongside the main `@zksoroban/sdk` and
`@zksoroban/sdk/browser` exports (zksoroban#66). `createMockSdk()` returns
an object with the same shape as the two functions your integration code
actually depends on at runtime — `verifyOnChain` and `generateProof` — so
it can be swapped in wherever your own code accepts or imports the real
SDK.

```ts
import { createMockSdk } from "@zksoroban/sdk/mock";
import { TESTNET } from "@zksoroban/sdk";

const sdk = createMockSdk({ verifyResult: true, delay: 10 });

const result = await sdk.verifyOnChain({
  network: TESTNET,
  keypair,
  bundle
});

console.log(result.verified); // true
console.log(result.txHash);   // "mock-tx-hash-1"
```

### Configuring the result

`createMockSdk(options?)` takes:

- `verifyResult?: boolean | Error` — what `verifyOnChain` resolves with
  (`{ verified: verifyResult, txHash, ledger, fee }`), or, if an `Error`,
  what it rejects with instead. Defaults to `true`.
- `delay?: number` — milliseconds to wait before resolving/rejecting,
  for testing loading states or timeouts. Defaults to `0`.

```ts
// Test your "verification failed" UI path
const rejectingSdk = createMockSdk({ verifyResult: false });
const { verified } = await rejectingSdk.verifyOnChain({ network: TESTNET, keypair, bundle });
assert(verified === false);

// Test your error-handling path
const throwingSdk = createMockSdk({ verifyResult: new Error("network down") });
await assert.rejects(throwingSdk.verifyOnChain({ network: TESTNET, keypair, bundle }));

// Test a loading spinner that should appear during verification
const slowSdk = createMockSdk({ delay: 2000 });
```

### `generateProof`

Returns a fixed, deterministic fake proof — not a real proof over any
circuit, just a value with the right shape for code that passes a proof
around (e.g. into `formatProof`) without needing it to actually verify.
`publicSignals` is derived from the `commitment` argument you pass in, so
assertions can check your code wired the right value through:

```ts
const { proof, publicSignals } = await sdk.generateProof(secret, commitment, wasm, zkey);
assert.deepEqual(publicSignals, [commitment.toString()]);
```

### Asserting on calls

Every mock instance tracks its own calls, in order, in `sdk.calls` —
independent of any other `createMockSdk()` instance, so tests never leak
state into each other:

```ts
const sdk = createMockSdk();
await sdk.verifyOnChain({ network: TESTNET, keypair, bundle });

assert.equal(sdk.calls.length, 1);
assert.equal(sdk.calls[0].method, "verifyOnChain");
```

### Progress callbacks

Both mock functions call `onProgress` with the same stages the real SDK
reports (zksoroban#29) — `submit_start`/`submit_done` for `verifyOnChain`,
`witness_start`/`witness_done`/`proof_start`/`proof_done` for
`generateProof` — so UI code wired to `onProgress` can be exercised the
same way against the mock as against the real SDK. `submit_done` is only
emitted on a successful `verifyOnChain` call, matching the real function's
behavior.

### What's out of scope

- **Stateful across instances** — `sdk.calls` and the fake `txHash`/
  `ledger` counter reset with every `createMockSdk()` call. There's no
  shared state for a mock instance from one test to leak into another.
- **A real (but fake-circuit) proof** — `generateProof`'s mock never runs
  any actual witness computation or Groth16 proving; it returns a fixed
  value immediately (after `delay`).
- **The rest of the SDK's surface** — `verifyBatchOnChain`,
  `verifyViaRegistry`, `estimateVerifyFee`, `getContractConfig`, and
  friends aren't mocked here. Open an issue if your integration tests need
  one of those mocked too.
