import fs from "node:fs";
import path from "node:path";

import { runCli } from "../src/cli";

interface GoldenCase {
  name: string;
  argv: string[];
}

const INPUTS = path.resolve(__dirname, "../test/golden/inputs");
const GOLDEN_DIR = path.resolve(__dirname, "../test/golden");

const CASES: GoldenCase[] = [
  { name: "prove", argv: ["prove", "--secret", "42"] },
  {
    name: "verify",
    argv: ["verify", "--proof", `${INPUTS}/proof.json`, "--public", `${INPUTS}/public.json`]
  },
  { name: "inspect", argv: ["inspect", "--bundle", `${INPUTS}/bundle.json`] },
  {
    name: "estimate-fee",
    argv: ["estimate-fee", "--proof", `${INPUTS}/proof.json`, "--public", `${INPUTS}/public.json`]
  },
  {
    name: "format-vk",
    argv: ["format-vk", "--vk", `${INPUTS}/verification_key.json`, "--id", "2"]
  }
];

function goldenPath(name: string): string {
  return path.join(GOLDEN_DIR, `${name}.txt`);
}

function diff(expected: string, actual: string): string {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const max = Math.max(expectedLines.length, actualLines.length);
  const lines: string[] = [];

  for (let i = 0; i < max; i += 1) {
    const e = expectedLines[i] ?? "";
    const a = actualLines[i] ?? "";
    if (e !== a) {
      lines.push(`  line ${i + 1}:`);
      lines.push(`    - expected: ${JSON.stringify(e)}`);
      lines.push(`    + actual:   ${JSON.stringify(a)}`);
    }
  }

  return lines.join("\n");
}

function main(): void {
  const update = process.argv.includes("--update");
  let failures = 0;

  for (const testCase of CASES) {
    const actual = `${runCli(testCase.argv)}\n`;
    const file = goldenPath(testCase.name);

    if (update) {
      fs.writeFileSync(file, actual);
      process.stdout.write(`updated ${testCase.name}.txt\n`);
      continue;
    }

    if (!fs.existsSync(file)) {
      process.stderr.write(`MISSING golden file for ${testCase.name}: run with --update\n`);
      failures += 1;
      continue;
    }

    const expected = fs.readFileSync(file, "utf8");
    if (expected === actual) {
      process.stdout.write(`ok ${testCase.name}\n`);
    } else {
      process.stderr.write(`MISMATCH ${testCase.name}\n${diff(expected, actual)}\n`);
      failures += 1;
    }
  }

  if (failures > 0) {
    process.stderr.write(`\n${failures} golden test(s) failed. Run "npm run test:golden -- --update" to refresh.\n`);
    process.exit(1);
  }

  if (!update) {
    process.stdout.write(`\nall ${CASES.length} golden tests passed\n`);
  }
}

main();
