/**
 * Runs after the CJS, ESM, and types tsc builds finish. Marks each output
 * directory with its own package.json (so Node interprets dist/cjs/*.js as
 * CommonJS and dist/esm/*.js as ESM regardless of the package's own "type"
 * field) and writes the top-level dual-format entry points that
 * sdk/package.json's "exports" map points at — one pair for the main `.`
 * entry, one pair for `./mock`.
 */
const fs = require("node:fs");
const path = require("node:path");

const distDir = path.join(__dirname, "..", "dist");

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

writeJson(path.join(distDir, "cjs", "package.json"), { type: "commonjs" });
writeJson(path.join(distDir, "esm", "package.json"), { type: "module" });

fs.writeFileSync(
  path.join(distDir, "index.cjs"),
  'module.exports = require("./cjs/index.js");\n',
);
fs.writeFileSync(
  path.join(distDir, "index.mjs"),
  'export * from "./esm/index.js";\n',
);

fs.writeFileSync(
  path.join(distDir, "mock.cjs"),
  'module.exports = require("./cjs/mock.js");\n',
);
fs.writeFileSync(
  path.join(distDir, "mock.mjs"),
  'export * from "./esm/mock.js";\n',
);
