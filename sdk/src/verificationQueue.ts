// sdk/src/verificationQueue.ts
/**
 * Opt-in client-side concurrency limiting for proof verification (the
 * `createVerificationQueue` helper).
 *
 * Applications that fire many {@link verifyOnChain} calls at once can
 * exhaust an RPC endpoint's rate limit: every in-flight verification opens
 * its own transaction and polling loop on the same endpoint. A verification
 * queue caps how many verifications are in flight at any moment — at most
 * `concurrency` {@link verifyOnChain} calls run simultaneously — and holds
 * the excess callers in memory, transparently starting each one as soon as
 * a slot opens. Callers keep the same await/try-catch ergonomics as calling
 * {@link verifyOnChain} directly: `queue.verify(opts)` resolves with the
 * same {@link VerifyResult} (or rejects with the same error) that an
 * uncapped call would have produced.
 *
 * Deliberate non-features (kept to the issue's scope): no priority
 * reordering (strict FIFO), no per-caller accounting, and no persistence —
 * a pending job lives only in this process's memory.
 */

import { verifyOnChain } from "./verify.js";
import { createLogger, defaultLogger, LogHandler, Logger } from "./logger.js";
import {
  SorobanZkError,
  SorobanZkErrorCode,
  VerifyOptions,
  VerifyResult
} from "./types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Options accepted by {@link createVerificationQueue}. */
export interface CreateVerificationQueueOptions {
  /**
   * Maximum number of verifications allowed in flight at the same time.
   * Must be an integer >= 1 — `0` would deadlock every queued caller,
   * and a fractional value is meaningless for a call count.
   */
  concurrency: number;
  /**
   * Optional logger for structured logging. Omit to use the default
   * logger (WARN level, console output) — see {@link LogHandler}.
   */
  logger?: LogHandler;
}

/**
 * A concurrency-limited verification queue created by
 * {@link createVerificationQueue}.
 */
export interface VerificationQueue {
  /**
   * Run one {@link verifyOnChain} call through the queue. Resolves with
   * the call's {@link VerifyResult} when the verification completes, or
   * rejects with the underlying call's error — a rejected verification
   * never affects other queued or in-flight jobs.
   */
  verify(opts: VerifyOptions): Promise<VerifyResult>;
  /**
   * Number of verifications currently queued but not yet started: each of
   * these is waiting for an in-flight slot held by a {@link running} job.
   */
  readonly pending: number;
  /** Number of verifications currently executing. */
  readonly running: number;
}

interface QueueEntry {
  opts: VerifyOptions;
  run: (result: VerifyResult) => void;
  fail: (error: unknown) => void;
}

/**
 * Create a queue that runs at most `concurrency` {@link verifyOnChain}
 * calls simultaneously, queuing the rest in memory.
 *
 * Every `queue.verify(opts)` call is subject to the cap: the first
 * `concurrency` callers start immediately, and each later caller is held
 * in a FIFO queue until an in-flight verification finishes. The queue's
 * `pending` and `running` properties expose the current occupancy.
 *
 * @example
 * ```ts
 * const queue = createVerificationQueue({ concurrency: 2 });
 *
 * const results = await Promise.all(
 *   proofs.map((proof) =>
 *     queue.verify({
 *       network: TESTNET,
 *       keypair,
 *       bundle: proof,
 *     })
 *   )
 * );
 * // At most 2 of these verifications ever touched the RPC endpoint at once;
 * // `queue.pending` counted the others between 0 and 8 in flight.
 * ```
 */
export function createVerificationQueue(
  options: CreateVerificationQueueOptions
): VerificationQueue {
  const concurrency = options.concurrency;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new SorobanZkError(
      `createVerificationQueue requires an integer concurrency >= 1, received ${concurrency}`,
      SorobanZkErrorCode.INVALID_PROOF_FORMAT
    );
  }

  const logger: Logger = options.logger ? createLogger("DEBUG", options.logger) : defaultLogger;

  // One FIFO entry per queued (not yet started) verification. Both
  // counters are always updated synchronously — `queue.verify()` runs its
  // admission check inside the promise executor, and every start/finish
  // transition happens before the first await or in the entry's settled
  // callback — so `pending`/`running` are accurate from the caller's point
  // of view without any internal async bookkeeping.
  let running = 0;
  const waiting: QueueEntry[] = [];

  // Start one entry's underlying call and release its slot when it
  // settles. Admitting a queued caller here rather than popping from
  // `waiting` inside the `.finally` keeps the FIFO order and keeps the cap
  // exact: the new job's synchronous prefix runs before any other settle
  // callback can admit another one.
  function execute(entry: QueueEntry): void {
    void (async () => {
      try {
        const result = await verifyOnChain(entry.opts);
        entry.run(result);
      } catch (error) {
        entry.fail(error);
      } finally {
        running -= 1;
        logger.debug("verificationQueue", "verification finished", {
          running,
          pending: waiting.length
        });
        admit();
      }
    })();
  }

  // Admit queued jobs into open slots. Called from `queue.verify` (when a
  // slot is free at admission time) and after every completion.
  function admit(): void {
    while (running < concurrency && waiting.length > 0) {
      const next = waiting.shift()!;
      running += 1;
      logger.debug("verificationQueue", "queued verification started", {
        running,
        pending: waiting.length
      });
      // Runs the job synchronously up to the underlying call's first
      // await, so the admitted job occupies its slot immediately.
      execute(next);
    }
  }

  const queue: VerificationQueue = {
    verify(opts: VerifyOptions): Promise<VerifyResult> {
      return new Promise<VerifyResult>((run, fail) => {
        const entry: QueueEntry = { opts, run, fail };
        if (running < concurrency) {
          running += 1;
          logger.debug("verificationQueue", "verification started", {
            running,
            pending: waiting.length
          });
          execute(entry);
        } else {
          waiting.push(entry);
          logger.debug("verificationQueue", "verification queued", {
            running,
            pending: waiting.length
          });
        }
      });
    },
    get pending(): number {
      return waiting.length;
    },
    get running(): number {
      return running;
    }
  };

  return queue;
}
