const { parentPort } = require("node:worker_threads");
const fs = require("node:fs");
const path = require("node:path");

async function getProver() {
  try {
    const sdkBrowser = await import("@zksoroban/sdk/browser");
    if (sdkBrowser && typeof sdkBrowser.generateProof === "function") {
      return sdkBrowser.generateProof;
    }
  } catch {
    // fallback below
  }

  const snarkjs = await import("snarkjs");
  return async function generateProofFallback(secret, commitment, wasm, zkey) {
    const input = { secret: secret.toString(), commitment: commitment.toString() };
    const wtns = { type: "mem" };
    await snarkjs.wtns.calculate(input, wasm, wtns);
    const { proof, publicSignals } = await snarkjs.groth16.prove(zkey, wtns);
    return { proof, publicSignals };
  };
}

async function runProof(job) {
  let wasmBytes;
  let zkeyBytes;

  if (job.wasmBase64) {
    wasmBytes = new Uint8Array(Buffer.from(job.wasmBase64, "base64"));
  } else {
    const wasmPath =
      job.wasmPath ||
      process.env.CIRCUIT_WASM_PATH ||
      path.resolve(__dirname, "../../../circuits/poseidon_preimage/build/circuit_js/circuit.wasm");
    if (!fs.existsSync(wasmPath)) {
      throw new Error(`Circuit WASM file not found at: ${wasmPath}`);
    }
    wasmBytes = new Uint8Array(fs.readFileSync(wasmPath));
  }

  if (job.zkeyBase64) {
    zkeyBytes = new Uint8Array(Buffer.from(job.zkeyBase64, "base64"));
  } else {
    const zkeyPath =
      job.zkeyPath ||
      process.env.CIRCUIT_ZKEY_PATH ||
      path.resolve(__dirname, "../../../circuits/poseidon_preimage/setup/circuit.zkey");
    if (!fs.existsSync(zkeyPath)) {
      throw new Error(`Circuit zkey file not found at: ${zkeyPath}`);
    }
    zkeyBytes = new Uint8Array(fs.readFileSync(zkeyPath));
  }

  const secret = BigInt(job.secret);
  const commitment = BigInt(job.commitment);
  const prover = await getProver();
  const result = await prover(secret, commitment, wasmBytes, zkeyBytes);
  return result;
}

if (parentPort) {
  parentPort.on("message", async (job) => {
    try {
      const result = await runProof(job);
      parentPort.postMessage({ id: job.id, success: true, result });
    } catch (err) {
      parentPort.postMessage({
        id: job.id,
        success: false,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });
}
