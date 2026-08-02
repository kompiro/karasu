/**
 * The only thing karasu-nest persists: generated `.krs`.
 *
 * ADR-1990 decision 6 says raw code is discarded once the `.krs` exists, and
 * that the cache holds structure only. A store that accepts any `string` makes
 * that a rule people have to remember, so `put` accepts a `GeneratedKrs` — a
 * branded string that `markGenerated` produces. The brand is a **signpost, not
 * a gate**: it is a compile-time cast, so a caller determined to bypass it can.
 * The gate is `assertGenerated`, which `put` runs again at write time; #2287
 * adds the structure-only scan to that one function and both paths inherit it.
 */
import type { KVNamespaceLike } from "../env.js";
import { type CachedRef, cacheKey, installationPrefix, type RepoRef, repoPrefix } from "./keys.js";

declare const generatedKrsBrand: unique symbol;

/** A `.krs` that has passed through the generation pipeline's exit check. */
export type GeneratedKrs = string & { readonly [generatedKrsBrand]: true };

/**
 * The actual check. Today it only refuses an empty document, which would
 * otherwise cache as a valid negative and be served as a diagram of nothing.
 * #2287 adds the structure-only scan here, and every writer inherits it
 * because `put` calls this too.
 */
function assertGenerated(krs: string): void {
  if (krs.trim().length === 0) throw new Error("refusing to cache an empty .krs");
}

/**
 * Mark a string as generated `.krs`, cleared for persistence.
 *
 * Call this at the end of the pipeline, never at a call site that happens to
 * have a string handy. The brand it returns documents intent; it does not
 * enforce anything on its own, which is why `put` re-checks.
 */
export function markGenerated(krs: string): GeneratedKrs {
  assertGenerated(krs);
  return krs as GeneratedKrs;
}

export interface KrsCacheEntry {
  krs: GeneratedKrs;
  /** ISO-8601. Supplied by the caller so the store stays clock-free and testable. */
  generatedAt: string;
}

/** What KV keeps alongside the value, so a listing needs no reads. */
interface EntryMetadata {
  generatedAt: string;
}

interface KrsCacheOptions {
  /**
   * Seconds before an entry expires. A backstop, not the deletion mechanism:
   * uninstall purges, and this only bounds growth for installations that stay
   * put and never regenerate. 90 days by default.
   */
  ttlSeconds?: number;
  /**
   * Page ceiling for the purge loop below. Configurable so the
   * non-convergence path can be tested; there is no reason to change it in
   * production.
   */
  maxPurgePages?: number;
}

const DEFAULT_TTL_SECONDS = 90 * 24 * 60 * 60;

/** Cloudflare KV rejects an `expirationTtl` below 60 seconds. */
const MIN_TTL_SECONDS = 60;

/** KV caps a single `list` page at 1000 keys. */
const LIST_PAGE_SIZE = 1000;

/**
 * A ceiling on the restart-scan loop below. At 1000 keys a page this covers
 * ten million cached `.krs` for one installation, so hitting it means deletes
 * are not sticking, not that someone was busy.
 */
const DEFAULT_MAX_PURGE_PAGES = 10_000;

export class KrsCache {
  private readonly ttlSeconds: number;
  private readonly maxPurgePages: number;

  constructor(
    private readonly kv: KVNamespaceLike,
    options: KrsCacheOptions = {},
  ) {
    this.ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    // Caught here rather than at the first `put`: a TTL the real binding will
    // reject should fail when the cache is constructed, not on whichever
    // request happens to be the first to write.
    if (!Number.isInteger(this.ttlSeconds) || this.ttlSeconds < MIN_TTL_SECONDS) {
      throw new Error(`ttlSeconds must be an integer of at least ${MIN_TTL_SECONDS}`);
    }
    this.maxPurgePages = options.maxPurgePages ?? DEFAULT_MAX_PURGE_PAGES;
  }

  async get(ref: CachedRef): Promise<KrsCacheEntry | undefined> {
    const raw = await this.kv.get(cacheKey(ref));
    if (raw === null) return undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // A value we cannot read is indistinguishable from a miss to the caller,
      // and treating it as one lets the next generation overwrite it. Throwing
      // here would make one bad entry a permanent 500 for that repo.
      return undefined;
    }
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const { krs, generatedAt } = parsed as Partial<Record<"krs" | "generatedAt", unknown>>;
    if (typeof krs !== "string" || typeof generatedAt !== "string") return undefined;
    return { krs: krs as GeneratedKrs, generatedAt };
  }

  async put(ref: CachedRef, entry: KrsCacheEntry): Promise<void> {
    // Re-checked here because the brand is a compile-time cast: it documents
    // that a value came from the pipeline, it cannot enforce it. This is the
    // write-time gate, and #2287's scan lands in the same function.
    assertGenerated(entry.krs);
    const metadata: EntryMetadata = { generatedAt: entry.generatedAt };
    await this.kv.put(cacheKey(ref), JSON.stringify(entry), {
      expirationTtl: this.ttlSeconds,
      metadata,
    });
  }

  /** Delete one cached SHA. Absent keys are not an error. */
  async delete(ref: CachedRef): Promise<void> {
    await this.kv.delete(cacheKey(ref));
  }

  /**
   * Delete everything this installation ever produced.
   *
   * This is what an uninstall webhook calls, so it deletes by prefix and does
   * not stop at the first page. Returns the number of **distinct** keys
   * deleted, which is what makes the purge auditable: a caller that logs the
   * count can tell it ran, and re-listing a key KV has not finished deleting
   * must not inflate the number.
   *
   * **KV `list` is eventually consistent**, so a `put` that landed moments
   * before this call can be invisible to the first listing and survive. That
   * is not fixable from here — it is why #2286 must treat purge as idempotent
   * and re-runnable rather than as a one-shot that reports success.
   */
  purgeInstallation(installationId: number | string): Promise<number> {
    return this.purgeByPrefix(installationPrefix(installationId));
  }

  /** Delete every SHA cached for one repo under one installation. */
  purgeRepo(ref: RepoRef): Promise<number> {
    return this.purgeByPrefix(repoPrefix(ref));
  }

  /**
   * The distinct repos this installation has cached anything for.
   *
   * Exists so a purge can clean up the out-of-prefix directory entries that
   * point into this installation *before* the keys naming those repos are
   * deleted. Reading it after the purge would find nothing.
   */
  async listRepos(installationId: number | string): Promise<{ owner: string; repo: string }[]> {
    const prefix = installationPrefix(installationId);
    const seen = new Map<string, { owner: string; repo: string }>();
    let cursor: string | undefined;
    do {
      const page = await this.kv.list({ prefix, cursor, limit: LIST_PAGE_SIZE });
      for (const key of page.keys) {
        const [owner, repo] = key.name.slice(prefix.length).split("/");
        if (owner === undefined || repo === undefined) continue;
        seen.set(`${owner}/${repo}`, { owner, repo });
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor !== undefined);
    return [...seen.values()];
  }

  /**
   * List a page, delete it, and list again from the start.
   *
   * Not a cursor walk. We are deleting the very keys we are iterating, and a
   * cursor's meaning under concurrent deletion is not something to bet the
   * uninstall path on — this is the one operation that must not half-finish.
   * Restarting the scan is correct whatever the cursor semantics are, because
   * deleted keys leave the prefix set: the loop ends when the prefix is empty.
   */
  private async purgeByPrefix(prefix: string): Promise<number> {
    // Counted as a set: a key KV re-lists because the delete has not
    // propagated yet is the same key, and counting it twice would report a
    // purge as larger than it was.
    const deleted = new Set<string>();
    for (let page = 0; page < this.maxPurgePages; page += 1) {
      const listed = await this.kv.list({ prefix, limit: LIST_PAGE_SIZE });
      if (listed.keys.length === 0) return deleted.size;
      // Sequential rather than Promise.all: a purge is not latency-sensitive,
      // and a thousand concurrent deletes is a good way to get rate-limited
      // halfway through.
      for (const key of listed.keys) {
        await this.kv.delete(key.name);
        deleted.add(key.name);
      }
    }
    // Reached only if the prefix never drains — a delete that does not stick.
    // Failing loudly beats reporting a purge that did not complete.
    throw new Error(
      `purge did not converge after ${this.maxPurgePages} pages for prefix ${prefix}`,
    );
  }
}
