/**
 * Renders a normalized {@link ContractSpec} into the TypeScript source of
 * `sdk/src/generated/contract.ts` — the SDK's machine-generated view of a
 * contract's entry points, argument types, return types, struct/enum
 * definitions and error codes.
 *
 * The renderer is pure: same spec in, same source out. That is what makes
 * `npm run codegen:check` able to tell a drifted generated file from an
 * up-to-date one.
 */
import {
  ContractSpec,
  PrimitiveTypeName,
  SpecEnum,
  SpecEnumCase,
  SpecField,
  SpecFunction,
  SpecType
} from "./contract-spec.js";

/** The TypeScript type each Soroban primitive maps to. */
const PRIMITIVE_TS_TYPES: Record<PrimitiveTypeName, string> = {
  void: "void",
  bool: "boolean",
  u32: "number",
  i32: "number",
  // 64-bit and wider integers are `bigint` in JavaScript: they do not fit in
  // a `number` without losing precision.
  u64: "bigint",
  i64: "bigint",
  u128: "bigint",
  i128: "bigint",
  u256: "bigint",
  i256: "bigint",
  timepoint: "bigint",
  duration: "bigint",
  address: "string",
  muxed_address: "string",
  string: "string",
  symbol: "string",
  // `Buffer` is a `Uint8Array`, so byte-typed values can be handed to any
  // API that wants a plain `Uint8Array` without a conversion.
  bytes: "Buffer",
  error: "", // filled in per contract — the contract's own error code type
  val: "unknown"
};

/** `verify_proof` -> `VerifyProof`, `__constructor` -> `Constructor`. */
export function pascalCase(name: string): string {
  const words = name
    .replace(/^_+/, "")
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    throw new Error(`cannot derive a TypeScript name from "${name}"`);
  }

  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
}

/**
 * The uppercase prefix used for a contract's generated constants, e.g.
 * `zksoroban-verifier` -> `VERIFIER`.
 */
export function contractPrefix(contractName: string): string {
  const suffix = contractName.split("-").pop() ?? contractName;
  const normalized = suffix.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase();
  if (normalized.length === 0) {
    throw new Error(`cannot derive a constant prefix from "${contractName}"`);
  }
  return normalized;
}

/**
 * The PascalCase prefix used for a contract's generated *types*, e.g.
 * `zksoroban-verifier` -> `Verifier`.
 */
export function contractTypePrefix(contractName: string): string {
  const suffix = contractName.split("-").pop() ?? contractName;
  const words = suffix.split(/[^A-Za-z0-9]+/).filter((word) => word.length > 0);
  if (words.length === 0) {
    throw new Error(`cannot derive a type prefix from "${contractName}"`);
  }
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
}

/**
 * Decode the debug-escaped strings the contract spec stores doc comments
 * in.
 *
 * `soroban-sdk` writes a doc comment the way Rust's `{:?}` formats a string:
 * a multi-line doc comment comes back as `line one\nline two` with a
 * literal backslash-n, and a non-ASCII character comes back as its UTF-8
 * bytes (`\xe2\x80\x94` for an em dash). Unescaping here is what makes the
 * generated documentation readable.
 */
export function unescapeDoc(text: string): string {
  const bytes: number[] = [];
  let out = "";

  const flushBytes = (): void => {
    if (bytes.length > 0) {
      out += new TextDecoder("utf-8").decode(new Uint8Array(bytes));
      bytes.length = 0;
    }
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char !== "\\") {
      flushBytes();
      out += char;
      continue;
    }

    const next = text[i + 1];
    i += 1;

    switch (next) {
      case "n":
        flushBytes();
        out += "\n";
        break;
      case "t":
        flushBytes();
        out += "\t";
        break;
      case "r":
        flushBytes();
        out += "\r";
        break;
      case "0":
        flushBytes();
        out += "\0";
        break;
      case "\\":
        flushBytes();
        out += "\\";
        break;
      case '"':
        flushBytes();
        out += '"';
        break;
      case "'":
        flushBytes();
        out += "'";
        break;
      case "x": {
        const hex = text.slice(i + 1, i + 3);
        if (!/^[0-9a-fA-F]{2}$/.test(hex)) {
          throw new Error(`invalid \\x escape in doc string: "\\x${hex}"`);
        }
        bytes.push(parseInt(hex, 16));
        i += 2;
        break;
      }
      case "u": {
        // Rust escapes a non-BMP code point as `\u{1f600}`.
        const braced = /^\\u\{([0-9a-fA-F]+)\}/.exec(text.slice(i - 1));
        if (braced) {
          flushBytes();
          out += String.fromCodePoint(parseInt(braced[1], 16));
          i += braced[0].length - 2;
          break;
        }
        const plain = /^\\u([0-9a-fA-F]{4})/.exec(text.slice(i - 1));
        if (plain) {
          flushBytes();
          out += String.fromCharCode(parseInt(plain[1], 16));
          i += plain[0].length - 2;
          break;
        }
        throw new Error("invalid \\u escape in doc string");
      }
      default:
        throw new Error(`invalid escape "\\${next ?? ""}" in doc string`);
    }
  }

  flushBytes();
  return out;
}

function escapeDoc(text: string): string {
  return text.replace(/\*\//g, "* /").trim();
}

/**
 * Render a doc comment. An empty doc produces no comment at all, so the
 * generated file stays free of empty doc blocks.
 */
function docComment(text: string | undefined, indent = ""): string {
  if (!text) {
    return "";
  }

  const escaped = escapeDoc(unescapeDoc(text));
  if (!escaped) {
    return "";
  }

  const lines = escaped.split("\n").map((line) => line.trimEnd());
  if (lines.length === 1) {
    return `${indent}/** ${lines[0]} */`;
  }

  return `${indent}/**\n${lines.map((line) => `${indent} *${line ? ` ${line}` : ""}`).join("\n")}\n${indent} */`;
}

/** Render an object key, quoted only when it is not a valid identifier. */
function objectKey(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

/** The TypeScript type for a spec type. */
export function tsTypeFor(type: SpecType, errorTypeName: string): string {
  switch (type.kind) {
    case "primitive":
      return type.name === "error" ? errorTypeName : PRIMITIVE_TS_TYPES[type.name];
    case "bytesN":
      return "Buffer";
    case "vec": {
      const element = tsTypeFor(type.element, errorTypeName);
      return `${element.includes("|") ? `(${element})` : element}[]`;
    }
    case "option":
      return `${tsTypeFor(type.value, errorTypeName)} | undefined`;
    case "tuple":
      return `[${type.values.map((value) => tsTypeFor(value, errorTypeName)).join(", ")}]`;
    case "map":
      return `Map<${tsTypeFor(type.key, errorTypeName)}, ${tsTypeFor(type.value, errorTypeName)}>`;
    case "result":
      return tsTypeFor(type.ok, errorTypeName);
    case "udt":
      return structTypeName(type.name);
  }
}

function renderEnumCases(cases: SpecEnumCase[], indent: string): string {
  return cases
    .map((variant) => {
      const doc = docComment(variant.doc, `${indent}  `);
      return `${doc ? `${doc}\n` : ""}${indent}  ${objectKey(variant.name)}: ${variant.value}`;
    })
    .join(",\n");
}

/** The generated constant name for a contract's error enum. */
export function errorConstName(typePrefix: string, errorEnumName: string): string {
  return errorEnumName === "Error" ? `${typePrefix}Error` : `${pascalCase(errorEnumName)}Error`;
}

/** The generated type name for a contract's error codes. */
export function errorTypeName(typePrefix: string, errorEnumName: string): string {
  return errorEnumName === "Error" ? `${typePrefix}ErrorCode` : `${pascalCase(errorEnumName)}ErrorCode`;
}

/** The generated constant name for a contract's enums. */
export function enumConstName(enumName: string): string {
  return pascalCase(enumName);
}

/** The generated interface name for a contract's structs. */
export function structTypeName(structName: string): string {
  return pascalCase(structName);
}

/** The generated interface name for a contract's events. */
export function eventTypeName(eventName: string): string {
  return `${pascalCase(eventName)}Event`;
}

/** The generated argument/result type names for a function. */
export function functionTypeNames(functionName: string): { args: string; result: string } {
  const base = pascalCase(functionName);
  return { args: `${base}Args`, result: `${base}Result` };
}

function renderFields(fields: SpecField[], errorType: string): string {
  let out = "";
  for (const field of fields) {
    const doc = docComment(field.doc, "  ");
    out += doc ? `${doc}\n` : "";
    out += `  ${objectKey(field.name)}: ${tsTypeFor(field.type, errorType)};\n`;
  }
  return out;
}

/**
 * Render a struct as an interface.
 *
 * A struct with no fields renders as an empty interface on one line, which
 * is what a zero-argument entry point's argument type looks like.
 */
function renderStruct(struct: ContractSpec["structs"][number], errorType: string): string {
  const name = structTypeName(struct.name);
  const doc = docComment(struct.doc);

  if (struct.fields.length === 0) {
    return `${doc ? `${doc}\n` : ""}export interface ${name} {}\n`;
  }

  let out = doc ? `${doc}\n` : "";
  out += `export interface ${name} {\n`;
  out += renderFields(struct.fields, errorType);
  out += "}\n";
  return out;
}

function renderEnum(udtEnum: SpecEnum): string {
  const name = enumConstName(udtEnum.name);
  const doc = docComment(udtEnum.doc);
  let out = doc ? `${doc}\n` : "";
  out += `export const ${name} = {\n${renderEnumCases(udtEnum.cases, "")}\n} as const;\n\n`;
  out += `/** The numeric value of a \`${udtEnum.name}\` variant. */\n`;
  out += `export type ${name}Value = (typeof ${name})[keyof typeof ${name}];\n`;
  return out;
}

function renderEvent(event: ContractSpec["events"][number], errorType: string): string {
  const name = eventTypeName(event.name);
  const doc = docComment(event.doc);

  if (event.params.length === 0) {
    return `${doc ? `${doc}\n` : ""}export interface ${name} {}\n`;
  }

  let out = doc ? `${doc}\n` : "";
  out += `export interface ${name} {\n`;
  out += renderFields(event.params, errorType);
  out += "}\n";
  return out;
}

function renderFunction(fn: SpecFunction, errorType: string): string {
  const names = functionTypeNames(fn.name);
  const doc = docComment(fn.doc);

  let out = doc ? `${doc}\n` : "";
  if (fn.inputs.length === 0) {
    out += `export interface ${names.args} {}\n\n`;
  } else {
    out += `export interface ${names.args} {\n`;
    out += renderFields(fn.inputs, errorType);
    out += "}\n\n";
  }

  const outputType = fn.output ? tsTypeFor(fn.output, errorType) : "void";
  out += docComment(
    fn.output && fn.output.kind === "result"
      ? `The success value of \`${fn.name}\`. The contract returns a \`Result\`, so a rejection surfaces as a failed transaction carrying one of the ${errorType} values.`
      : `The return value of \`${fn.name}\`.`
  );
  out += `\nexport type ${names.result} = ${outputType};\n`;

  return out;
}

/**
 * Render the whole generated TypeScript source for a contract spec.
 */
export function renderContractTypes(spec: ContractSpec): string {
  const prefix = contractPrefix(spec.name);
  const typePrefix = contractTypePrefix(spec.name);
  const errorConst = errorConstName(typePrefix, spec.errors.name);
  const errorType = errorTypeName(typePrefix, spec.errors.name);

  const sections: string[] = [];

  sections.push(
    [
      "/**",
      " * AUTO-GENERATED FILE - DO NOT EDIT.",
      " *",
      ` * Generated by \`sdk/scripts/codegen.ts\` from the compiled \`${spec.name}\``,
      " * contract's embedded Soroban contract spec (the `contractspecv0` custom",
      " * section of the release WASM), so it always matches the contract it",
      " * describes.",
      " *",
      " * Regenerate it after any contract change:",
      " *",
      " * ```sh",
      " * cargo build --manifest-path contracts/verifier/Cargo.toml --target wasm32v1-none --release",
      " * npm run codegen --workspace=sdk",
      " * ```",
      " *",
      " * CI runs `npm run codegen:check --workspace=sdk`, which fails if this",
      " * file is out of date.",
      " *",
      " * Conventions:",
      " *",
      " * - Names match the contract exactly (snake_case), because they are also",
      " *   the XDR map keys and the function dispatch symbols on the wire.",
      " * - `Option<T>` maps to `T | undefined`; the SDK normalizes Soroban's",
      " *   \"absent\" (`null`) to `undefined` when it decodes a value.",
      " * - `Bytes`/`BytesN` map to `Buffer`, matching how the SDK decodes",
      " *   `scvBytes`.",
      " * - A function returning `Result<T, Error>` is typed by its success type",
      ` *   \`T\`; the rejection comes back as a ${errorType} value.`,
      " */",
      ""
    ].join("\n")
  );

  sections.push(
    [
      "/** The contract's crate name, as compiled into the WASM this file was generated from. */",
      `export const ${prefix}_CONTRACT_NAME = ${JSON.stringify(spec.name)};`,
      "",
      "/** The contract's crate version. */",
      `export const ${prefix}_CONTRACT_VERSION = ${JSON.stringify(spec.version)};`,
      ""
    ].join("\n")
  );

  const exampleError = spec.errors.cases[0];

  sections.push(
    [
      docComment(
        `The contract's \`${spec.errors.name}\` enum: every case name and its numeric contract error code. A failed contract call carries one of these codes back to the caller.`
      ),
      `export const ${errorConst} = {`,
      renderEnumCases(spec.errors.cases, ""),
      "} as const;",
      "",
      `/** The name of a contract error case, e.g. \`"${exampleError?.name ?? "Error"}\"\`. */`,
      `export type ${errorConst}Name = keyof typeof ${errorConst};`,
      "",
      `/** The numeric code of a contract error case, e.g. \`${exampleError?.value ?? 0}\` for \`${exampleError?.name ?? "Error"}\`. */`,
      `export type ${errorType} = (typeof ${errorConst})[${errorConst}Name];`,
      ""
    ].join("\n")
  );

  sections.push(
    [
      docComment(
        "Every entry point the contract exports, by name. Use these instead of string literals so a renamed or removed function breaks the build instead of failing silently on-chain."
      ),
      `export const ${prefix}_FUNCTIONS = {`,
      spec.functions.map((fn) => `  ${objectKey(fn.name)}: ${JSON.stringify(fn.name)}`).join(",\n"),
      "} as const;",
      "",
      "/** The name of one of the contract's exported functions. */",
      `export type ${typePrefix}FunctionName = keyof typeof ${prefix}_FUNCTIONS;`,
      ""
    ].join("\n")
  );

  if (spec.structs.length > 0) {
    sections.push(
      [
        "// ---------------------------------------------------------------------------",
        "// Contract types (structs)",
        "// ---------------------------------------------------------------------------",
        "",
        spec.structs.map((struct) => renderStruct(struct, errorType)).join("\n")
      ].join("\n")
    );
  }

  if (spec.enums.length > 0) {
    sections.push(
      [
        "// ---------------------------------------------------------------------------",
        "// Contract types (enums)",
        "// ---------------------------------------------------------------------------",
        "",
        spec.enums.map((udtEnum) => renderEnum(udtEnum)).join("\n")
      ].join("\n")
    );
  }

  if (spec.events.length > 0) {
    sections.push(
      [
        "// ---------------------------------------------------------------------------",
        "// Contract events",
        "// ---------------------------------------------------------------------------",
        "",
        spec.events.map((event) => renderEvent(event, errorType)).join("\n")
      ].join("\n")
    );
  }

  sections.push(
    [
      "// ---------------------------------------------------------------------------",
      "// Entry points",
      "// ---------------------------------------------------------------------------",
      "",
      spec.functions.map((fn) => renderFunction(fn, errorType)).join("\n")
    ].join("\n")
  );

  sections.push(
    [
      "// ---------------------------------------------------------------------------",
      "// The contract",
      "// ---------------------------------------------------------------------------",
      "",
      docComment(
        "Every entry point the contract exports, with the generated argument and result types. This is the SDK's view of the contract: it is generated from the contract's own spec, so it cannot drift from it."
      ),
      `export interface ${typePrefix}Contract {`,
      spec.functions
        .map((fn) => {
          const names = functionTypeNames(fn.name);
          const doc = docComment(fn.doc, "  ");
          return `${doc ? `${doc}\n` : ""}  ${objectKey(fn.name)}(args: ${names.args}): ${names.result};`;
        })
        .join("\n"),
      "}",
      ""
    ].join("\n")
  );

  return sections.join("\n");
}
