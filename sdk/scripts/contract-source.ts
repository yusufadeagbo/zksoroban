/**
 * Locating a contract's spec: the compiled WASM, a raw spec file, and the
 * contract's crate metadata.
 *
 * Shared by the codegen CLI (`scripts/codegen.ts`) and the regression test
 * that checks the committed generated file against the contract.
 */
import fs from "node:fs";
import path from "node:path";

import {
  ContractSpec,
  decodeSpecEntries,
  parseContractSpec,
  readSpecSection
} from "./contract-spec.js";

export const REPO_ROOT = path.resolve(__dirname, "..", "..");
export const SDK_ROOT = path.resolve(__dirname, "..");

export const DEFAULT_WASM = path.join(
  REPO_ROOT,
  "contracts/verifier/target/wasm32v1-none/release/zksoroban_verifier.wasm"
);
export const DEFAULT_CARGO_TOML = path.join(REPO_ROOT, "contracts/verifier/Cargo.toml");

/** Where the generated contract types are written, and committed. */
export const CONTRACT_GENERATED_FILE = path.join(SDK_ROOT, "src/generated/contract.ts");

export const DEFAULT_OUT = CONTRACT_GENERATED_FILE;

export const BUILD_COMMAND =
  "cargo build --manifest-path contracts/verifier/Cargo.toml --target wasm32v1-none --release";

export interface ContractSourceOptions {
  wasm?: string;
  spec?: string;
  cargo?: string;
}

/**
 * Find the compiled contract WASM.
 *
 * The release build of the contract is the canonical input; the fallback
 * walk over `contracts/verifier/target` is there so a differently-configured
 * build (a different target triple, a debug build) still works.
 */
export function findContractWasm(explicit?: string): string {
  if (explicit) {
    if (!fs.existsSync(explicit)) {
      throw new Error(`contract WASM not found at ${explicit}`);
    }
    return explicit;
  }

  if (fs.existsSync(DEFAULT_WASM)) {
    return DEFAULT_WASM;
  }

  const targetDir = path.join(REPO_ROOT, "contracts/verifier/target");
  if (fs.existsSync(targetDir)) {
    const candidates = collectWasmFiles(targetDir).sort((a, b) => {
      const releaseA = a.includes(`${path.sep}release${path.sep}`) ? 0 : 1;
      const releaseB = b.includes(`${path.sep}release${path.sep}`) ? 0 : 1;
      return releaseA - releaseB || a.localeCompare(b);
    });

    if (candidates.length > 0) {
      return candidates[0];
    }
  }

  throw new Error(
    [
      `no compiled contract WASM found for contracts/verifier.`,
      `Build it first:`,
      `  ${BUILD_COMMAND}`,
      `then re-run:  npm run codegen --workspace=sdk`
    ].join("\n")
  );
}

function collectWasmFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // `deps/`, `build/` and `incremental/` hold intermediate artifacts, not
      // the contract itself.
      if (["deps", "build", "incremental", ".fingerprint"].includes(entry.name)) {
        continue;
      }
      found.push(...collectWasmFiles(full));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".wasm")) {
      found.push(full);
    }
  }

  return found;
}

/**
 * Read the contract's crate name and version out of its `Cargo.toml`.
 *
 * The WASM itself does not carry them (the `contractmetav0` section
 * describes the host environment, not the contract), and the generated
 * types are more useful when they say which contract version they came
 * from.
 */
export function readCargoMetadata(
  cargoTomlPath: string = DEFAULT_CARGO_TOML
): { name: string; version: string } {
  if (!fs.existsSync(cargoTomlPath)) {
    return { name: "verifier", version: "0.0.0" };
  }

  const contents = fs.readFileSync(cargoTomlPath, "utf8");
  const packageSection = contents.split(/^\[/m).find((section) => section.startsWith("package]"));

  if (!packageSection) {
    return { name: "verifier", version: "0.0.0" };
  }

  const name = /^name\s*=\s*"([^"]+)"/m.exec(packageSection)?.[1];
  const version = /^version\s*=\s*"([^"]+)"/m.exec(packageSection)?.[1];

  return {
    name: name ?? "verifier",
    version: version ?? "0.0.0"
  };
}

const BASE64_PATTERN = /^[A-Za-z0-9+/=\s]+$/;

/**
 * Read a contract spec from a file that is not a WASM: raw XDR bytes,
 * base64-encoded XDR, or the JSON that `soroban-spec show` prints.
 */
export function readSpecFile(specPath: string): unknown[] {
  if (!fs.existsSync(specPath)) {
    throw new Error(`contract spec not found at ${specPath}`);
  }

  const raw = fs.readFileSync(specPath);
  const asText = raw.toString("utf8").trim();

  if (asText.startsWith("[") || asText.startsWith("{")) {
    const parsed: unknown = JSON.parse(asText);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { entries?: unknown }).entries)) {
      return (parsed as { entries: unknown[] }).entries;
    }
    throw new Error(`${specPath} is not a contract spec: expected a JSON array of spec entries`);
  }

  if (BASE64_PATTERN.test(asText)) {
    return decodeSpecEntries(Buffer.from(asText.replace(/\s+/g, ""), "base64"));
  }

  return decodeSpecEntries(raw);
}

/**
 * Load a contract's spec, from a WASM or from a spec file, together with
 * the path it was read from.
 */
export function loadContractSpec(options: ContractSourceOptions = {}): {
  spec: ContractSpec;
  source: string;
} {
  const metadata = readCargoMetadata(options.cargo ?? DEFAULT_CARGO_TOML);

  if (options.spec) {
    return {
      spec: parseContractSpec(readSpecFile(options.spec), metadata),
      source: options.spec
    };
  }

  const wasmPath = findContractWasm(options.wasm);
  const payload = readSpecSection(fs.readFileSync(wasmPath));
  return {
    spec: parseContractSpec(decodeSpecEntries(payload), metadata),
    source: wasmPath
  };
}
