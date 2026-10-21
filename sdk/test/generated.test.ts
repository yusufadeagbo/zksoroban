/**
 * Regression tests for the generated contract types.
 *
 * `sdk/src/generated/contract.ts` is produced by `npm run codegen` from the
 * contract's own embedded spec, so these tests check two things:
 *
 * 1. The generated module exposes what the SDK promises — the contract's
 *    entry points, its error codes and its struct types.
 * 2. The committed generated file still matches the contract, i.e. nobody
 *    changed the contract (or the generator) without regenerating the file.
 *    This check needs the compiled contract WASM, so it is skipped when the
 *    contract has not been built.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  CONTRACT_GENERATED_FILE,
  findContractWasm,
  loadContractSpec
} from "../scripts/contract-source";
import { renderContractTypes } from "../scripts/render-contract-types";
import {
  VERIFIER_CONTRACT_NAME,
  VERIFIER_CONTRACT_VERSION,
  VERIFIER_FUNCTIONS,
  VerifierError,
  VerifierErrorCode
} from "../src/generated/contract";

test("the generated module exposes the verifier's entry points", () => {
  // The entry points the SDK itself calls must exist under their exact
  // contract names — a rename on the contract side has to break the build,
  // not silently produce a call to a function that no longer exists.
  assert.equal(VERIFIER_FUNCTIONS.verify_proof, "verify_proof");
  assert.equal(VERIFIER_FUNCTIONS.verify_batch, "verify_batch");
  assert.equal(VERIFIER_FUNCTIONS.get_config, "get_config");
  assert.equal(VERIFIER_FUNCTIONS.__constructor, "__constructor");
});

test("the generated module exposes the contract's error codes", () => {
  assert.equal(VerifierError.NotInitialized, 1);
  assert.equal(VerifierError.AlreadyUsed, 11);

  // Every error code is a distinct number, and the type of a code is the
  // union of them all.
  const codes: VerifierErrorCode[] = Object.values(VerifierError);
  assert.equal(new Set(codes).size, codes.length, "error codes are unique");
});

test("the generated module carries the contract's crate name and version", () => {
  assert.equal(VERIFIER_CONTRACT_NAME, "zksoroban-verifier");
  assert.match(VERIFIER_CONTRACT_VERSION, /^\d+\.\d+\.\d+$/);
});

test("the committed generated file matches the contract's spec", (t) => {
  let wasmPath: string;
  try {
    wasmPath = findContractWasm();
  } catch {
    t.skip(
      "the verifier contract has not been built — run `make build-contract` to check the generated file against it"
    );
    return;
  }

  const { spec } = loadContractSpec({ wasm: wasmPath });
  const expected = renderContractTypes(spec);
  const actual = fs.readFileSync(CONTRACT_GENERATED_FILE, "utf8");

  assert.equal(
    actual,
    expected,
    "sdk/src/generated/contract.ts is out of date — run `npm run codegen --workspace=sdk`"
  );
});

test("the generated file is committed at the path the SDK exports it from", () => {
  assert.ok(
    fs.existsSync(CONTRACT_GENERATED_FILE),
    `${path.relative(process.cwd(), CONTRACT_GENERATED_FILE)} is missing`
  );
});
