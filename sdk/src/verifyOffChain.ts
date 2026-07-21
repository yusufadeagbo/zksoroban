// sdk/src/verifyOffChain.ts
import { SnarkjsProof, SorobanZkError, SorobanZkErrorCode, VerificationKey } from "./types";

interface SnarkjsModule {
  groth16: {
    verify(
      verificationKey: VerificationKey,
      publicSignals: string[],
      proof: SnarkjsProof
    ): Promise<boolean>;
  };
}

const snarkjs: SnarkjsModule = require("snarkjs");

export async function verifyOffChain(
  proof: SnarkjsProof,
  publicSignals: string[],
  verificationKey: VerificationKey
): Promise<boolean> {
  if (!proof || typeof proof !== "object" || proof.protocol !== "groth16") {
    throw new SorobanZkError(
      "proof must be a Groth16 snarkjs proof object",
      SorobanZkErrorCode.INVALID_PROOF_FORMAT
    );
  }

  if (
    !Array.isArray(proof.pi_a) ||
    !Array.isArray(proof.pi_b) ||
    !Array.isArray(proof.pi_c)
  ) {
    throw new SorobanZkError(
      "proof is missing required Groth16 coordinates (pi_a, pi_b, pi_c)",
      SorobanZkErrorCode.INVALID_PROOF_FORMAT
    );
  }

  if (!Array.isArray(publicSignals)) {
    throw new SorobanZkError(
      "publicSignals must be an array of field element strings",
      SorobanZkErrorCode.INVALID_PUBLIC_INPUT
    );
  }

  if (
    !verificationKey ||
    typeof verificationKey !== "object" ||
    verificationKey.protocol !== "groth16"
  ) {
    throw new SorobanZkError(
      "verificationKey must be a Groth16 verification key object",
      SorobanZkErrorCode.INVALID_PROOF_FORMAT
    );
  }

  return Boolean(await snarkjs.groth16.verify(verificationKey, publicSignals, proof));
}
