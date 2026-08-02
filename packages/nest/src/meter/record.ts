/**
 * What one generation cost, kept long enough to answer #2226.
 *
 * The question the numbers have to settle is not "how much did that repo
 * cost" but "can a solo maintainer pay for this at all, and at what quota"
 * (ADR-1990 decision 3). So a record is per-run, keyed by the commit, and
 * carries the things a quota argument needs: tokens by pass, wall-clock, how
 * many files went in, and how much redaction changed the input.
 *
 * What it deliberately does not carry: file paths, file contents, redaction
 * values, `.krs` text, or anything the model said. A metrics store is the
 * classic place for private data to leak out of a system sideways — it
 * outlives the run, it is read by different code, and nobody thinks of it as
 * holding repository content (ADR-1990 decision 6). Owner and repo names are
 * in the *key*, not the body, so an aggregate report can be produced without
 * reading any identity at all.
 */
import type { KVNamespaceLike } from "../env.js";
import { installationPrefix, type RepoRef, repoPrefix } from "./../store/keys.js";

export interface PassMetrics {
  name: string;
  inputTokens: number;
  outputTokens: number;
}

export interface RunMetrics {
  /** The commit this run reversed. */
  sha: string;
  /** ISO-8601, so a report can bucket by month without a second store. */
  finishedAt: string;
  /** Which model produced it. A cost report is meaningless without this. */
  model: string;
  /** Wall-clock for the whole run, milliseconds. */
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  passes: PassMetrics[];
  /** Files whose contents reached the model. */
  files: number;
  /** Bytes of source read, before redaction. */
  bytesRead: number;
  /** How many redactions fired. Counts only, never values. */
  redactions: number;
  /** Files a blob read failed on and that were skipped. */
  unreadableFiles: number;
}

/**
 * `metrics/` rather than a suffix inside the document prefix, for the same
 * reason `runs/` is: `KrsCache.listRepos` derives repo names by position from
 * that prefix, and a metrics record sharing it would look like a repo.
 */
function metricsKey(ref: RepoRef, sha: string): string {
  // `repoPrefix` already ends in a separator; adding another would key every
  // record under an empty path segment.
  return `metrics/${repoPrefix(ref)}${sha}`;
}

/**
 * 400 days.
 *
 * Long enough to compare a month against the same month a year earlier, which
 * is the shortest window in which "is this affordable" has a seasonal answer.
 * Still bounded, because an unbounded metrics store is a data-retention
 * promise nobody made.
 */
const TTL_SECONDS = 400 * 24 * 60 * 60;

/** How many keys one aggregation pass will read before it gives up. */
const MAX_PAGES = 1000;

export interface Aggregate {
  runs: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  files: number;
  bytesRead: number;
  redactions: number;
  /** Per-model totals, because a cost figure cannot be summed across models. */
  byModel: Record<string, { runs: number; inputTokens: number; outputTokens: number }>;
  /** Wall-clock percentiles, milliseconds. Averages hide the tail that hurts. */
  durationP50Ms: number;
  durationP95Ms: number;
}

const EMPTY: Aggregate = {
  runs: 0,
  inputTokens: 0,
  outputTokens: 0,
  durationMs: 0,
  files: 0,
  bytesRead: 0,
  redactions: 0,
  byModel: {},
  durationP50Ms: 0,
  durationP95Ms: 0,
};

/** Nearest-rank percentile. Exact for the small counts this ever sees. */
function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil(fraction * sorted.length);
  return sorted[Math.min(rank, sorted.length) - 1] ?? 0;
}

function isRunMetrics(value: unknown): value is RunMetrics {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.sha === "string" &&
    typeof record.model === "string" &&
    typeof record.inputTokens === "number" &&
    typeof record.outputTokens === "number" &&
    typeof record.durationMs === "number"
  );
}

export class MetricsStore {
  constructor(private readonly kv: KVNamespaceLike) {}

  async record(ref: RepoRef, metrics: RunMetrics): Promise<void> {
    await this.kv.put(metricsKey(ref, metrics.sha), JSON.stringify(metrics), {
      expirationTtl: TTL_SECONDS,
    });
  }

  async get(ref: RepoRef, sha: string): Promise<RunMetrics | undefined> {
    const raw = await this.kv.get(metricsKey(ref, sha));
    if (raw === null) return undefined;
    try {
      const parsed: unknown = JSON.parse(raw);
      return isRunMetrics(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Roll every record under a prefix into one answer.
   *
   * Pass no installation to aggregate the whole deployment, which is the
   * figure #2226 actually asks for — per-installation totals answer "who is
   * expensive", not "is this affordable".
   *
   * Unparseable records are skipped rather than failing the report: a metrics
   * reader that refuses to produce a number because one key is corrupt is a
   * reader nobody uses.
   */
  async summarise(installationId?: number | string): Promise<Aggregate> {
    const prefix =
      installationId === undefined ? "metrics/" : `metrics/${installationPrefix(installationId)}`;
    const total: Aggregate = { ...EMPTY, byModel: {} };
    const durations: number[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const listed = await this.kv.list({ prefix, limit: 1000, cursor });
      for (const key of listed.keys) {
        const raw = await this.kv.get(key.name);
        if (raw === null) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          continue;
        }
        if (!isRunMetrics(parsed)) continue;
        total.runs += 1;
        total.inputTokens += parsed.inputTokens;
        total.outputTokens += parsed.outputTokens;
        total.durationMs += parsed.durationMs;
        total.files += parsed.files ?? 0;
        total.bytesRead += parsed.bytesRead ?? 0;
        total.redactions += parsed.redactions ?? 0;
        durations.push(parsed.durationMs);
        const model = (total.byModel[parsed.model] ??= {
          runs: 0,
          inputTokens: 0,
          outputTokens: 0,
        });
        model.runs += 1;
        model.inputTokens += parsed.inputTokens;
        model.outputTokens += parsed.outputTokens;
      }
      if (listed.list_complete || listed.cursor === undefined) break;
      cursor = listed.cursor;
    }

    durations.sort((a, b) => a - b);
    total.durationP50Ms = percentile(durations, 0.5);
    total.durationP95Ms = percentile(durations, 0.95);
    return total;
  }

  /** Delete one repo's records. Bounded by the same page cap as the sweep. */
  async deleteRepo(ref: RepoRef): Promise<number> {
    return await this.purgePrefix(`metrics/${repoPrefix(ref)}`);
  }

  /**
   * Delete every metrics record an installation left behind.
   *
   * Metrics go with the rest of it. ADR-1990 decision 6 says uninstall means
   * the data is gone, and "we kept the token counts" is not an exception
   * anyone agreed to — even though the body holds no repository content, the
   * key holds the owner and repo names.
   */
  async purgeInstallation(installationId: number | string): Promise<number> {
    return await this.purgePrefix(`metrics/${installationPrefix(installationId)}`);
  }

  /**
   * Restart-scan delete.
   *
   * Re-listing from the start of the prefix each round rather than paging with
   * a cursor: the cursor would advance past keys that a concurrent write
   * landed behind it, and this is the delete path, where a missed key is a
   * broken promise rather than a stale read.
   */
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
    throw new Error(`metrics purge did not converge for prefix ${prefix}`);
  }
}
