import {
  SnarkjsProof,
  SorobanProofCalldata,
  SorobanZkErrorCode,
  ZkInputError
} from "./types";

const BN254_FIELD_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const MAX_32_BYTE_VALUE = 1n << 256n;
const DECIMAL_PATTERN = /^[0-9]+$/;
const DECIMAL_OR_HEX_PATTERN = /^(0x[0-9a-fA-F]+|[0-9]+)$/;
const MAX_VALUE_DISPLAY_LEN = 64;

function describeValue(value: unknown): string {
  const str = typeof value === "string" ? value : String(value);
  return str.length > MAX_VALUE_DISPLAY_LEN
    ? `${str.slice(0, MAX_VALUE_DISPLAY_LEN)}…`
    : str;
}

function assertArray(value: unknown, field: string, minLength: number): unknown[] {
  if (!Array.isArray(value)) {
    throw new ZkInputError(field, `is not an array (received ${typeof value})`);
  }

  if (value.length < minLength) {
    throw new ZkInputError(
      field,
      `must have at least ${minLength} elements (received ${value.length})`
    );
  }

  return value;
}

function assertProofFieldElement(value: unknown, field: string): void {
  if (typeof value !== "string") {
    throw new ZkInputError(
      field,
      `is not a string (received ${typeof value})`,
      SorobanZkErrorCode.INVALID_PROOF_FORMAT,
      describeValue(value)
    );
  }

  if (!DECIMAL_PATTERN.test(value)) {
    throw new ZkInputError(field, "is not a decimal string");
  }

  if (BigInt(value) >= BN254_FIELD_MODULUS) {
    throw new ZkInputError(
      field,
      "exceeds the BN254 field size",
      SorobanZkErrorCode.INVALID_PROOF_FORMAT,
      describeValue(value)
    );
  }
}

export function validatePublicSignals(publicSignals: string[]): void {
  if (!Array.isArray(publicSignals)) {
    throw new ZkInputError(
      "publicSignals",
      `is not an array (received ${typeof publicSignals})`,
      SorobanZkErrorCode.INVALID_PUBLIC_INPUT
    );
  }

  publicSignals.forEach((signal, index) => {
    const field = `publicSignals[${index}]`;

    if (typeof signal !== "string") {
      throw new ZkInputError(
        field,
        `is not a string (received ${typeof signal})`,
        SorobanZkErrorCode.INVALID_PUBLIC_INPUT,
        describeValue(signal)
      );
    }

    if (!DECIMAL_OR_HEX_PATTERN.test(signal)) {
      throw new ZkInputError(
        field,
        "is not a decimal or hex string",
        SorobanZkErrorCode.INVALID_PUBLIC_INPUT,
        describeValue(signal)
      );
    }

    if (BigInt(signal) >= MAX_32_BYTE_VALUE) {
      throw new ZkInputError(
        field,
        "does not fit in 32 bytes",
        SorobanZkErrorCode.INVALID_PUBLIC_INPUT,
        describeValue(signal)
      );
    }

    if (BigInt(signal) >= BN254_FIELD_MODULUS) {
      throw new ZkInputError(
        field,
        "exceeds the BN254 field size",
        SorobanZkErrorCode.INVALID_PUBLIC_INPUT,
        describeValue(signal)
      );
    }
  });
}

export function validateProofInput(proof: SnarkjsProof, publicSignals: string[]): void {
  if (proof === null || typeof proof !== "object") {
    throw new ZkInputError("proof", `is not an object (received ${typeof proof})`);
  }

  if (proof.protocol !== "groth16") {
    throw new ZkInputError("proof.protocol", 'must be "groth16"');
  }

  const piA = assertArray(proof.pi_a, "pi_a", 2);
  assertProofFieldElement(piA[0], "pi_a[0]");
  assertProofFieldElement(piA[1], "pi_a[1]");

  const piB = assertArray(proof.pi_b, "pi_b", 2);
  for (let i = 0; i < 2; i += 1) {
    const row = assertArray(piB[i], `pi_b[${i}]`, 2);
    assertProofFieldElement(row[0], `pi_b[${i}][0]`);
    assertProofFieldElement(row[1], `pi_b[${i}][1]`);
  }

  const piC = assertArray(proof.pi_c, "pi_c", 2);
  assertProofFieldElement(piC[0], "pi_c[0]");
  assertProofFieldElement(piC[1], "pi_c[1]");

  validatePublicSignals(publicSignals);
}

function assertBufferLength(value: Buffer, expected: number, field: string): void {
  if (!Buffer.isBuffer(value)) {
    throw new ZkInputError(field, `is not a Buffer (received ${typeof value})`);
  }

  if (value.length !== expected) {
    throw new ZkInputError(field, `must be ${expected} bytes (received ${value.length})`);
  }
}

export function validateCalldata(calldata: SorobanProofCalldata): void {
  if (calldata === null || typeof calldata !== "object") {
    throw new ZkInputError("calldata", `is not an object (received ${typeof calldata})`);
  }

  assertBufferLength(calldata.proofA, 64, "calldata.proofA");
  assertBufferLength(calldata.proofB, 128, "calldata.proofB");
  assertBufferLength(calldata.proofC, 64, "calldata.proofC");

  if (!Array.isArray(calldata.publicInputs)) {
    throw new ZkInputError(
      "calldata.publicInputs",
      `is not an array (received ${typeof calldata.publicInputs})`,
      SorobanZkErrorCode.INVALID_PUBLIC_INPUT
    );
  }

  calldata.publicInputs.forEach((input, index) => {
    assertBufferLength(input, 32, `calldata.publicInputs[${index}]`);
  });
}
