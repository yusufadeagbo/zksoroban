import assert from "node:assert/strict";
import test from "node:test";
import fc from "fast-check";

import { formatProof } from "../src/proof";
import { SnarkjsProof, ZkInputError } from "../src/types";

const BN254_FIELD_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const fieldElement = fc.bigInt({ min: 0n, max: BN254_FIELD_MODULUS - 1n });

const outOfRangeFieldElement = fc.bigInt({
  min: BN254_FIELD_MODULUS,
  max: BN254_FIELD_MODULUS * 4n
});

function g1(x: bigint, y: bigint): [string, string, string] {
  return [x.toString(), y.toString(), "1"];
}

function g2(
  xc0: bigint,
  xc1: bigint,
  yc0: bigint,
  yc1: bigint
): [[string, string], [string, string], [string, string]] {
  return [[xc0.toString(), xc1.toString()], [yc0.toString(), yc1.toString()], ["1", "0"]];
}

const validProof = fc
  .tuple(fieldElement, fieldElement, fieldElement, fieldElement, fieldElement, fieldElement, fieldElement, fieldElement)
  .map(
    ([ax, ay, bxc0, bxc1, byc0, byc1, cx, cy]): SnarkjsProof => ({
      pi_a: g1(ax, ay),
      pi_b: g2(bxc0, bxc1, byc0, byc1),
      pi_c: g1(cx, cy),
      protocol: "groth16"
    })
  );

const validPublicSignals = fc.array(fieldElement, { minLength: 0, maxLength: 5 }).map((values) =>
  values.map((v) => v.toString())
);

test("formatProof: proofA is always 64 bytes", () => {
  fc.assert(
    fc.property(validProof, validPublicSignals, (proof, publicSignals) => {
      const result = formatProof(proof, publicSignals);
      return result.proofA.length === 64;
    })
  );
});

test("formatProof: proofB is always 128 bytes", () => {
  fc.assert(
    fc.property(validProof, validPublicSignals, (proof, publicSignals) => {
      const result = formatProof(proof, publicSignals);
      return result.proofB.length === 128;
    })
  );
});

test("formatProof: proofC is always 64 bytes", () => {
  fc.assert(
    fc.property(validProof, validPublicSignals, (proof, publicSignals) => {
      const result = formatProof(proof, publicSignals);
      return result.proofC.length === 64;
    })
  );
});

test("formatProof: every public input is encoded as exactly 32 bytes", () => {
  fc.assert(
    fc.property(validProof, validPublicSignals, (proof, publicSignals) => {
      const result = formatProof(proof, publicSignals);
      return (
        result.publicInputs.length === publicSignals.length &&
        result.publicInputs.every((buf) => buf.length === 32)
      );
    })
  );
});

test("formatProof: public input round-trips through 32-byte big-endian encoding", () => {
  fc.assert(
    fc.property(validProof, fc.array(fieldElement, { minLength: 1, maxLength: 5 }), (proof, values) => {
      const publicSignals = values.map((v) => v.toString());
      const result = formatProof(proof, publicSignals);
      return result.publicInputs.every(
        (buf, i) => BigInt("0x" + buf.toString("hex")) === values[i]
      );
    })
  );
});

test("formatProof: a proof coordinate at or beyond the BN254 field size always throws ZkInputError", () => {
  fc.assert(
    fc.property(validProof, outOfRangeFieldElement, (proof, badValue) => {
      const tampered: SnarkjsProof = {
        ...proof,
        pi_a: [badValue.toString(), proof.pi_a[1], proof.pi_a[2]]
      };
      assert.throws(() => formatProof(tampered, []), ZkInputError);
      return true;
    })
  );
});

test("formatProof: a public input at or beyond the BN254 field size always throws ZkInputError", () => {
  fc.assert(
    fc.property(validProof, outOfRangeFieldElement, (proof, badValue) => {
      assert.throws(() => formatProof(proof, [badValue.toString()]), ZkInputError);
      return true;
    })
  );
});
