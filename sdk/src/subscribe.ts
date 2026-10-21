// sdk/src/subscribe.ts
//
// subscribeToVerifications (zksoroban#32) — stream contracts/verifier's
// `verification_result` events (topics `["zk", "verify"]`, published on
// every `verify_proof`/`verify_batch` call that returns via `Ok(...)`, per
// zksoroban#218 / docs/architecture.md's "Events" section) as an
// AsyncIterable, instead of a caller polling `getTransaction` itself for a
// single submission.
//
// Out of scope, per the issue: a WebSocket transport (Soroban RPC exposes
// none — this polls `getEvents` on an interval, same as every other
// Soroban event-streaming integration), and replaying history older than
// an RPC provider's own retention window (commonly on the order of the
// last ~1000 ledgers; `getEvents` itself rejects a `startLedger` older
// than that with its own error, which this function does not attempt to
// work around).
import { rpc, scValToNative, xdr } from "@stellar/stellar-sdk";

import { assertNetworkPassphrase, makeServer } from "./verify.js";
import { NetworkConfig, RetryOptions } from "./types.js";

/**
 * One `verification_result` event, decoded from the contract's own
 * `VerificationResult` (`{ success, caller, inputs_hash }`) plus the
 * ledger/transaction metadata `getEvents` reports alongside it.
 */
export interface VerificationEvent {
  success: boolean;
  caller: string;
  /** sha256 of the concatenated public inputs, in call order — see `VerificationResult`'s own doc comment in `contracts/verifier/src/lib.rs`. */
  inputsHash: Buffer;
  ledger: number;
  txHash: string;
}

export interface SubscribeToVerificationsOptions {
  network: NetworkConfig;
  /**
   * Milliseconds between `getEvents` polls. Defaults to `5000`. Soroban
   * RPC has no push/WebSocket transport for events (out of scope per the
   * issue), so this is genuinely polling under the hood regardless of the
   * value chosen.
   */
  pollIntervalMs?: number;
  /**
   * Ledger to start from, inclusive. Omit to start from the latest ledger
   * at subscription time — i.e. only events from here forward, not a
   * replay of history. An RPC provider's own event retention window
   * (commonly on the order of the last ~1000 ledgers) bounds how far back
   * this can usefully go; `getEvents` itself rejects an older value.
   */
  startLedger?: number;
  /**
   * Optional retry policy for transient RPC failures on each poll. Omit
   * for the previous single-attempt-per-poll behavior — see
   * {@link RetryOptions}. A poll that exhausts its retries propagates as a
   * thrown error from the iterator, the same as any other step.
   */
  retry?: RetryOptions;
}

// `#[contractevent(topics = ["zk", "verify"])]` on VerificationResult
// (contracts/verifier/src/lib.rs) — two Symbol topics, base64-XDR-encoded
// the same way Api.EventFilter's own topics are documented to expect
// (@stellar/stellar-sdk's getEvents JSDoc example).
const VERIFICATION_RESULT_TOPICS = [
  xdr.ScVal.scvSymbol("zk").toXDR("base64"),
  xdr.ScVal.scvSymbol("verify").toXDR("base64")
];

/**
 * Decode one `getEvents` entry into a {@link VerificationEvent}. `event.value`
 * decodes the same way every other contracttype struct's return value does
 * elsewhere in this SDK (e.g. `getContractConfig`'s raw `get_config` decode)
 * — a plain object keyed by the Rust struct's own (snake_case) field names.
 */
function decodeVerificationEvent(event: rpc.Api.EventResponse): VerificationEvent {
  const raw = scValToNative(event.value) as {
    success: boolean;
    caller: string;
    inputs_hash: Buffer | Uint8Array;
  };

  return {
    success: Boolean(raw.success),
    caller: String(raw.caller),
    inputsHash: Buffer.from(raw.inputs_hash),
    ledger: event.ledger,
    txHash: event.txHash
  };
}

/**
 * Stream `contracts/verifier`'s `verification_result` events as they're
 * published, in ledger order, instead of a caller polling `getTransaction`
 * for one specific submission.
 *
 * Returns an `AsyncGenerator`, which is an `AsyncIterable` — consume it
 * with `for await`:
 *
 * @example
 * ```ts
 * const events = subscribeToVerifications({ network: TESTNET });
 * for await (const event of events) {
 *   console.log(event.success, event.caller, event.txHash);
 *   if (shouldStop) break; // runs the generator's cleanup, stops polling
 * }
 * ```
 *
 * Breaking out of a `for await` loop (or calling `.return()` on the
 * iterator directly) terminates the subscription cleanly: an async
 * generator's `.return()` resumes execution at the next `await`/`yield`
 * checkpoint as if a `return` had been thrown there, running any `finally`
 * block, and the loop does not poll again afterward.
 */
export async function* subscribeToVerifications(
  opts: SubscribeToVerificationsOptions
): AsyncGenerator<VerificationEvent, void, void> {
  const pollIntervalMs = opts.pollIntervalMs ?? 5_000;
  const server = makeServer(opts.network, opts.retry);

  const networkInfo = await server.getNetwork();
  assertNetworkPassphrase(opts.network, networkInfo.passphrase);

  const initialStartLedger: number =
    opts.startLedger !== undefined ? opts.startLedger : (await server.getLatestLedger()).sequence;

  const filters: rpc.Api.EventFilter[] = [
    {
      type: "contract",
      contractIds: [opts.network.contractId],
      topics: [VERIFICATION_RESULT_TOPICS]
    }
  ];

  let cursor: string | undefined;

  while (true) {
    const response: rpc.Api.GetEventsResponse = cursor
      ? await server.getEvents({ filters, cursor })
      : await server.getEvents({ filters, startLedger: initialStartLedger });

    // getEvents is documented to return events in ledger order already,
    // but sorting defensively by (ledger, transactionIndex,
    // operationIndex) guarantees it regardless of any single response's
    // own ordering — directly the issue's own acceptance criterion.
    const ordered = [...response.events].sort((a, b) => {
      if (a.ledger !== b.ledger) return a.ledger - b.ledger;
      if (a.transactionIndex !== b.transactionIndex) return a.transactionIndex - b.transactionIndex;
      return a.operationIndex - b.operationIndex;
    });

    for (const event of ordered) {
      yield decodeVerificationEvent(event);
    }

    cursor = response.cursor;
    await delay(pollIntervalMs);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
