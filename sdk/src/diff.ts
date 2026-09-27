import { SorobanProofCalldata } from "./types.js";

/**
 * One field of a {@link SorobanProofCalldata} that differs between two
 * otherwise-comparable proofs, as reported by {@link diffProofs}.
 */
export interface FieldDiff {
  /** Field name, e.g. `"proofA"` or `"publicInputs[0]"`. */
  field: string;
  /** Hex encoding of the field from the first (`expected`) proof. */
  expectedHex: string;
  /** Hex encoding of the field from the second (`actual`) proof. */
  actualHex: string;
  /**
   * Byte offset of the first mismatch within the field. If one side is
   * shorter, the offset where it runs out counts as the first mismatch.
   */
  firstDifferentByte: number;
}

/**
 * Result of a {@link diffProofs} comparison.
 */
export type ProofDiff = { equal: true } | { equal: false; differences: FieldDiff[] };

function firstDifferentByte(expected: Buffer, actual: Buffer): number | null {
  const length = Math.max(expected.length, actual.length);
  for (let i = 0; i < length; i++) {
    if (expected[i] !== actual[i]) {
      return i;
    }
  }
  return null;
}

function compareField(
  differences: FieldDiff[],
  field: string,
  expected: Buffer | undefined,
  actual: Buffer | undefined
): void {
  const expectedBuf = expected ?? Buffer.alloc(0);
  const actualBuf = actual ?? Buffer.alloc(0);
  const offset = firstDifferentByte(expectedBuf, actualBuf);

  if (offset === null) {
    return;
  }

  differences.push({
    field,
    expectedHex: expectedBuf.toString("hex"),
    actualHex: actualBuf.toString("hex"),
    firstDifferentByte: offset
  });
}

/**
 * Compare two formatted proofs field by field and report exactly which
 * bytes differ — useful for tracking down encoding bugs without manually
 * diffing hex strings, e.g. a proof the contract accepted against one it
 * rejected, or the calldata the SDK produced against expected test vectors.
 *
 * @example
 * ```ts
 * const diff = diffProofs(expectedCalldata, actualCalldata);
 * if (!diff.equal) {
 *   for (const d of diff.differences) {
 *     console.log(`${d.field}: expected ${d.expectedHex}, got ${d.actualHex} (byte ${d.firstDifferentByte})`);
 *   }
 * }
 * ```
 */
export function diffProofs(a: SorobanProofCalldata, b: SorobanProofCalldata): ProofDiff {
  const differences: FieldDiff[] = [];

  compareField(differences, "proofA", a.proofA, b.proofA);
  compareField(differences, "proofB", a.proofB, b.proofB);
  compareField(differences, "proofC", a.proofC, b.proofC);

  const publicInputCount = Math.max(a.publicInputs.length, b.publicInputs.length);
  for (let i = 0; i < publicInputCount; i++) {
    compareField(differences, `publicInputs[${i}]`, a.publicInputs[i], b.publicInputs[i]);
  }

  return differences.length === 0 ? { equal: true } : { equal: false, differences };
}
