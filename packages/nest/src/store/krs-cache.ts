/**
 * The only thing karasu-nest persists: generated `.krs`.
 *
 * ADR-1990 decision 6 says raw code is discarded once the `.krs` exists, and
 * that the cache holds structure only. A store that accepts any `string` makes
 * that a rule people have to remember, so `put` accepts a `GeneratedKrs` — a
 * branded string that only `markGenerated` produces. That function is the
 * single choke point where the structure-only scan (#2287) will be installed;
 * until then it is a marker, but it is a marker in exactly one place rather
 * than a convention spread across call sites.
 */
import type { KVNamespaceLike } from "../env.js";
import { type CachedRef, cacheKey, installationPrefix, type RepoRef, repoPrefix } from "./keys.js";

declare const generatedKrsBrand: unique symbol;

/** A `.krs` that has passed through the generation pipeline's exit check. */
export type GeneratedKrs = string & { readonly [generatedKrsBrand]: true };

/**
 * Mark a string as generated `.krs`, cleared for persistence.
 *
 * Call this at the end of the pipeline, never at a call site that happens to
 * have a string handy. #2287 turns it into a real gate: today it only refuses
 * an empty document, which would otherwise cache as a valid negative and be
 * served as a diagram of nothing.
 */
export function markGenerated(krs: string): GeneratedKrs {
  if (krs.trim().length === 0) throw new Error("refusing to cache an empty .krs");
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
}

const DEFAULT_TTL_SECONDS = 90 * 24 * 60 * 60;

/** KV caps a single `list` page at 1000 keys. */
const LIST_PAGE_SIZE = 1000;

/**
 * A ceiling on the restart-scan loop below. At 1000 keys a page this covers
 * ten million cached `.krs` for one installation, so hitting it means deletes
 * are not sticking, not that someone was busy.
 */
const MAX_PURGE_PAGES = 10_000;

export class KrsCache {
  private readonly ttlSeconds: number;

  constructor(
    private readonly kv: KVNamespaceLike,
    options: KrsCacheOptions = {},
  ) {
    this.ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
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
   * not stop at the first page. Returns the number of keys deleted, which is
   * what makes the purge auditable: "we deleted 0" and "there was nothing to
   * delete" have to be the same statement, and a caller that logs the count
   * can tell that it ran.
   */
  purgeInstallation(installationId: number | string): Promise<number> {
    return this.purgeByPrefix(installationPrefix(installationId));
  }

  /** Delete every SHA cached for one repo under one installation. */
  purgeRepo(ref: RepoRef): Promise<number> {
    return this.purgeByPrefix(repoPrefix(ref));
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
    let deleted = 0;
    for (let page = 0; page < MAX_PURGE_PAGES; page += 1) {
      const listed = await this.kv.list({ prefix, limit: LIST_PAGE_SIZE });
      if (listed.keys.length === 0) return deleted;
      // Sequential rather than Promise.all: a purge is not latency-sensitive,
      // and a thousand concurrent deletes is a good way to get rate-limited
      // halfway through.
      for (const key of listed.keys) {
        await this.kv.delete(key.name);
        deleted += 1;
      }
    }
    // Reached only if the prefix never drains — a delete that does not stick.
    // Failing loudly beats reporting a purge that did not complete.
    throw new Error(`purge did not converge after ${MAX_PURGE_PAGES} pages for prefix ${prefix}`);
  }
}
