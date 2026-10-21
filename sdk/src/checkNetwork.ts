// sdk/src/checkNetwork.ts
//
// checkNetwork (zksoroban#87) — a lightweight RPC health check, so an
// application can get fast, structured feedback on a misconfigured or
// unreachable network before ever attempting a real proof submission.
import { rpc } from "@stellar/stellar-sdk";

import { NetworkConfig } from "./types.js";

/**
 * Result of {@link checkNetwork}. Exactly one of two shapes:
 * `reachable: true` with `latencyMs`/`networkPassphrase`/`protocolVersion`
 * populated, or `reachable: false` with `error` populated instead.
 */
export interface NetworkHealth {
  reachable: boolean;
  /** Round-trip time for the `getNetwork` call, in milliseconds. Only present when `reachable` is `true`. */
  latencyMs?: number;
  /** The network passphrase the RPC server itself reports. Only present when `reachable` is `true`. */
  networkPassphrase?: string;
  /** The RPC server's reported protocol version. Only present when `reachable` is `true`. */
  protocolVersion?: string;
  /** What went wrong. Only present when `reachable` is `false`. */
  error?: string;
}

/**
 * Ping `network.rpcUrl` with a single `getNetwork` call and report whether
 * it's reachable, how long it took, and what network it reports itself to
 * be on.
 *
 * Deliberately different from every other RPC-touching function in this
 * SDK in two ways, both intentional for what a health check is actually
 * for:
 *
 * - **Never throws.** `verifyOnChain` and friends throw a typed
 *   `SorobanZkError` on failure; this instead always resolves, with
 *   `{ reachable: false, error }` standing in for what would otherwise be
 *   a thrown error. A health check that itself requires a `try`/`catch`
 *   to use defeats the point of giving a plain status object back.
 * - **Does not retry.** `withRetry`/`RetryOptions` exist specifically to
 *   smooth over transient failures for a real operation; a health check
 *   needs the *unsmoothed* latency and reachability of a single real
 *   attempt, not a number that's already been averaged or masked by a
 *   retry policy.
 * - **Warns, rather than throws, on a passphrase mismatch.** Every other
 *   RPC-touching function throws `NetworkMismatchError` when
 *   `network.networkPassphrase` doesn't match what the RPC server itself
 *   reports (zksoroban#40) — appropriate when that mismatch would
 *   otherwise lead to building a transaction for the wrong network. Here,
 *   the endpoint being reachable at all is itself useful, actionable
 *   information even when it turns out to be configured for the wrong
 *   network, so this reports `reachable: true` (with the server's real
 *   passphrase) and emits a `console.warn` instead of throwing.
 *
 * @example
 * ```ts
 * const health = await checkNetwork(TESTNET);
 * if (health.reachable) {
 *   console.log(`reachable in ${health.latencyMs}ms, protocol v${health.protocolVersion}`);
 * } else {
 *   console.log(`unreachable: ${health.error}`);
 * }
 * ```
 */
export async function checkNetwork(network: NetworkConfig): Promise<NetworkHealth> {
  const started = Date.now();

  try {
    // Constructing rpc.Server inside the try block too: a malformed
    // rpcUrl can throw synchronously here, before getNetwork is ever
    // called, and that's exactly as much an "unreachable" outcome as a
    // real network failure would be.
    const server = new rpc.Server(network.rpcUrl, { allowHttp: network.rpcUrl.startsWith("http://") });
    const result = await server.getNetwork();
    const latencyMs = Date.now() - started;

    if (result.passphrase !== network.networkPassphrase) {
      console.warn(
        `checkNetwork: this NetworkConfig's networkPassphrase ("${network.networkPassphrase}") ` +
          `does not match what ${network.rpcUrl} itself reports ("${result.passphrase}") — ` +
          "it may be pointed at the wrong network."
      );
    }

    return {
      reachable: true,
      latencyMs,
      networkPassphrase: result.passphrase,
      protocolVersion: result.protocolVersion
    };
  } catch (error) {
    return {
      reachable: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
