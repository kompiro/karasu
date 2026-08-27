/**
 * Deleting a whole key prefix, once, for every gallery store.
 *
 * A purge that half-works is the failure mode the whole key layout exists to
 * prevent, so the loop that does it lives in one place and the stores name
 * their prefix.
 *
 * Two stores sweep: sessions here, and submissions from #2587. Accounts do
 * not — `acct/v1/42` is a textual prefix of `acct/v1/420`, so that one record
 * is deleted by exact key (`gallery-keys.ts` explains why). Two copies of a
 * cursor loop is still two places for it to drift apart, and the branches that
 * matter here fire only when KV misbehaves, so having one copy to test is the
 * point rather than the count.
 */
import type { KVNamespaceLike } from "../env.js";

const LIST_PAGE_SIZE = 1000;

/**
 * Enough pages to drain any prefix a solo-operated gallery will hold, and low
 * enough that a delete which does not stick is reported rather than looped on
 * forever.
 */
const DEFAULT_MAX_PURGE_PAGES = 64;

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
