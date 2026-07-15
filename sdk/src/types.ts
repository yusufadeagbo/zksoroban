import { Keypair } from "@stellar/stellar-sdk";

export interface SnarkjsProof {
  pi_a: [string, string, string];
  pi_b: [[string, string], [string, string], [string, string]];
  pi_c: [string, string, string];
  protocol: "groth16";
}

export interface SorobanProofCalldata {
  proofA: Buffer;
  proofB: Buffer;
  proofC: Buffer;
  publicInputs: Buffer[];
}

export interface VerificationKey {
  protocol: string;
  curve: string;
  nPublic: number;
  vk_alpha_1: string[];
  vk_beta_2: string[][];
  vk_gamma_2: string[][];
  vk_delta_2: string[][];
  vk_alphabeta_12: string[][][];
  IC: string[][];
}

export interface ProofBundle {
  proof: SnarkjsProof;
  publicSignals: string[];
  circuit: string;
  generatedAt: string;
  networkPassphrase: string;
}

export interface VerifyOptions {
  rpcUrl: string;
  contractId: string;
  keypair: Keypair;
  calldata?: SorobanProofCalldata;
  bundle?: ProofBundle;
}

export interface VerifyResult {
  verified: boolean;
  txHash: string;
  ledger: number;
  fee: string;
}

export enum SorobanZkErrorCode {
  INVALID_PROOF_FORMAT = "INVALID_PROOF_FORMAT",
  INVALID_PUBLIC_INPUT = "INVALID_PUBLIC_INPUT",
  CONTRACT_INVOCATION_FAILED = "CONTRACT_INVOCATION_FAILED",
  TRANSACTION_REJECTED = "TRANSACTION_REJECTED",
  NETWORK_ERROR = "NETWORK_ERROR",
  RESOURCE_LIMIT_EXCEEDED = "RESOURCE_LIMIT_EXCEEDED",
  NETWORK_MISMATCH = "NETWORK_MISMATCH"
}

export class SorobanZkError extends Error {
  constructor(message: string, public code: SorobanZkErrorCode) {
    super(message);
    this.name = "SorobanZkError";
  }
}

export class ZkInputError extends SorobanZkError {
  constructor(
    public field: string,
    public reason: string,
    code: SorobanZkErrorCode = SorobanZkErrorCode.INVALID_PROOF_FORMAT,
    detail?: string
  ) {
    super(`${field} ${reason}${detail ? ` (${detail})` : ""}`, code);
    this.name = "ZkInputError";
  }
}

export class NetworkMismatchError extends SorobanZkError {
  constructor(public expected: string, public actual: string) {
    super(
      `ProofBundle targets network "${expected}" but the configured network is "${actual}"`,
      SorobanZkErrorCode.NETWORK_MISMATCH
    );
    this.name = "NetworkMismatchError";
  }
}

