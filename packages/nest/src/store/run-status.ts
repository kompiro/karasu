/**
 * What a caller can learn about a generation without waiting for it.
 *
 * The gate spike measured 12-19 minutes for an 85-file repository, so nothing
 * about this can sit on an HTTP response (ADR-1990). The route accepts, the
 * work runs detached, and this is how "never asked" is told apart from
 * "running", "done" and "failed" — four states that a bare 404 collapses into
 * one, leaving a caller to poll a URL that may never change.
 *
 * Records live under the installation prefix so `purgeInstallation` sweeps
 * them along with everything else (ADR-1990 decision 6). A failure message is
 * ours — a rule id, a pass name, a status code — and never anything the model
 * or the repository produced.
 */
import type { KVNamespaceLike } from "../env.js";
import { installationPrefix, type RepoRef, repoPrefix } from "./keys.js";

export type RunState = "running" | "done" | "failed";

export interface RunStatus {
  state: RunState;
  /** The commit the run is for, or was for. */
  sha: string;
  /** ISO-8601, supplied by the caller so the store stays clock-free. */
  startedAt: string;
  finishedAt?: string;
  /** Present only when `state` is `failed`. Safe to show a caller. */
  error?: string;
}

/**
 * `runs/` rather than a suffix inside the document prefix: a run record is not
 * a generated `.krs`, and `KrsCache.listRepos` derives repo names by position
 * from that prefix. Sharing it would make a status record look like a repo.
 */
function statusKey(ref: RepoRef): string {
  return `runs/${repoPrefix(ref)}`;
}

/** How long a status record outlives its run. */
const TTL_SECONDS = 24 * 60 * 60;

export class RunStatusStore {
  constructor(private readonly kv: KVNamespaceLike) {}

  async get(ref: RepoRef): Promise<RunStatus | undefined> {
    const raw = await this.kv.get(statusKey(ref));
    if (raw === null) return undefined;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) return undefined;
      const { state, sha, startedAt } = parsed as Record<string, unknown>;
      if (state !== "running" && state !== "done" && state !== "failed") return undefined;
      if (typeof sha !== "string" || typeof startedAt !== "string") return undefined;
      return parsed as RunStatus;
    } catch {
      return undefined;
    }
  }

  async put(ref: RepoRef, status: RunStatus): Promise<void> {
    await this.kv.put(statusKey(ref), JSON.stringify(status), { expirationTtl: TTL_SECONDS });
  }

  /**
   * Delete every run record an installation left behind.
   *
   * Separate from `KrsCache.purgeInstallation` because the records live under
   * their own prefix; `NestStore` calls both so no caller has to know that.
   */
  async purgeInstallation(installationId: number | string): Promise<number> {
    const prefix = `runs/${installationPrefix(installationId)}`;
    let deleted = 0;
    for (let page = 0; page < 1000; page += 1) {
      const listed = await this.kv.list({ prefix, limit: 1000 });
      if (listed.keys.length === 0) return deleted;
      for (const key of listed.keys) {
        await this.kv.delete(key.name);
        deleted += 1;
      }
    }
    throw new Error(`run-status purge did not converge for prefix ${prefix}`);
  }
}
