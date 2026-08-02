/**
 * An in-memory `KVNamespaceLike` for tests.
 *
 * The store's contract is mostly about *key layout* — what a prefix purge
 * reaches and what it leaves — so the fake has to be faithful about listing:
 * prefix filtering, sorted key order, and cursor pagination with a page size
 * small enough that tests actually cross a page boundary. A fake that returns
 * everything in one page would let a purge that ignores the cursor pass.
 */
import type { KVNamespaceLike } from "../env.js";

interface Stored {
  value: string;
  metadata?: unknown;
  expiresAtMs?: number;
}

export class MemoryKV implements KVNamespaceLike {
  private readonly entries = new Map<string, Stored>();
  /** Every `put` seen, so tests can assert on TTL and metadata. */
  readonly puts: { key: string; options?: { expirationTtl?: number; metadata?: unknown } }[] = [];

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

  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number; metadata?: unknown },
  ): Promise<void> {
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
    keys: { name: string; metadata?: unknown }[];
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
      keys: page.map((name) => ({ name, metadata: this.entries.get(name)?.metadata })),
      list_complete: complete,
      cursor: complete ? undefined : page[page.length - 1],
    });
  }

  /** Every live key, for assertions about what a purge left behind. */
  keys(): string[] {
    return [...this.entries.keys()].filter((key) => this.live(key) !== undefined).sort();
  }
}
