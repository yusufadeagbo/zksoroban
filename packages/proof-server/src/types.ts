import type { SnarkjsProof } from "@zksoroban/sdk/browser";

export interface ProveRequestBody {
  circuit?: string;
  inputs?: Record<string, unknown>;
  secret?: string | number | bigint;
  commitment?: string | number | bigint;
  wasm?: string; // Optional base64 or path
  zkey?: string; // Optional base64 or path
  wasmPath?: string;
  zkeyPath?: string;
}

export interface ProveSuccessResponse {
  proof: SnarkjsProof;
  publicSignals: string[];
}

export interface ErrorResponse {
  error: string;
  details?: unknown;
}

export interface ProofJobData {
  id: string;
  circuit: string;
  secret: string;
  commitment: string;
  wasmPath?: string;
  zkeyPath?: string;
  wasmBase64?: string;
  zkeyBase64?: string;
}

export interface ProofJobResult {
  id: string;
  success: boolean;
  result?: ProveSuccessResponse;
  error?: string;
}
