// sdk/src/browser.ts
//
// Browser-safe entry point (published as `@zksoroban/sdk/browser`). Only
// code that can run without Node's fs/path/process — generateProof and the
// plain data types/errors needed to work with its result — is exported here.
// verify.ts, poseidon.ts and cli.ts stay out: they read files or shell out
// via Node-only APIs and don't belong in a browser bundle.
import { SnarkjsProof, SorobanZkError, SorobanZkErrorCode, ZkInputError } from "./types.js";

interface SnarkjsModule {
  groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasm: Uint8Array,
      zkey: Uint8Array
    ): Promise<{ proof: SnarkjsProof; publicSignals: string[] }>;
  };
}

export interface GenerateProofResult {
  proof: SnarkjsProof;
  publicSignals: string[];
}

/**
 * Generate a Groth16 proof for the `poseidon_preimage` circuit entirely
 * in-memory, from `.wasm`/`.zkey` bytes supplied as `Uint8Array` — no
 * filesystem access, so this runs the same way in a browser as it does in
 * Node.
 *
 * snarkjs is loaded via a lazy dynamic `import()` (the same pattern
 * {@link verifyOffChain} uses) so bundlers can tree-shake it out of code
 * paths that never call `generateProof`, and so that when this module is
 * bundled for the web (see `sdk/vite.config.mts`), snarkjs's own `browser`
 * package export condition resolves automatically.
 *
 * @example
 * ```ts
 * const wasm = new Uint8Array(await (await fetch("/circuit.wasm")).arrayBuffer());
 * const zkey = new Uint8Array(await (await fetch("/circuit.zkey")).arrayBuffer());
 * const { proof, publicSignals } = await generateProof(secret, commitment, wasm, zkey);
 * ```
 */
export async function generateProof(
  secret: bigint,
  commitment: bigint,
  wasm: Uint8Array,
  zkey: Uint8Array
): Promise<GenerateProofResult> {
  if (typeof secret !== "bigint") {
    throw new ZkInputError("secret", `must be a bigint (received ${typeof secret})`);
  }

  if (typeof commitment !== "bigint") {
    throw new ZkInputError("commitment", `must be a bigint (received ${typeof commitment})`);
  }

  if (!(wasm instanceof Uint8Array)) {
    throw new ZkInputError("wasm", `must be a Uint8Array (received ${typeof wasm})`);
  }

  if (!(zkey instanceof Uint8Array)) {
    throw new ZkInputError("zkey", `must be a Uint8Array (received ${typeof zkey})`);
  }

  const snarkjs: SnarkjsModule = await import("snarkjs");

  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      { secret: secret.toString(), commitment: commitment.toString() },
      wasm,
      zkey
    );

    return { proof, publicSignals };
  } catch (error) {
    throw new SorobanZkError(
      error instanceof Error ? error.message : String(error),
      SorobanZkErrorCode.PROOF_GENERATION_FAILED
    );
  }
}

export { SorobanZkError, SorobanZkErrorCode, ZkInputError };
export type { SnarkjsProof };
