/**
 * Opt-in retry with exponential backoff for the SDK's RPC calls
 * (the `retry` option on `verifyOnChain`, `verifyBatchOnChain`,
 * `verifyViaRegistry`, `verifyBatchViaRegistry`, `estimateVerifyFee`, and
 * `getContractConfig`).
 *
 * `withRetry` wraps an RPC server (a `@stellar/stellar-sdk` `rpc.Server`,
 * or a duck-typed stub) so that its *read-only* requests — `getNetwork`,
 * `getAccount`, `simulateTransaction`, `prepareTransaction` — are retried
 * with exponential backoff when they fail transiently. Two methods are
 * deliberately left unwrapped:
 *
 * - `sendTransaction`: a signed submission is not idempotent. If the first
 *   attempt actually reached the network, replaying the same signed
 *   transaction could charge its fee and apply its effects twice. (Soroban
 *   treats a resubmitted identical transaction as DUPLICATE for a while,
 *   but we don't rely on that window being present or long enough.)
 * - `getTransaction`: the transaction-confirmation loop in `verify.ts`
 *   already handles NOT_FOUND by polling, and the result is
 *   submission-specific, not replayable.
 *
 * Retryability is decided per error message (see {@link classifyFailure}).
 * Note the deliberate asymmetry: an *unrecognized* failure defaults to
 * TRANSIENT — on a pure read, replaying can only delay an answer, never
 * duplicate one — while known-permanent rejections (contract errors,
 * malformed input, auth, "Account not found") surface immediately because
 * retrying cannot change the outcome. "Account not found" being permanent
 * is what keeps `verifyViaRegistry`'s ephemeral-account fallback
 * (catch + synthetic Account at sequence 0) latency-free under retries.
 *
 * The Proxy-based wrapping means the policy is testable without a network:
 * `sdk/test/retry.test.ts` drives it with stubbed servers, the same way
 * `verify.unit.test.ts` does.
 */

import type { RetryAttemptInfo, RetryOptions } from "./types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export { RetryOptions, RetryAttemptInfo };

/** Defaults applied to a {@link RetryOptions} with omitted fields. */
interface ResolvedRetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
  onRetry: ((info: RetryAttemptInfo) => void) | undefined;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 8_000;
const DEFAULT_JITTER = true;

/**
 * The RPC-server methods {@link withRetry} wraps. Everything else — most
 * importantly `sendTransaction` and `getTransaction` — is passed through
 * untouched. See the module doc comment for why.
 */
const RETRIED_METHODS: ReadonlySet<string> = new Set([
  "getNetwork",
  "getAccount",
  "simulateTransaction",
  "prepareTransaction"
]);

/** How {@link classifyFailure} expects a failed request to be handled. */
export enum TransientErrorKind {
  /** Replay the request after a backoff delay. */
  TRANSIENT = "TRANSIENT",
  /** Surface immediately — retrying cannot change the outcome. */
  PERMANENT = "PERMANENT"
}

/**
 * Classify one failed request by its error message. Exported so tests (and
 * curious callers) can inspect the policy without running a retry loop.
 */
export function classifyFailure(error: unknown): TransientErrorKind {
  const message = error instanceof Error ? error.message : String(error);
  const lowered = message.toLowerCase();

  // Permanent patterns are checked first: a message mentioning both (e.g.
  // "network error while verifying Error(Contract, #4)") must not retry.
  for (const pattern of PERMANENT_PATTERNS) {
    if (pattern.test(lowered)) {
      return TransientErrorKind.PERMANENT;
    }
  }

  for (const pattern of TRANSIENT_PATTERNS) {
    if (pattern.test(lowered)) {
      return TransientErrorKind.TRANSIENT;
    }
  }

  return TransientErrorKind.TRANSIENT;
}

const TRANSIENT_PATTERNS: RegExp[] = [
  /network/,
  /fetch/,
  /timeout|timed out/,
  /econnrefused|econnreset|econnaborted|etimedout|enotfound|ehostunreach|enetunreach/,
  /socket hang up/,
  /rate limit|too many requests/,
  /too few transactions/,
  /\b429\b/,
  /\b5\d{2}\b/,
  /temporarily unavailable|service unavailable|bad gateway|internal error/,
  /server error|overloaded|capacity/
];

const PERMANENT_PATTERNS: RegExp[] = [
  // Soroban's own error strings for wrong-input / auth rejections — the
  // same strings the SDK's typed-error mapping keys off of.
  /error\(contract/,
  /invalid|malformed|expired|not found|unauthorized|forbidden/,
  // Submitted transaction rejected outright by the RPC endpoint —
  // resubmitting the same bytes yields the same rejection.
  /tx_bad|tx_failed|tx_internal_error|tx_too_late/
];

/**
 * Compute the backoff delay before retry `attempt` (1-based: the delay
 * after the first failure is `attempt = 1`).
 *
 * The curve is `baseDelayMs * 2^(attempt-1)`, capped at `maxDelayMs`. With
 * jitter (the default) the value is then drawn uniformly from
 * `[0, capped]` — "full jitter" — so many concurrent callers don't retry
 * in lockstep and stampede the same RPC endpoint. Jitter never exceeds the
 * capped delay, so `maxDelayMs` stays a hard ceiling either way.
 *
 * Exported so tests can assert on the curve and so callers can pre-compute
 * the worst-case wall-clock time a policy can spend sleeping.
 */
export function computeBackoffDelay(
  attempt: number,
  opts: Pick<RetryOptions, "baseDelayMs" | "maxDelayMs" | "jitter"> = {}
): number {
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const jitter = opts.jitter ?? DEFAULT_JITTER;

  const capped = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);

  if (!jitter) {
    return capped;
  }

  return Math.floor(Math.random() * (capped + 1));
}

/**
 * Wrap an RPC server so its read-only methods are retried with exponential
 * backoff per {@link RetryOptions}. The returned object is a `Proxy` over
 * the original with the same type — call sites keep their existing
 * `server.someMethod(...)` shapes unchanged — and every other method
 * (submissions, confirmation polling, anything else) is passed through
 * bound to the original server.
 *
 * Retry is strictly opt-in: `opts === undefined` returns the original
 * server untouched (the SDK's historical single-attempt behavior). Pass
 * `retry: {}` to turn retries on with the defaults — up to 3 retries after
 * the initial attempt, 500ms doubling backoff capped at 8s, full jitter —
 * or set `maxRetries: 0` to disable retries explicitly.
 *
 * Rejections thrown by the caller's own logic around the server (typed
 * errors, contract errors decoded from simulations, etc.) are unrelated to
 * this layer and propagate untouched.
 *
 * @example
 * ```ts
 * const server = withRetry(new rpc.Server(rpcUrl, { allowHttp }), opts.retry);
 * // getAccount/simulateTransaction now retry transient failures;
 * // sendTransaction still fires exactly once.
 * ```
 */
export function withRetry<T extends object>(server: T, opts: RetryOptions | undefined): T {
  if (!opts) {
    return server;
  }

  const resolved: ResolvedRetryOptions = {
    maxRetries: opts?.maxRetries ?? DEFAULT_MAX_RETRIES,
    baseDelayMs: opts?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
    maxDelayMs: opts?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS,
    jitter: opts?.jitter ?? DEFAULT_JITTER,
    onRetry: opts?.onRetry
  };

  return new Proxy(server, {
    get(target, prop) {
      if (typeof prop === "string" && RETRIED_METHODS.has(prop)) {
        const original = (target as Record<string, unknown>)[prop];
        if (typeof original !== "function") {
          return original;
        }

        return (...args: unknown[]) =>
          retryRequest(prop, resolved, async () =>
            (original as (...fnArgs: unknown[]) => unknown).apply(target, args)
          );
      }

      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function retryRequest<T>(
  label: string,
  opts: ResolvedRetryOptions,
  fn: () => Promise<T>
): Promise<T> {
  let attempt = 0;

  // Loop shape: attempt → fail → maybe sleep → attempt … The initial try
  // counts as attempt 1; `attempt` is the number of failures so far, so
  // `maxRetries: 2` means at most three requests in total.
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;

      // Retries-so-far is attempt - 1; throw once maxRetries are used up.
      if (attempt > opts.maxRetries) {
        throw error;
      }

      if (classifyFailure(error) !== TransientErrorKind.TRANSIENT) {
        throw error;
      }

      const delayMs = computeBackoffDelay(attempt, opts);
      opts.onRetry?.({ label, attempt, delayMs, error });

      await sleep(delayMs);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
