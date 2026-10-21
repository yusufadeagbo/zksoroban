#!/usr/bin/env tsx
/**
 * Generates `sdk/src/generated/contract.ts` — the SDK's TypeScript view of
 * the `contracts/verifier` contract — from the contract's own embedded
 * Soroban contract spec.
 *
 * The spec is the `contractspecv0` custom section of the compiled contract
 * WASM, written by `soroban-sdk`'s macros at compile time. Reading it is
 * what keeps the SDK's types honest: they are derived from the contract
 * itself rather than maintained by hand, so a contract change shows up as a
 * compile error instead of a silent mismatch.
 *
 * Usage:
 *   tsx scripts/codegen.ts [options]
 *
 * Options:
 *   --wasm <path>    Compiled contract WASM to read the spec from.
 *                    Default: contracts/verifier/target/wasm32v1-none/release/zksoroban_verifier.wasm
 *   --spec <path>    Read the spec from a file instead of a WASM: raw XDR
 *                    bytes, base64-encoded XDR, or JSON (the shape
 *                    `soroban-spec show` prints).
 *   --cargo <path>   Cargo.toml to read the contract's name and version from.
 *                    Default: contracts/verifier/Cargo.toml
 *   --out <path>     Where to write the generated file.
 *                    Default: sdk/src/generated/contract.ts
 *   --check          Don't write anything; exit non-zero if the generated
 *                    file on disk is out of date.
 *   -h, --help       Show this help.
 */
import fs from "node:fs";
import path from "node:path";

import {
  DEFAULT_OUT,
  loadContractSpec,
  REPO_ROOT
} from "./contract-source.js";
import { renderContractTypes } from "./render-contract-types.js";

interface Options {
  wasm?: string;
  spec?: string;
  cargo?: string;
  out: string;
  check: boolean;
}

function usage(): string {
  return [
    "Usage: tsx scripts/codegen.ts [options]",
    "",
    "Options:",
    "  --wasm <path>   Compiled contract WASM to read the spec from",
    "  --spec <path>   Raw contract spec (XDR bytes, base64, or JSON) instead of a WASM",
    "  --cargo <path>  Cargo.toml to read the contract name and version from",
    "  --out <path>    Output file (default: sdk/src/generated/contract.ts)",
    "  --check         Exit non-zero if the output file is out of date",
    "  -h, --help      Show this help"
  ].join("\n");
}

function parseArgs(argv: string[]): Options {
  const options: Options = { out: DEFAULT_OUT, check: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    switch (arg) {
      case "--wasm":
      case "--spec":
      case "--cargo":
      case "--out": {
        const value = argv[i + 1];
        if (value === undefined) {
          throw new Error(`${arg} requires a path`);
        }
        i += 1;
        if (arg === "--wasm") {
          options.wasm = path.resolve(value);
        } else if (arg === "--spec") {
          options.spec = path.resolve(value);
        } else if (arg === "--cargo") {
          options.cargo = path.resolve(value);
        } else {
          options.out = path.resolve(value);
        }
        break;
      }
      case "--check":
        options.check = true;
        break;
      case "-h":
      case "--help":
        process.stdout.write(`${usage()}\n`);
        process.exit(0);
        break;
      default:
        throw new Error(`unknown argument "${arg}"\n\n${usage()}`);
    }
  }

  if (options.wasm && options.spec) {
    throw new Error("--wasm and --spec are mutually exclusive");
  }

  return options;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const { spec, source } = loadContractSpec(options);
  const generated = renderContractTypes(spec);
  const relativeOut = path.relative(REPO_ROOT, options.out);
  const relativeSource = path.relative(REPO_ROOT, source);

  if (options.check) {
    if (!fs.existsSync(options.out)) {
      process.stderr.write(`${relativeOut} is missing. Run "npm run codegen --workspace=sdk".\n`);
      process.exit(1);
    }

    const existing = fs.readFileSync(options.out, "utf8");
    if (existing !== generated) {
      process.stderr.write(
        [
          `${relativeOut} is out of date with ${relativeSource}.`,
          `Run "npm run codegen --workspace=sdk" to regenerate it.`,
          ""
        ].join("\n")
      );
      process.exit(1);
    }

    process.stdout.write(`${relativeOut} is up to date with ${relativeSource}\n`);
    return;
  }

  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, generated);

  process.stdout.write(
    `wrote ${relativeOut} from ${relativeSource} ` +
      `(${spec.functions.length} function(s), ${spec.structs.length} struct(s), ` +
      `${spec.events.length} event(s))\n`
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
