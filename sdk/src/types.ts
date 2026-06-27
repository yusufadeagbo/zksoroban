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

export interface VerifyOptions {
  rpcUrl: string;
  contractId: string;
  keypair: Keypair;
  calldata: SorobanProofCalldata;
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
  RESOURCE_LIMIT_EXCEEDED = "RESOURCE_LIMIT_EXCEEDED"
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
    code: SorobanZkErrorCode = SorobanZkErrorCode.INVALID_PROOF_FORMAT
  ) {
    super(`${field} ${reason}`, code);
    this.name = "ZkInputError";
  }
}

