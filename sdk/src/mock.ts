// sdk/src/mock.ts
//
// Published as the separate `@zksoroban/sdk/mock` entry point (zksoroban#66).
// Applications built on top of zksoroban need to unit-test their own
// integration code — a proof-generation step, a verify-on-submit handler —
// without a real Stellar network, real wasm/zkey circuit files, or a real
// proof. `createMockSdk` returns a drop-in replacement for the two
// functions that need those real things: `verifyOnChain` and
// `generateProof`.
//
// Each `createMockSdk()` call returns its own independent mock with its own
// `calls` array. There is no module-level or otherwise shared state across
// separate instances, so two tests that each call `createMockSdk()` never
// see each other's calls — deliberately out of scope for this module is a
// stateful mock whose state persists *across* instances.
import type { GenerateProofResult } from "./browser.js";
import { emitProofStage, OnProofProgress, SnarkjsProof, VerifyOptions, VerifyResult } from "./types.js";

/**
 * Configures what a mock's `verifyOnChain` resolves — or rejects — with.
 */
export interface MockSdkOptions {
  /**
   * What `verifyOnChain` resolves with, as `{ verified: verifyResult, ... }`
   * — or, if an `Error` (including a `SorobanZkError`), what it rejects
   * with instead, so error-handling paths can be tested too. Defaults to
   * `true`.
   */
  verifyResult?: boolean | Error;
  /**
   * Milliseconds to wait before resolving or rejecting, simulating network
   * or proving latency. Defaults to `0`.
   */
  delay?: number;
}

/**
 * One recorded call to a mock SDK function, in {@link MockSdk.calls}, in
 * call order — the call is recorded immediately, before `delay` is applied
 * and regardless of whether the call later resolves or rejects.
 */
export type MockSdkCall =
  | { method: "verifyOnChain"; args: [VerifyOptions] }
  | {
      method: "generateProof";
      args: [secret: bigint, commitment: bigint, wasm: Uint8Array, zkey: Uint8Array, onProgress?: OnProofProgress];
    };

/**
 * A mock implementation of the SDK's two network/proving-dependent
 * functions — {@link verifyOnChain} and `generateProof` (from
 * `@zksoroban/sdk/browser`) — for application code that wants to
 * unit-test its own integration against zksoroban without a real Stellar
 * network, wasm/zkey files, or real proofs. See `docs/testing.md` for a
 * full usage example.
 */
export interface MockSdk {
  verifyOnChain(opts: VerifyOptions): Promise<VerifyResult>;
  generateProof(
    secret: bigint,
    commitment: bigint,
    wasm: Uint8Array,
    zkey: Uint8Array,
    onProgress?: OnProofProgress
  ): Promise<GenerateProofResult>;
  /** Every call made to this mock so far, in call order. */
  calls: MockSdkCall[];
}

function wait(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

// A fixed, type-shaped Groth16 proof — not a real proof over any circuit,
// just a stand-in for code that needs *a* SnarkjsProof to pass around (e.g.
// into formatProof) without caring whether it actually verifies on-chain.
const MOCK_PROOF: SnarkjsProof = {
  pi_a: ["1", "2", "1"],
  pi_b: [
    ["1", "2"],
    ["3", "4"],
    ["1", "0"]
  ],
  pi_c: ["1", "2", "1"],
  protocol: "groth16"
};

/**
 * Create an independent mock SDK instance. See {@link MockSdk}.
 *
 * @example
 * ```ts
 * import { createMockSdk } from "@zksoroban/sdk/mock";
 *
 * const sdk = createMockSdk({ verifyResult: true, delay: 10 });
 * const result = await sdk.verifyOnChain({ network: TESTNET, keypair, bundle });
 * console.log(result.verified); // true
 * console.log(sdk.calls.length); // 1
 * ```
 */
export function createMockSdk(options: MockSdkOptions = {}): MockSdk {
  const { verifyResult = true, delay = 0 } = options;
  const calls: MockSdkCall[] = [];
  // Scoped to this instance, not module-level, so fake txHash/ledger values
  // are deterministic from a fresh createMockSdk() call regardless of what
  // other mocks or tests have done.
  let callCount = 0;

  return {
    calls,

    async verifyOnChain(opts: VerifyOptions): Promise<VerifyResult> {
      calls.push({ method: "verifyOnChain", args: [opts] });
      emitProofStage(opts.onProgress, "submit_start");
      await wait(delay);

      if (verifyResult instanceof Error) {
        throw verifyResult;
      }

      callCount += 1;
      emitProofStage(opts.onProgress, "submit_done");
      return {
        verified: verifyResult,
        txHash: `mock-tx-hash-${callCount}`,
        ledger: callCount,
        fee: "100"
      };
    },

    async generateProof(
      secret: bigint,
      commitment: bigint,
      wasm: Uint8Array,
      zkey: Uint8Array,
      onProgress?: OnProofProgress
    ): Promise<GenerateProofResult> {
      calls.push({ method: "generateProof", args: [secret, commitment, wasm, zkey, onProgress] });
      emitProofStage(onProgress, "witness_start");
      emitProofStage(onProgress, "witness_done");
      emitProofStage(onProgress, "proof_start");
      await wait(delay);
      emitProofStage(onProgress, "proof_done");

      return {
        proof: MOCK_PROOF,
        publicSignals: [commitment.toString()]
      };
    }
  };
}
