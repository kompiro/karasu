/**
 * How many times a generated model is actually read.
 *
 * This is the other half of the #2226 question. Cost per reverse says what a
 * generation costs; reads per generation says how many readers that spend
 * bought. A SHA-keyed cache that is written once and read once is a very
 * expensive way to render one diagram, and the quota that follows from it is
 * a different quota (ADR-1990 decision 3).
 *
 * **This is a lower bound, and a loose one.** The counter is a read-modify-
 * write on a KV key, and KV serves reads from a per-colo cache for up to a
 * minute, so every increment inside that window reads the same value and
 * writes the same result. A repo served two hundred times in a minute from
 * one colo may record one. Two colos serving concurrently overwrite each
 * other. The number answers "is anyone reading this at all, and roughly how
 * much" — it is not a count, and nothing downstream may treat it as one.
 *
 * That is tolerable because the direction is fixed: this metric can only read
 * low, and a low read argues for a *smaller* quota than the service could
 * afford (ADR-1990 decision 3). A metric that could read high would not be
 * tolerable, because it would argue for a quota nobody can pay for. The
 * report labels the figure rather than leaving a reader to assume precision.
 *
 * Buying real counts would mean a Durable Object per repo — an object, a
 * migration and a per-request hop, to count reads. That trade is available
 * later if the lower bound ever turns out to be the thing blocking a
 * decision; it is not worth making before it is.
 *
 * The write is handed to `waitUntil`, which is the mechanism that was wrong
 * for a generation (see `generate/dispatch.ts` and TPL-2288). It is right
 * here for the same reason it was wrong there: a single KV write finishes in
 * milliseconds against a roughly 30-second budget. The rule is "check the
 * ceiling against the measured duration", not "avoid the mechanism".
 *
 * Totals are read from KV list metadata rather than by fetching each key,
 * because every fetch is a subrequest and Workers caps those per request.
 */
import type { KVNamespaceLike } from "../env.js";
import { installationPrefix, type RepoRef, repoPrefix } from "../store/keys.js";

/** The UTC day an instant falls in, as `YYYY-MM-DD`. */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

function readsKey(ref: RepoRef, day: string): string {
  // `repoPrefix` already ends in a separator.
  return `reads/${repoPrefix(ref)}${day}`;
}

/** 400 days, matching the run records these are compared against. */
const TTL_SECONDS = 400 * 24 * 60 * 60;

/** As in `MetricsStore`: each page is a subrequest, so the sweep is bounded. */
const MAX_PAGES = 50;

export class ReadCounter {
  constructor(private readonly kv: KVNamespaceLike) {}

  /**
   * Add one to today's bucket for this repo, as far as KV will let it.
   *
   * See the note at the top of this file: the read is cache-served, so this
   * undercounts, sometimes by orders of magnitude. The count is duplicated
   * into list metadata so a total can be summed without fetching every key.
   */
  async increment(ref: RepoRef, at: Date): Promise<void> {
    const key = readsKey(ref, utcDay(at));
    const raw = await this.kv.get(key);
    const current = raw === null ? 0 : Number.parseInt(raw, 10);
    const next = Number.isFinite(current) && current > 0 ? current + 1 : 1;
    await this.kv.put(key, next.toString(), {
      expirationTtl: TTL_SECONDS,
      metadata: { n: next },
    });
  }

  /** Total reads recorded for a repo across every day still retained. */
  async forRepo(ref: RepoRef): Promise<number> {
    return await this.total(`reads/${repoPrefix(ref)}`);
  }

  /** Total reads across a whole installation, or the whole deployment. */
  async totalReads(installationId?: number | string): Promise<number> {
    return await this.total(
      installationId === undefined ? "reads/" : `reads/${installationPrefix(installationId)}`,
    );
  }

  private async total(prefix: string): Promise<number> {
    let sum = 0;
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const listed = await this.kv.list({ prefix, limit: 1000, cursor });
      for (const key of listed.keys) {
        // From metadata, not from a `get`: one subrequest per key would put a
        // ceiling on this report at roughly a thousand buckets, which a
        // handful of repos reach inside a year of the 400-day retention.
        const meta = key.metadata;
        const value =
          typeof meta === "object" && meta !== null ? (meta as { n?: unknown }).n : undefined;
        if (typeof value === "number" && Number.isFinite(value)) sum += value;
      }
      if (listed.list_complete || listed.cursor === undefined) break;
      cursor = listed.cursor;
    }
    return sum;
  }

  /** Delete one repo's buckets, for a repo leaving an installation. */
  async deleteRepo(ref: RepoRef): Promise<number> {
    return await this.purgePrefix(`reads/${repoPrefix(ref)}`);
  }

  /** Delete every read bucket an installation left behind. */
  async purgeInstallation(installationId: number | string): Promise<number> {
    return await this.purgePrefix(`reads/${installationPrefix(installationId)}`);
  }

  /** Restart-scan delete, for the reason given in `MetricsStore.purgePrefix`. */
  private async purgePrefix(prefix: string): Promise<number> {
    const seen = new Set<string>();
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const listed = await this.kv.list({ prefix, limit: 1000 });
      const fresh = listed.keys.filter((key) => !seen.has(key.name));
      if (fresh.length === 0) return seen.size;
      for (const key of fresh) {
        await this.kv.delete(key.name);
        seen.add(key.name);
      }
    }
    throw new Error(`read-counter purge did not converge for prefix ${prefix}`);
  }
}
