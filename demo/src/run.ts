import { randomBytes } from "node:crypto";
import path from "node:path";
import readline from "node:readline";

import { Keypair, Networks } from "@stellar/stellar-sdk";

import { ProofBundle, formatProof, poseidon, verifyOnChain } from "@zksoroban/sdk";

const snarkjs: any = require("snarkjs");

const TESTNET_CONTRACT_ID = "CBL6MAWJALQP25LYKUUOC34K464XPSF6BLKUW6MXZDEXEDXMQUSP7HNN";
const NETWORKS: Record<string, string> = {
  testnet: "https://soroban-testnet.stellar.org",
  mainnet: "https://mainnet.sorobanrpc.com"
};
const CONTRACT_PATTERN = /^C[A-Z2-7]{55}$/;

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
  const calldata = formatProof(proof, publicSignals);

  log("submitting to the verifier contract...", "verbose");
  const bundle: ProofBundle = {
    proof,
    publicSignals,
    circuit: "poseidon_preimage",
    generatedAt: new Date().toISOString(),
    networkPassphrase: Networks.TESTNET
  };

  console.log(`circuit: ${bundle.circuit}`);
  console.log(`generatedAt: ${bundle.generatedAt}`);

  const result = await verifyOnChain({
    rpcUrl: answers.rpcUrl,
    contractId: answers.contractId,
    keypair: Keypair.fromSecret(secretKey),
    bundle
  });

  log(`txHash: ${result.txHash}`, "normal");
  log(`ledger: ${result.ledger}`, "verbose");
  log(`fee: ${result.fee}`, "verbose");
  console.log(`✓ Proof verified on-chain: ${result.verified}`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
