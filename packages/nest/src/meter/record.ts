/**
 * What one generation cost, kept long enough to answer #2226.
 *
 * The question the numbers have to settle is not "how much did that repo
 * cost" but "can a solo maintainer pay for this at all, and at what quota"
 * (ADR-1990 decision 3). So a record is per-attempt, and carries the things a
 * quota argument needs: tokens by pass, wall-clock, how many files went in,
 * and how much redaction changed the input.
 *
 * **Per attempt, not per commit.** A failed run costs real money — the passes
 * it completed before it threw were paid for — and a Workflow retries. Keying
 * on the commit alone would let a successful third attempt overwrite the two
 * that were also billed, so the report would understate spend by exactly the
 * amount the retries cost. The finish timestamp is part of the key.
 *
 * What a record deliberately does not carry: file paths, file contents,
 * redaction values, `.krs` text, or anything the model said. A metrics store
 * is the classic place for private data to leak out of a system sideways — it
 * outlives the run, it is read by different code, and nobody thinks of it as
 * holding repository content (ADR-1990 decision 6). Owner and repo names are
 * in the *key*, not the body, so an aggregate report can be produced without
 * reading any identity at all.
 *
 * **Aggregation reads list metadata, not values.** Every `kv.get` is a
 * subrequest, and Workers caps those per request; a report that fetched one
 * value per key would stop working somewhere past a thousand stored runs,
 * which is precisely when it starts being worth reading. The numbers a report
 * needs are duplicated into KV list metadata, which `list` returns for free.
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
  /** ISO-8601, supplied by the caller so the store stays clock-free. */
  finishedAt: string;
  /** Whether the run produced a model. Failed attempts cost money too. */
  outcome: "done" | "failed";
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
  /**
   * Why a failed run failed, structurally.
   *
   * Present only for a parse failure. The code and block kind name the
   * construct the model invented; the position locates it. **No token values**
   * -- those would be the generated text, and the rule that this body carries
   * no repository content does not bend for debugging convenience.
   *
   * Kept here rather than only in a log because a log exists while something
   * is watching, and a run that costs minutes and money should not have to be
   * repeated to be understood.
   */
  diagnostics?: { code: string; blockKind?: string; at?: string }[];
}

/**
 * The summary duplicated into KV list metadata.
 *
 * Short field names because metadata is capped at 1024 bytes per key and a
 * long name buys nothing: this is never read by a human, only by `summarise`.
 */
interface RunMetadata {
  m: string;
  i: number;
  o: number;
  d: number;
  f: number;
  b: number;
  r: number;
  /** 1 when the attempt failed. Absent means it succeeded. */
  x?: 1;
}

function toMetadata(metrics: RunMetrics): RunMetadata {
  return {
    m: metrics.model,
    i: metrics.inputTokens,
    o: metrics.outputTokens,
    d: metrics.durationMs,
    f: metrics.files,
    b: metrics.bytesRead,
    r: metrics.redactions,
    ...(metrics.outcome === "failed" ? { x: 1 as const } : {}),
  };
}

function isRunMetadata(value: unknown): value is RunMetadata {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.m === "string" &&
    typeof record.i === "number" &&
    typeof record.o === "number" &&
    typeof record.d === "number"
  );
}

/**
 * `metrics/` rather than a suffix inside the document prefix, for the same
 * reason `runs/` is: `KrsCache.listRepos` derives repo names by position from
 * that prefix, and a metrics record sharing it would look like a repo.
 *
 * `repoPrefix` already ends in a separator, so none is added before the sha.
 * The timestamp is a further segment, which makes `.../<sha>/` a prefix that
 * covers every attempt at one commit.
 */
function metricsKey(ref: RepoRef, sha: string, finishedAt: string): string {
  return `metrics/${repoPrefix(ref)}${sha}/${finishedAt}`;
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

/**
 * How many `list` pages one sweep will walk.
 *
 * Each page is a subrequest, and Workers caps those per request. 50 pages of
 * 1000 keys is 50,000 records, far past any plausible volume for this service
 * and still two orders of magnitude below the cap. A sweep that hits the
 * ceiling says so rather than silently reporting a partial total.
 */
const MAX_PAGES = 50;

export interface Aggregate {
  runs: number;
  /** Attempts that failed. Included in `runs`, because they were billed. */
  failedRuns: number;
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
  /** Records that carried no usable summary and are absent from the totals. */
  skipped: number;
  /** True when the sweep stopped at `MAX_PAGES` and the totals are partial. */
  truncated: boolean;
}

function emptyAggregate(): Aggregate {
  return {
    runs: 0,
    failedRuns: 0,
    inputTokens: 0,
    outputTokens: 0,
    durationMs: 0,
    files: 0,
    bytesRead: 0,
    redactions: 0,
    // `Object.create(null)`, not `{}`: the model name comes from the provider,
    // and a value of `__proto__` on an object literal writes to the prototype
    // instead of the map — the entry then vanishes from the report rather than
    // showing up as unpriced.
    byModel: Object.create(null) as Aggregate["byModel"],
    durationP50Ms: 0,
    durationP95Ms: 0,
    skipped: 0,
    truncated: false,
  };
}

/** Nearest-rank percentile. Exact for the small counts this ever sees. */
function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil(fraction * sorted.length);
  return sorted[Math.min(rank, sorted.length) - 1] ?? 0;
}

function isRunMetrics(value: unknown): value is RunMetrics {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const numbers = ["inputTokens", "outputTokens", "durationMs", "files", "bytesRead", "redactions"];
  return (
    typeof record.sha === "string" &&
    typeof record.model === "string" &&
    numbers.every((name) => typeof record[name] === "number")
  );
}

export class MetricsStore {
  constructor(private readonly kv: KVNamespaceLike) {}

  async record(ref: RepoRef, metrics: RunMetrics): Promise<void> {
    await this.kv.put(metricsKey(ref, metrics.sha, metrics.finishedAt), JSON.stringify(metrics), {
      expirationTtl: TTL_SECONDS,
      metadata: toMetadata(metrics),
    });
  }

  /**
   * The most recent attempt at one commit.
   *
   * ISO-8601 sorts lexicographically, so the last key under the commit prefix
   * is the latest attempt.
   */
  async latestFor(ref: RepoRef, sha: string): Promise<RunMetrics | undefined> {
    const listed = await this.kv.list({ prefix: `metrics/${repoPrefix(ref)}${sha}/`, limit: 1000 });
    const last = listed.keys.at(-1);
    if (last === undefined) return undefined;
    const raw = await this.kv.get(last.name);
    if (raw === null) return undefined;
    try {
      const parsed: unknown = JSON.parse(raw);
      return isRunMetrics(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  /** Every attempt at one commit, oldest first. */
  async attemptsFor(ref: RepoRef, sha: string): Promise<number> {
    const listed = await this.kv.list({ prefix: `metrics/${repoPrefix(ref)}${sha}/`, limit: 1000 });
    return listed.keys.length;
  }

  /**
   * Roll every record under a prefix into one answer.
   *
   * Pass no installation to aggregate the whole deployment, which is the
   * figure #2226 actually asks for — per-installation totals answer "who is
   * expensive", not "is this affordable".
   *
   * Reads only list metadata: see the note at the top of this file. A record
   * whose metadata is missing or malformed is counted in `skipped` rather than
   * failing the report, because a reader that refuses to produce a number
   * because one key is corrupt is a reader nobody uses.
   */
  async summarise(installationId?: number | string): Promise<Aggregate> {
    const prefix =
      installationId === undefined ? "metrics/" : `metrics/${installationPrefix(installationId)}`;
    const total = emptyAggregate();
    const durations: number[] = [];
    let cursor: string | undefined;

    for (let page = 0; ; page += 1) {
      if (page >= MAX_PAGES) {
        total.truncated = true;
        break;
      }
      const listed = await this.kv.list({ prefix, limit: 1000, cursor });
      for (const key of listed.keys) {
        if (!isRunMetadata(key.metadata)) {
          total.skipped += 1;
          continue;
        }
        const summary = key.metadata;
        total.runs += 1;
        if (summary.x === 1) total.failedRuns += 1;
        total.inputTokens += summary.i;
        total.outputTokens += summary.o;
        total.durationMs += summary.d;
        total.files += summary.f;
        total.bytesRead += summary.b;
        total.redactions += summary.r;
        durations.push(summary.d);
        const model = (total.byModel[summary.m] ??= {
          runs: 0,
          inputTokens: 0,
          outputTokens: 0,
        });
        model.runs += 1;
        model.inputTokens += summary.i;
        model.outputTokens += summary.o;
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
