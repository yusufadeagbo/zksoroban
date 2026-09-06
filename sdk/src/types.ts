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

/**
 * A Groth16 verifying key encoded into the raw-bytes layout
 * `contracts/registry`'s `register_circuit(id, vk)` expects — the same
 * BN254 G1/G2 point encoding {@link SorobanProofCalldata} uses for a proof,
 * applied to a verifying key's `alpha`/`beta`/`gamma`/`delta`/`IC` instead.
 */
export interface RegistryVerifyingKey {
  alpha: Buffer;
  beta: Buffer;
  gamma: Buffer;
  delta: Buffer;
  ic: Buffer[];
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
  /**
   * Optional proof result cache.  When provided, a successful result is
   * stored under a SHA-256 key derived from `(registryContractId, circuitId,
   * proofA, proofB, proofC, publicInputs)` and re-used on subsequent calls
   * with the same inputs, skipping the simulation round-trip entirely.
   */
  cache?: import("./cache.js").ProofResultCache;
}

/**
 * One proof in a {@link verifyBatchOnChain} call, targeting
 * `contracts/verifier`'s `verify_batch`. Same shape as a single
 * {@link VerifyOptions}'s proof inputs, minus the fields that are shared
 * across the whole batch (`rpcUrl`, `contractId`, `keypair`).
 */
export interface VerifierBatchItem {
  proof: SnarkjsProof;
  publicSignals: string[];
  expiryLedger?: number;
}

/**
 * Options accepted by {@link verifyBatchOnChain}.
 *
 * Like {@link VerifyOptions}, this targets `contracts/verifier`, which
 * requires the caller's own Soroban auth and mutates rate-limit state — so a
 * `keypair` is required and this submits a real transaction. All items in
 * `items` are verified in one transaction under that single `keypair`'s
 * identity, and are each still subject to their own allowlist/rate-limit/
 * expiry check.
 */
export interface VerifyBatchOptions {
  rpcUrl: string;
  contractId: string;
  keypair: Keypair;
  items: VerifierBatchItem[];
}

/**
 * Result of a {@link verifyBatchOnChain} call — `verified[i]` corresponds to
 * `items[i]` from the request, in order.
 */
export interface VerifyBatchResult {
  verified: boolean[];
  txHash: string;
  ledger: number;
  fee: string;
}

/**
 * One (circuit, proof) pair in a {@link verifyBatchViaRegistry} call,
 * targeting `contracts/registry`'s `verify_batch`.
 */
export interface RegistryBatchItem {
  /** The `id` a circuit was registered under via `register_circuit`. */
  circuitId: number;
  proof: SnarkjsProof;
  publicSignals: string[];
}

/**
 * Options accepted by {@link verifyBatchViaRegistry}.
 *
 * Like {@link VerifyViaRegistryOptions}, no `keypair` is needed: the
 * registry's `verify_batch` requires no auth and mutates no storage, so this
 * call is simulation-only.
 */
export interface VerifyBatchViaRegistryOptions {
  rpcUrl: string;
  /** Bech32m address of the deployed `contracts/registry` instance. */
  registryContractId: string;
  items: RegistryBatchItem[];
  /**
   * Optional proof result cache.  When provided, each item's result is
   * stored/retrieved under a SHA-256 key derived from `(registryContractId,
   * circuitId, proofA, proofB, proofC, publicInputs)`.  Items that all hit
   * the cache avoid the simulation call entirely.
   */
  cache?: import("./cache.js").ProofResultCache;
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

// ---------------------------------------------------------------------------
// ProofResultCache types
// ---------------------------------------------------------------------------

/**
 * Options for constructing a {@link ProofResultCache}.
 */
export interface CacheOptions {
  /**
   * Maximum number of entries the cache holds before evicting the
   * least-recently-used entry.  Defaults to `256`.
   */
  maxSize?: number;
  /**
   * Time-to-live for each entry in milliseconds.  Entries older than this
   * are treated as cache misses on the next read.  Omit (or set to `0`) for
   * no TTL.
   */
  ttlMs?: number;
}

/**
 * A point-in-time snapshot of {@link ProofResultCache} usage.
 */
export interface CacheStats {
  /** Number of entries currently in the cache. */
  size: number;
  /** Cumulative cache-hit count since the cache was created or last cleared. */
  hits: number;
  /** Cumulative cache-miss count since the cache was created or last cleared. */
  misses: number;
  /** The maximum number of entries the cache is allowed to hold. */
  maxSize: number;
  /** Configured TTL in milliseconds, or `undefined` when none is set. */
  ttlMs: number | undefined;
}

// ---------------------------------------------------------------------------

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

