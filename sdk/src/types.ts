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

/**
 * Options accepted by {@link verifyViaRegistry}.
 *
 * Unlike {@link VerifyOptions}, no `keypair` is needed: `contracts/registry`'s
 * `verify_proof(id, ...)` requires no auth and mutates no storage, so this
 * call is simulation-only, exactly like {@link GetContractConfigOptions}.
 */
export interface VerifyViaRegistryOptions {
  rpcUrl: string;
  /** Bech32m address of the deployed `contracts/registry` instance. */
  registryContractId: string;
  /** The `id` a circuit was registered under via `register_circuit`. */
  circuitId: number;
  calldata?: SorobanProofCalldata;
  bundle?: ProofBundle;
}

export enum SorobanZkErrorCode {
  INVALID_PROOF_FORMAT = "INVALID_PROOF_FORMAT",
  INVALID_PUBLIC_INPUT = "INVALID_PUBLIC_INPUT",
  CONTRACT_INVOCATION_FAILED = "CONTRACT_INVOCATION_FAILED",
  TRANSACTION_REJECTED = "TRANSACTION_REJECTED",
  NETWORK_ERROR = "NETWORK_ERROR",
  RESOURCE_LIMIT_EXCEEDED = "RESOURCE_LIMIT_EXCEEDED",
  NETWORK_MISMATCH = "NETWORK_MISMATCH",
  // Mirror contracts/verifier's `Error` enum (contracterror, repr(u32)) so a
  // caller can distinguish these from each other and from generic failures,
  // instead of every contract-level rejection collapsing into `false`.
  CONTRACT_NOT_INITIALIZED = "CONTRACT_NOT_INITIALIZED",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  INVALID_WINDOW_SIZE = "INVALID_WINDOW_SIZE",
  PROOF_EXPIRED = "PROOF_EXPIRED",
  CALLER_NOT_ALLOWED = "CALLER_NOT_ALLOWED",
  // Witness/proof computation itself failed (e.g. a wasm/zkey mismatch, or an
  // input that doesn't satisfy the circuit's constraints) — distinct from
  // INVALID_PROOF_FORMAT, which is about a proof's on-the-wire shape.
  PROOF_GENERATION_FAILED = "PROOF_GENERATION_FAILED"
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

/**
 * A read-only snapshot of all non-sensitive verifier contract configuration
 * fields, as returned by the `get_config` contract function.
 *
 * Fields that the current contract does not implement (fee, timelock, etc.)
 * are returned as `undefined` / `false` so callers can detect at runtime
 * whether a feature is active without needing to know the contract version.
 */
export interface ContractConfig {
  /** Contract administrator Stellar address (G… or C…). */
  admin: string;
  /** Whether the contract is paused. Always `false` in the current version. */
  paused: boolean;
  /** Optional fee amount in stroops. `undefined` when not configured. */
  feeAmount: bigint | undefined;
  /** Optional fee token contract address. `undefined` when not configured. */
  feeToken: string | undefined;
  /** Maximum `verify_proof` calls allowed per caller per rate-limit window. */
  rateLimitMax: number;
  /** Rate-limit window size in ledgers. */
  rateLimitWindow: number;
  /** Timelock delay in ledgers. `undefined` when not configured. */
  timelockDelay: number | undefined;
  /** Whether an allowlist is enforced. Always `false` in the current version. */
  allowlistEnabled: boolean;
}

