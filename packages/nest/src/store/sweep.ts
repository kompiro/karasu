/**
 * Listing and deleting a whole key prefix, once, for every gallery store.
 *
 * Account deletion has to sweep three prefixes (`acct/`, `sub/`, `sess/`), and
 * a purge that half-works is the failure mode this whole key layout exists to
 * prevent. Three hand-rolled copies of the loop is three places for the
 * cursor handling to drift apart, so the loop lives here and the stores name
 * their prefix.
 */
import type { KVNamespaceLike } from "../env.js";

const LIST_PAGE_SIZE = 1000;

/**
 * Enough pages to drain any prefix a solo-operated gallery will hold, and low
 * enough that a delete which does not stick is reported rather than looped on
 * forever.
 */
export const DEFAULT_MAX_PURGE_PAGES = 64;

/** Every key under `prefix`, walked by cursor. */
export async function listByPrefix(kv: KVNamespaceLike, prefix: string): Promise<string[]> {
  const names: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix, cursor, limit: LIST_PAGE_SIZE });
    for (const key of page.keys) names.push(key.name);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor !== undefined);
  return names;
}

/**
 * Delete every key under `prefix`, and report how many.
 *
 * Lists from the start each round rather than walking a cursor. We are
 * deleting the very keys being iterated, and a cursor's meaning under
 * concurrent deletion is not something to bet a deletion promise on.
 * Restarting is correct whatever the cursor semantics are: deleted keys leave
 * the prefix, so the loop ends when the prefix is empty.
 */
export async function purgeByPrefix(
  kv: KVNamespaceLike,
  prefix: string,
  maxPages = DEFAULT_MAX_PURGE_PAGES,
): Promise<number> {
  // Counted as a set: a key KV re-lists because the delete has not propagated
  // yet is the same key, and counting it twice would report a purge as larger
  // than it was.
  const deleted = new Set<string>();
  for (let page = 0; page < maxPages; page += 1) {
    const listed = await kv.list({ prefix, limit: LIST_PAGE_SIZE });
    if (listed.keys.length === 0) return deleted.size;
    // Sequential rather than `Promise.all`: a purge is not latency-sensitive,
    // and a thousand concurrent deletes is a good way to be rate-limited
    // halfway through.
    for (const key of listed.keys) {
      await kv.delete(key.name);
      deleted.add(key.name);
    }
  }
  throw new Error(`purge did not converge after ${maxPages} pages for prefix ${prefix}`);
}
