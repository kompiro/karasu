/**
 * How many times a generated model is actually read.
 *
 * This is the other half of the #2226 question. Cost per reverse says what a
 * generation costs; reads per generation says how many readers that spend
 * bought. A SHA-keyed cache that is written once and read once is a very
 * expensive way to render one diagram, and the quota that follows from it is
 * a different quota (ADR-1990 decision 3).
 *
 * Counting reads on a read path is a genuine tension: every count is a write,
 * and KV throttles repeated writes to a single key to roughly one per second.
 * Two things resolve it. The key is bucketed **per repo per day**, so a repo
 * would need sustained traffic above one read per second to lose counts — and
 * a repo with that traffic has already answered the question this measures.
 * And the write is handed to `waitUntil` so it never delays the response.
 *
 * That last point deserves care, since `waitUntil`'s roughly-30-second budget
 * is exactly what made it wrong for a generation (see `generate/dispatch.ts`
 * and TPL-2288). It is right here for the same reason it was wrong there: a
 * single KV write finishes in milliseconds. The rule is not "never use
 * `waitUntil`" but "check the ceiling against the measured duration".
 *
 * A lost count is acceptable and the code says so. An inflated one would not
 * be: the numbers exist to argue for a quota, and a metric that reads high
 * argues for a more generous quota than the service can pay for.
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

const MAX_PAGES = 1000;

export class ReadCounter {
  constructor(private readonly kv: KVNamespaceLike) {}

  /**
   * Add one to today's bucket for this repo.
   *
   * Read-modify-write, and therefore lossy under concurrency. Deliberate: the
   * alternatives are a Durable Object per repo (an object, a migration and a
   * per-request hop, to count reads) or an unbucketed counter that KV
   * rate-limits anyway. Undercounting biases the measurement towards a
   * *smaller* quota, which is the safe direction to be wrong in.
   */
  async increment(ref: RepoRef, at: Date): Promise<void> {
    const key = readsKey(ref, utcDay(at));
    const raw = await this.kv.get(key);
    const current = raw === null ? 0 : Number.parseInt(raw, 10);
    const next = Number.isFinite(current) && current > 0 ? current + 1 : 1;
    await this.kv.put(key, next.toString(), { expirationTtl: TTL_SECONDS });
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
        const raw = await this.kv.get(key.name);
        const value = raw === null ? Number.NaN : Number.parseInt(raw, 10);
        if (Number.isFinite(value)) sum += value;
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
