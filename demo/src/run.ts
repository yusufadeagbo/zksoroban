import { randomBytes } from "node:crypto";
import path from "node:path";
import readline from "node:readline";

import { Keypair, Networks } from "@stellar/stellar-sdk";

import {
  ProofBundle,
  SnarkjsProof,
  ZkInputError,
  formatProof,
  poseidon,
  verifyOnChain
} from "@zksoroban/sdk";

const snarkjs: any = require("snarkjs");

const TESTNET_CONTRACT_ID = "CBL6MAWJALQP25LYKUUOC34K464XPSF6BLKUW6MXZDEXEDXMQUSP7HNN";
const NETWORKS: Record<string, string> = {
  testnet: "https://soroban-testnet.stellar.org",
  mainnet: "https://mainnet.sorobanrpc.com"
};
const CONTRACT_PATTERN = /^C[A-Z2-7]{55}$/;

// A syntactically valid field element that is nonetheless rejected: it's
// exactly the BN254 scalar field modulus, so it's "out of range" the same
// way sdk/src/validate.ts's own tests exercise this boundary.
const OUT_OF_FIELD_PUBLIC_INPUT =
  "21888242871839275222246405745257275088548364400416034343698204186575808495617";

interface Answers {
  secret: bigint;
  network: string;
  rpcUrl: string;
  contractId: string;
  verbosity: "quiet" | "normal" | "verbose";
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function randomSecret(): bigint {
  return BigInt(`0x${randomBytes(31).toString("hex")}`);
}

function ask(
  rl: readline.Interface,
  label: string,
  def: string | undefined,
  validate: (raw: string) => string | undefined
): Promise<string> {
  const suffix = def !== undefined ? ` [${def}]` : "";

  return new Promise((resolve) => {
    const prompt = (): void => {
      rl.question(`${label}${suffix}: `, (input) => {
        const trimmed = input.trim();
        const value = trimmed === "" && def !== undefined ? def : trimmed;
        const error = validate(value);

        if (error) {
          console.log(`  ${error}`);
          prompt();
          return;
        }

        resolve(value);
      });
    };

    prompt();
  });
}

async function collectAnswers(rl: readline.Interface): Promise<Answers> {
  const secretRaw = await ask(rl, "Secret value (decimal, or 'random')", undefined, (value) => {
    if (value === "") {
      return "Secret cannot be empty.";
    }
    if (value === "random") {
      return undefined;
    }
    if (!/^[0-9]+$/.test(value)) {
      return "Secret must be a decimal number or 'random'.";
    }
    return undefined;
  });

  const network = await ask(rl, "Network (testnet/mainnet)", "testnet", (value) => {
    if (!NETWORKS[value.toLowerCase()]) {
      return "Unknown network. Choose 'testnet' or 'mainnet'.";
    }
    return undefined;
  });

  const contractId = await ask(rl, "Contract address", TESTNET_CONTRACT_ID, (value) => {
    if (!CONTRACT_PATTERN.test(value)) {
      return "Invalid contract address. Expected a 56-character Soroban contract ID starting with 'C'.";
    }
    return undefined;
  });

  const verbosity = await ask(rl, "Verbosity (quiet/normal/verbose)", "normal", (value) => {
    if (!["quiet", "normal", "verbose"].includes(value.toLowerCase())) {
      return "Choose 'quiet', 'normal', or 'verbose'.";
    }
    return undefined;
  });

  return {
    secret: secretRaw === "random" ? randomSecret() : BigInt(secretRaw),
    network: network.toLowerCase(),
    rpcUrl: NETWORKS[network.toLowerCase()],
    contractId,
    verbosity: verbosity.toLowerCase() as Answers["verbosity"]
  };
}

async function verifyAndReport(opts: {
  proof: SnarkjsProof;
  publicSignals: string[];
  rpcUrl: string;
  contractId: string;
  keypair: Keypair;
  log: (line: string, level?: Answers["verbosity"]) => void;
}): Promise<void> {
  const bundle: ProofBundle = {
    proof: opts.proof,
    publicSignals: opts.publicSignals,
    circuit: "poseidon_preimage",
    generatedAt: new Date().toISOString(),
    networkPassphrase: Networks.TESTNET
  };

  opts.log("submitting to the verifier contract...", "verbose");

  const result = await verifyOnChain({
    rpcUrl: opts.rpcUrl,
    contractId: opts.contractId,
    keypair: opts.keypair,
    bundle
  });

  opts.log(`txHash: ${result.txHash}`, "normal");
  opts.log(`ledger: ${result.ledger}`, "verbose");
  opts.log(`fee: ${result.fee}`, "verbose");
  console.log(`✓ Proof verified on-chain: ${result.verified}`);
}

async function main(): Promise<void> {
  const secretKey = requireEnv("SOROBAN_SECRET_KEY");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on("SIGINT", () => {
    rl.close();
    console.log("\nAborted.");
    process.exit(0);
  });

  let answers: Answers;
  try {
    answers = await collectAnswers(rl);
  } finally {
    rl.close();
  }

  const log = (line: string, level: Answers["verbosity"] = "normal"): void => {
    const order = { quiet: 0, normal: 1, verbose: 2 };
    if (order[answers.verbosity] >= order[level]) {
      console.log(line);
    }
  };

  const circuitDir = path.resolve(__dirname, "../../circuits/poseidon_preimage");
  const wasmPath = path.join(circuitDir, "build/circuit_js/circuit.wasm");
  const zkeyPath = path.join(circuitDir, "setup/circuit.zkey");

  const commitment = poseidon([answers.secret]);

  log(`secret: ${answers.secret.toString()}`, "verbose");
  log(`network: ${answers.network} (${answers.rpcUrl})`, "verbose");
  log(`commitment: ${commitment.toString()}`, "normal");
  log("generating proof...", "verbose");

  const input = {
    secret: answers.secret.toString(),
    commitment: commitment.toString()
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
  const keypair = Keypair.fromSecret(secretKey);

  console.log("\n=== Scenario 1: success — valid proof ===");
  await verifyAndReport({
    proof,
    publicSignals,
    rpcUrl: answers.rpcUrl,
    contractId: answers.contractId,
    keypair,
    log
  });

  console.log("\n=== Scenario 2: failure — valid proof, wrong public input ===");
  log(
    "using the same proof, but a different commitment than the one it actually proves",
    "normal"
  );
  log("expected: verified = false (the pairing check rejects it, nothing throws)", "verbose");
  const wrongCommitment = poseidon([answers.secret + 1n]);
  await verifyAndReport({
    proof,
    publicSignals: [wrongCommitment.toString()],
    rpcUrl: answers.rpcUrl,
    contractId: answers.contractId,
    keypair,
    log
  });

  console.log("\n=== Scenario 3: failure — malformed public input ===");
  log("a public input at or beyond the BN254 field modulus is rejected before any network call", "normal");
  try {
    formatProof(proof, [OUT_OF_FIELD_PUBLIC_INPUT]);
    console.log("(unexpected: formatProof did not throw)");
  } catch (error) {
    if (!(error instanceof ZkInputError)) {
      throw error;
    }
    console.log("✗ formatProof threw ZkInputError, as expected:");
    console.log(`  code: ${error.code}`);
    console.log(`  message: ${error.message}`);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
