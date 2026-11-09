/**
 * An in-memory `KVNamespaceLike` for tests.
 *
 * The store's contract is mostly about *key layout* — what a prefix purge
 * reaches and what it leaves — so the fake has to be faithful about listing:
 * prefix filtering, sorted key order, and cursor pagination with a page size
 * small enough that tests actually cross a page boundary. A fake that returns
 * everything in one page would let a purge that ignores the cursor pass.
 *
 * It is also the one KV every nest test writes through, which makes it the
 * place to hold the registry of key spaces (`GALLERY_KEY_SPACES`) at runtime.
 * The types already refuse an unregistered key or a TTL against the space's
 * retention in production code; this refuses them for anything a test writes,
 * including a key spelled as a string in the test itself. A store whose tests
 * write a prefix nobody registered, or a credential without an expiry, fails
 * on its first `put` (TPL-2226, TPL-2587).
 */
import { KV_MINIMUM_TTL_SECONDS, type KVNamespaceLike } from "../env.js";
import {
  GALLERY_KEY_SPACES,
  type GalleryKey,
  type KeySpaceDefinition,
} from "../store/gallery-keys.js";

type PutOptions = { expirationTtl?: number; metadata?: unknown };

/** The registered space `key` belongs to, or `undefined`. */
function spaceOf(key: string): KeySpaceDefinition | undefined {
  return Object.values(GALLERY_KEY_SPACES).find(({ prefix }) => key.startsWith(`${prefix}/`));
}

/**
 * Why the real deploy must never see this write, or `undefined` if it may.
 *
 * Returned as a reason rather than thrown, so `put` can reject the way the
 * binding surfaces its own refusals (see the TTL floor below).
 */
function refusal(key: string, options: PutOptions | undefined): string | undefined {
  const space = spaceOf(key);
  if (space === undefined) {
    return `${key} is in no registered key space; add it to GALLERY_KEY_SPACES`;
  }
  const ttl = options?.expirationTtl;
  if (space.retention === "content" && ttl !== undefined) {
    return `${key} is content (${space.prefix}) and must not expire`;
  }
  if (space.retention === "credential" && ttl === undefined) {
    return `${key} is a credential (${space.prefix}) and must expire`;
  }
  return undefined;
}

interface Stored {
  value: string;
  metadata?: unknown;
  expiresAtMs?: number;
}

export class MemoryKV implements KVNamespaceLike {
  private readonly entries = new Map<string, Stored>();
  /** Every `put` seen, so tests can assert on TTL and metadata. */
  readonly puts: { key: string; options?: PutOptions }[] = [];

  constructor(
    private readonly pageSize = 1000,
    private nowMs = 0,
  ) {}

  /** Advance the fake clock so TTL expiry can be exercised. */
  advance(seconds: number): void {
    this.nowMs += seconds * 1000;
  }

  private live(key: string): Stored | undefined {
    const stored = this.entries.get(key);
    if (stored === undefined) return undefined;
    if (stored.expiresAtMs !== undefined && stored.expiresAtMs <= this.nowMs) {
      this.entries.delete(key);
      return undefined;
    }
    return stored;
  }

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.live(key)?.value ?? null);
  }

  put(key: string, value: string, options?: PutOptions): Promise<void> {
    const refused = refusal(key, options);
    if (refused !== undefined) return Promise.reject(new Error(refused));
    return this.store(key, value, options);
  }

  /**
   * Write a record the service itself would never write: a session with no
   * expiry, say, to prove that `get` refuses one that outlived its cap.
   *
   * Skips the retention check and nothing else: the key still has to be in a
   * registered space, because no test has a reason to invent a prefix. Named
   * so a reader of the test sees the bypass; `put` is what stores go through.
   */
  plant(key: string, value: string, options?: PutOptions): Promise<void> {
    if (spaceOf(key) === undefined) {
      return Promise.reject(new Error(`${key} is in no registered key space`));
    }
    return this.store(key, value, options);
  }

  private store(key: string, value: string, options?: PutOptions): Promise<void> {
    // Real KV rejects a TTL below its floor. Without this the fake would
    // happily accept a value the binding refuses, and a misconfigured TTL
    // would pass every unit test and fail only in production.
    if (options?.expirationTtl !== undefined && options.expirationTtl < KV_MINIMUM_TTL_SECONDS) {
      // Rejected, not thrown: the real binding surfaces this asynchronously,
      // and a synchronous throw would let a caller's `.catch` miss it.
      return Promise.reject(
        new Error(`KV rejects an expirationTtl below ${KV_MINIMUM_TTL_SECONDS} seconds`),
      );
    }
    this.puts.push({ key, options });
    this.entries.set(key, {
      value,
      metadata: options?.metadata,
      expiresAtMs:
        options?.expirationTtl === undefined
          ? undefined
          : this.nowMs + options.expirationTtl * 1000,
    });
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.entries.delete(key);
    return Promise.resolve();
  }

  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    keys: { name: GalleryKey; metadata?: unknown }[];
    list_complete: boolean;
    cursor?: string;
  }> {
    const prefix = options?.prefix ?? "";
    const all = [...this.entries.keys()]
      .filter((key) => key.startsWith(prefix) && this.live(key) !== undefined)
      .sort();
    // Real KV cursors resume from a *key*, not an offset, so deleting already
    // listed keys does not make the walk skip. An offset-based fake would make
    // a delete-as-you-go caller look broken when it is not, and would hide the
    // opposite mistake just as easily.
    const after = options?.cursor;
    const remaining = after === undefined ? all : all.filter((key) => key > after);
    const limit = Math.min(options?.limit ?? this.pageSize, this.pageSize);
    const page = remaining.slice(0, limit);
    const complete = page.length === remaining.length;
    return Promise.resolve({
      // Every stored key passed `spaceOf` on the way in, so it is a key in a
      // registered space, which is what the binding's type promises.
      keys: page.map((name) => ({
        name: name as GalleryKey,
        metadata: this.entries.get(name)?.metadata,
      })),
      list_complete: complete,
      cursor: complete ? undefined : page[page.length - 1],
    });
  }

  /** Every live key, for assertions about what a purge left behind. */
  keys(): string[] {
    return [...this.entries.keys()].filter((key) => this.live(key) !== undefined).sort();
  }
}
