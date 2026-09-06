/**
 * In-memory proof result cache for `verifyViaRegistry` and
 * `verifyBatchViaRegistry` (issue #16).
 *
 * Cache key: SHA-256 over the concatenation of
 *   contractId | circuitId (4-byte big-endian uint32) | proofA | proofB | proofC
 *   | N (4-byte big-endian uint32) | publicInputs[0] | … | publicInputs[N-1]
 *
 * That key uniquely identifies the on-chain verification call, so two calls
 * that differ in *any* input byte will never share a cache entry.
 *
 * Eviction policy: least-recently-used (LRU) via a doubly-linked list +
 * `Map`, keeping eviction at O(1) without introducing external dependencies.
 * An optional time-to-live (TTL) in milliseconds expires entries on read.
 */

import { createHash } from "node:crypto";
import type { CacheOptions, CacheStats } from "./types.js";
import type { SorobanProofCalldata } from "./types.js";

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface CacheEntry {
  /** Computed cache key (hex-encoded SHA-256 digest). */
  key: string;
  /** Cached boolean verification result. */
  value: boolean;
  /** `Date.now()` when this entry was stored. */
  storedAt: number;
  // doubly-linked list pointers (head = most recently used)
  prev: CacheEntry | null;
  next: CacheEntry | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export { CacheOptions, CacheStats };

/**
 * Compute the canonical cache key for a single (contract, circuit, calldata)
 * combination.
 *
 * Exported so that callers can pre-compute or inspect keys, and so that
 * `verifyBatchViaRegistry` can derive per-item keys without going through the
 * cache object.
 */
export function computeCacheKey(
  contractId: string,
  circuitId: number,
  calldata: SorobanProofCalldata
): string {
  const hash = createHash("sha256");

  // contract address (UTF-8)
  hash.update(Buffer.from(contractId, "utf8"));

  // circuit ID as 4-byte big-endian uint32
  const circuitIdBuf = Buffer.allocUnsafe(4);
  circuitIdBuf.writeUInt32BE(circuitId >>> 0, 0);
  hash.update(circuitIdBuf);

  // proof points
  hash.update(calldata.proofA);
  hash.update(calldata.proofB);
  hash.update(calldata.proofC);

  // public inputs: length-prefixed so [a,b] ≠ [ab]
  const countBuf = Buffer.allocUnsafe(4);
  countBuf.writeUInt32BE(calldata.publicInputs.length >>> 0, 0);
  hash.update(countBuf);
  for (const input of calldata.publicInputs) {
    hash.update(input);
  }

  return hash.digest("hex");
}

/**
 * LRU in-memory cache that maps proof-input hashes to boolean verification
 * results.
 *
 * @example
 * ```ts
 * const cache = new ProofResultCache({ maxSize: 512, ttlMs: 60_000 });
 *
 * const result = await verifyViaRegistry({ ..., cache });
 * // subsequent call with the same inputs is served from cache:
 * const cachedResult = await verifyViaRegistry({ ..., cache });
 *
 * console.log(cache.stats()); // { size: 1, hits: 1, misses: 1, … }
 * ```
 */
export class ProofResultCache {
  private readonly _maxSize: number;
  private readonly _ttlMs: number | undefined;

  /** Map from key → CacheEntry for O(1) lookup. */
  private readonly _map: Map<string, CacheEntry> = new Map();

  /** Sentinel head node (most recently used side). */
  private readonly _head: CacheEntry;
  /** Sentinel tail node (least recently used side). */
  private readonly _tail: CacheEntry;

  private _hits = 0;
  private _misses = 0;

  constructor(opts: CacheOptions = {}) {
    this._maxSize = opts.maxSize !== undefined && opts.maxSize > 0 ? opts.maxSize : 256;
    this._ttlMs = opts.ttlMs && opts.ttlMs > 0 ? opts.ttlMs : undefined;

    // Initialise sentinels; they never hold real values.
    this._head = {} as CacheEntry;
    this._tail = {} as CacheEntry;
    this._head.next = this._tail;
    this._tail.prev = this._head;
    this._head.prev = null;
    this._tail.next = null;
  }

  // -------------------------------------------------------------------------
  // Public methods
  // -------------------------------------------------------------------------

  /**
   * Look up a previously cached result.
   *
   * Returns `undefined` on a miss (key absent) or when the entry has
   * exceeded its TTL.  Promotes a hit to the most-recently-used position.
   */
  get(key: string): boolean | undefined {
    const entry = this._map.get(key);
    if (!entry) {
      this._misses++;
      return undefined;
    }

    // TTL check
    if (this._ttlMs !== undefined && Date.now() - entry.storedAt > this._ttlMs) {
      this._evictEntry(entry);
      this._misses++;
      return undefined;
    }

    // Promote to MRU position
    this._detach(entry);
    this._insertAfterHead(entry);

    this._hits++;
    return entry.value;
  }

  /**
   * Store a result.  Evicts the LRU entry first if the cache is at capacity.
   */
  set(key: string, value: boolean): void {
    // Update in place if the key already exists
    const existing = this._map.get(key);
    if (existing) {
      existing.value = value;
      existing.storedAt = Date.now();
      this._detach(existing);
      this._insertAfterHead(existing);
      return;
    }

    // Evict LRU when at capacity
    if (this._map.size >= this._maxSize) {
      const lru = this._tail.prev!;
      if (lru !== this._head) {
        this._evictEntry(lru);
      }
    }

    const entry: CacheEntry = {
      key,
      value,
      storedAt: Date.now(),
      prev: null,
      next: null
    };
    this._map.set(key, entry);
    this._insertAfterHead(entry);
  }

  /**
   * Remove all entries and reset hit/miss counters.
   */
  clear(): void {
    this._map.clear();
    this._head.next = this._tail;
    this._tail.prev = this._head;
    this._hits = 0;
    this._misses = 0;
  }

  /**
   * Return a point-in-time usage snapshot.
   */
  stats(): CacheStats {
    return {
      size: this._map.size,
      hits: this._hits,
      misses: this._misses,
      maxSize: this._maxSize,
      ttlMs: this._ttlMs
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _detach(entry: CacheEntry): void {
    entry.prev!.next = entry.next;
    entry.next!.prev = entry.prev;
  }

  private _insertAfterHead(entry: CacheEntry): void {
    entry.prev = this._head;
    entry.next = this._head.next;
    this._head.next!.prev = entry;
    this._head.next = entry;
  }

  private _evictEntry(entry: CacheEntry): void {
    this._detach(entry);
    this._map.delete(entry.key);
  }
}
