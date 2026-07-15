import {
  SnarkjsProof,
  SorobanProofCalldata,
  SorobanZkError,
  SorobanZkErrorCode
} from "./types";
import { validateProofInput } from "./validate";

const BN254_FIELD_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function truncate(s: string): string {
  return s.length > 64 ? s.slice(0, 64) + "…" : s;
}

function parseFieldElement(value: unknown, code: SorobanZkErrorCode, label: string): bigint {
  if (typeof value !== "string") {
    throw new SorobanZkError(
      `${label} must be a decimal or hex string, got ${typeof value}: ${truncate(String(value))}`,
      code
    );
  }

  if (!/^(0x[0-9a-fA-F]+|[0-9]+)$/.test(value)) {
    throw new SorobanZkError(
      `${label} must be a decimal or hex string, got: "${truncate(value)}"`,
      code
    );
  }

  const parsed = BigInt(value);
  if (parsed < 0n || parsed >= BN254_FIELD_MODULUS) {
    throw new SorobanZkError(
      `${label} is outside the BN254 field: ${truncate(value)}`,
      code
    );
  }

  return parsed;
}

function bigintToBytes32(value: bigint): Buffer {
  return Buffer.from(value.toString(16).padStart(64, "0"), "hex");
}

function encodeG1(point: [string, string, string], label: string): Buffer {
  return Buffer.concat([
    bigintToBytes32(
      parseFieldElement(point[0], SorobanZkErrorCode.INVALID_PROOF_FORMAT, `${label}.x`)
    ),
    bigintToBytes32(
      parseFieldElement(point[1], SorobanZkErrorCode.INVALID_PROOF_FORMAT, `${label}.y`)
    )
  ]);
}

function encodeG2(
  point: [[string, string], [string, string], [string, string]],
  label: string
): Buffer {
  const xC0 = parseFieldElement(
    point[0][0],
    SorobanZkErrorCode.INVALID_PROOF_FORMAT,
    `${label}.x.c0`
  );
  const xC1 = parseFieldElement(
    point[0][1],
    SorobanZkErrorCode.INVALID_PROOF_FORMAT,
    `${label}.x.c1`
  );
  const yC0 = parseFieldElement(
    point[1][0],
    SorobanZkErrorCode.INVALID_PROOF_FORMAT,
    `${label}.y.c0`
  );
  const yC1 = parseFieldElement(
    point[1][1],
    SorobanZkErrorCode.INVALID_PROOF_FORMAT,
    `${label}.y.c1`
  );

  return Buffer.concat([
    bigintToBytes32(xC1),
    bigintToBytes32(xC0),
    bigintToBytes32(yC1),
    bigintToBytes32(yC0)
  ]);
}

function encodePublicInputs(publicSignals: string[]): Buffer[] {
  return publicSignals.map((signal, index) =>
    bigintToBytes32(
      parseFieldElement(
        signal,
        SorobanZkErrorCode.INVALID_PUBLIC_INPUT,
        `publicSignals[${index}]`
      )
    )
  );
}

const MAX_U32 = 0xffffffff;

export function formatProof(
  proof: SnarkjsProof,
  publicSignals: string[],
  expiryLedger?: number
): SorobanProofCalldata {
  validateProofInput(proof, publicSignals);

  if (!proof || proof.protocol !== "groth16") {
    throw new SorobanZkError(
      "Proof must be a Groth16 snarkjs proof",
      SorobanZkErrorCode.INVALID_PROOF_FORMAT
    );
  }

  if (proof.pi_a.length < 2 || proof.pi_b.length < 2 || proof.pi_c.length < 2) {
    throw new SorobanZkError(
      "Proof is missing required Groth16 coordinates",
      SorobanZkErrorCode.INVALID_PROOF_FORMAT
    );
  }

  if (!Array.isArray(publicSignals)) {
    throw new SorobanZkError(
      "publicSignals must be an array of field elements",
      SorobanZkErrorCode.INVALID_PUBLIC_INPUT
    );
  }

  const publicInputs = encodePublicInputs(publicSignals);

  if (expiryLedger !== undefined) {
    if (!Number.isInteger(expiryLedger) || expiryLedger < 0 || expiryLedger > MAX_U32) {
      throw new SorobanZkError(
        "expiryLedger must be an unsigned 32-bit integer",
        SorobanZkErrorCode.INVALID_PUBLIC_INPUT
      );
    }

    publicInputs.push(bigintToBytes32(BigInt(expiryLedger)));
  }

  const calldata = {
    proofA: encodeG1(proof.pi_a, "pi_a"),
    proofB: encodeG2(proof.pi_b, "pi_b"),
    proofC: encodeG1(proof.pi_c, "pi_c"),
    publicInputs
  };

  if (calldata.proofA.length !== 64 || calldata.proofB.length !== 128 || calldata.proofC.length !== 64) {
    throw new SorobanZkError(
      "Proof encoding produced an invalid byte length",
      SorobanZkErrorCode.INVALID_PROOF_FORMAT
    );
  }

  return calldata;
}
