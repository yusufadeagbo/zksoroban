import { parentPort } from "node:worker_threads";
import fs from "node:fs";
import path from "node:path";
import { generateProof } from "@zksoroban/sdk/browser";
import type { ProofJobData, ProofJobResult } from "./types.js";

function resolveCircuitFiles(job: ProofJobData): { wasmBytes: Uint8Array; zkeyBytes: Uint8Array } {
  let wasmBytes: Uint8Array;
  let zkeyBytes: Uint8Array;

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

  return { wasmBytes, zkeyBytes };
}

if (parentPort) {
  parentPort.on("message", async (job: ProofJobData) => {
    try {
      const secret = BigInt(job.secret);
      const commitment = BigInt(job.commitment);

      const { wasmBytes, zkeyBytes } = resolveCircuitFiles(job);
      const result = await generateProof(secret, commitment, wasmBytes, zkeyBytes);

      const response: ProofJobResult = {
        id: job.id,
        success: true,
        result
      };
      parentPort!.postMessage(response);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const response: ProofJobResult = {
        id: job.id,
        success: false,
        error: errorMessage
      };
      parentPort!.postMessage(response);
    }
  });
}
