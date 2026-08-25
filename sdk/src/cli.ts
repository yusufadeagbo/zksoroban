import fs from "node:fs";

import { formatProof, formatVerifyingKey } from "./proof.js";
import { poseidon } from "./poseidon.js";
import { SnarkjsProof, SorobanZkError, SorobanZkErrorCode, VerificationKey } from "./types.js";

// The live Testnet deployment documented in docs/architecture.md and
// docs/multi-circuit.md — used as format-vk's default so the generated
// command is ready to run as-is for the common case.
const REGISTRY_CONTRACT_ID = "CDTPNARKKZCZ36PL4BNKBXZTT2BLVR373S2K5NCFAOKCPPY62ESRHSXH";

interface InspectableBundle {
  proof: SnarkjsProof;
  publicSignals: string[];
  circuit: string;
  generatedAt: string;
  networkPassphrase: string;
}

const USAGE = [
  "zksoroban <command> [options]",
  "",
  "Commands:",
  "  prove         --secret <decimal>            compute the Poseidon commitment and circuit input",
  "  verify        --proof <file> --public <file>  encode to Soroban calldata and report the byte layout",
  "  inspect       --bundle <file>               print ProofBundle metadata and calldata sizes",
  "  estimate-fee  --proof <file> --public <file>  print a deterministic fee estimate",
  "  format-vk     --vk <file> --id <u32> [--registry-id <id>]  encode a verification_key.json for register_circuit"
].join("\n");

function getFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) {
    return undefined;
  }

  return args[index + 1];
}

function requireFlag(args: string[], name: string): string {
  const value = getFlag(args, name);
  if (value === undefined) {
    throw new SorobanZkError(`Missing required flag: ${name}`, SorobanZkErrorCode.INVALID_PROOF_FORMAT);
  }

  return value;
}

function readJson<T>(path: string): T {
  return JSON.parse(fs.readFileSync(path, "utf8")) as T;
}

function formatList(values: string[]): string[] {
  return values.map((value, index) => `  [${index}] ${value}`);
}

function commandProve(args: string[]): string[] {
  const secret = BigInt(requireFlag(args, "--secret"));
  const commitment = poseidon([secret]);

  return [
    "command: prove",
    "circuit: poseidon_preimage",
    `secret: ${secret.toString()}`,
    `commitment: ${commitment.toString()}`,
    "circuit input:",
    `  secret: ${secret.toString()}`,
    `  commitment: ${commitment.toString()}`
  ];
}

function commandVerify(args: string[]): string[] {
  const proof = readJson<SnarkjsProof>(requireFlag(args, "--proof"));
  const publicSignals = readJson<string[]>(requireFlag(args, "--public"));
  const calldata = formatProof(proof, publicSignals);

  return [
    "command: verify",
    "calldata encoding: ok",
    `proofA bytes: ${calldata.proofA.length}`,
    `proofB bytes: ${calldata.proofB.length}`,
    `proofC bytes: ${calldata.proofC.length}`,
    `public inputs: ${calldata.publicInputs.length}`
  ];
}

function commandInspect(args: string[]): string[] {
  const bundle = readJson<InspectableBundle>(requireFlag(args, "--bundle"));
  const calldata = formatProof(bundle.proof, bundle.publicSignals);

  return [
    "command: inspect",
    `circuit: ${bundle.circuit}`,
    `generatedAt: ${bundle.generatedAt}`,
    `networkPassphrase: ${bundle.networkPassphrase}`,
    `proof protocol: ${bundle.proof.protocol}`,
    "public signals:",
    ...formatList(bundle.publicSignals),
    `calldata bytes: ${calldata.proofA.length + calldata.proofB.length + calldata.proofC.length}`
  ];
}

function commandEstimateFee(args: string[]): string[] {
  const proof = readJson<SnarkjsProof>(requireFlag(args, "--proof"));
  const publicSignals = readJson<string[]>(requireFlag(args, "--public"));
  const calldata = formatProof(proof, publicSignals);

  const proofBytes = calldata.proofA.length + calldata.proofB.length + calldata.proofC.length;
  const publicBytes = calldata.publicInputs.reduce((total, item) => total + item.length, 0);
  const totalBytes = proofBytes + publicBytes;
  const estimatedFee = 100 + totalBytes * 7;

  return [
    "command: estimate-fee",
    `proof bytes: ${proofBytes}`,
    `public input bytes: ${publicBytes}`,
    `total bytes: ${totalBytes}`,
    `estimated fee (stroops): ${estimatedFee}`
  ];
}

function commandFormatVk(args: string[]): string[] {
  const id = requireFlag(args, "--id");
  const vk = readJson<VerificationKey>(requireFlag(args, "--vk"));
  const registryId = getFlag(args, "--registry-id") ?? REGISTRY_CONTRACT_ID;

  const { alpha, beta, gamma, delta, ic } = formatVerifyingKey(vk);
  const vkJson = JSON.stringify({
    alpha: alpha.toString("hex"),
    beta: beta.toString("hex"),
    gamma: gamma.toString("hex"),
    delta: delta.toString("hex"),
    ic: ic.map((point) => point.toString("hex"))
  });

  return [
    "command: format-vk",
    `circuit id: ${id}`,
    `registry: ${registryId}`,
    `alpha bytes: ${alpha.length}`,
    `beta bytes: ${beta.length}`,
    `gamma bytes: ${gamma.length}`,
    `delta bytes: ${delta.length}`,
    `ic points: ${ic.length}`,
    "",
    "stellar contract invoke \\",
    `  --id ${registryId} \\`,
    "  --network testnet \\",
    "  --source-account <registry-admin> \\",
    `  -- register_circuit --id ${id} --vk '${vkJson}'`
  ];
}

export function runCli(argv: string[]): string {
  const [command, ...args] = argv;

  switch (command) {
    case "prove":
      return commandProve(args).join("\n");
    case "verify":
      return commandVerify(args).join("\n");
    case "inspect":
      return commandInspect(args).join("\n");
    case "estimate-fee":
      return commandEstimateFee(args).join("\n");
    case "format-vk":
      return commandFormatVk(args).join("\n");
    default:
      return USAGE;
  }
}

if (require.main === module) {
  try {
    process.stdout.write(`${runCli(process.argv.slice(2))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
