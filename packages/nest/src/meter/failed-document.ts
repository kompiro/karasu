/**
 * The document a failed run produced, kept long enough to look at.
 *
 * A generation that fails discards its output, so diagnosing one meant
 * reading a diagnostic's line numbers with no document to apply them to.
 * Positions without a file are not much use.
 *
 * Three properties make this safe to keep rather than a new hazard.
 *
 * It is not raw source. It is the model's output, and it has already passed
 * `assertStructureOnly` -- the same one-way door a *successful* document goes
 * through before being cached and served. Storing it is not a new category of
 * data; it is the same artifact that would have been published had it parsed.
 *
 * It is short-lived. Twenty-four hours, matching the run status it explains,
 * because a failure nobody looked at in a day is not being investigated.
 *
 * It is not public. `GET /<owner>/<repo>` serves generated models to anyone,
 * and this is deliberately not that route: a failed document is reached only
 * with the metrics bearer token. A model that failed to parse has had no
 * structural review at all, and the repository it came from may be private.
 */
import type { KVNamespaceLike } from "../env.js";
import { installationPrefix, type RepoRef, repoPrefix } from "../store/keys.js";

/** Long enough to investigate, short enough not to be a second cache. */
const TTL_SECONDS = 24 * 60 * 60;

const MAX_PAGES = 50;

function documentKey(ref: RepoRef, sha: string): string {
  // `repoPrefix` already ends in a separator.
  return `failed/${repoPrefix(ref)}${sha}`;
}

export class FailedDocumentStore {
  constructor(private readonly kv: KVNamespaceLike) {}

  async put(ref: RepoRef, sha: string, krs: string): Promise<void> {
    await this.kv.put(documentKey(ref, sha), krs, { expirationTtl: TTL_SECONDS });
  }

  async get(ref: RepoRef, sha: string): Promise<string | undefined> {
    return (await this.kv.get(documentKey(ref, sha))) ?? undefined;
  }

  /** The most recent failed document for a repo, whatever commit it was for. */
  async latest(ref: RepoRef): Promise<{ sha: string; krs: string } | undefined> {
    const listed = await this.kv.list({ prefix: `failed/${repoPrefix(ref)}`, limit: 1000 });
    const last = listed.keys.at(-1);
    if (last === undefined) return undefined;
    const krs = await this.kv.get(last.name);
    if (krs === null) return undefined;
    return { sha: last.name.slice(last.name.lastIndexOf("/") + 1), krs };
  }

  /**
   * Delete everything an installation left behind.
   *
   * This holds model output derived from a repository, so it goes with the
   * rest on uninstall (ADR-1990 decision 6, TPL-2226) rather than waiting out
   * its TTL.
   */
  async purgeInstallation(installationId: number | string): Promise<number> {
    return await this.purgePrefix(`failed/${installationPrefix(installationId)}`);
  }

  /** Delete one repo's documents, for a repo leaving an installation. */
  async deleteRepo(ref: RepoRef): Promise<number> {
    return await this.purgePrefix(`failed/${repoPrefix(ref)}`);
  }

  /** Restart-scan delete, for the reason given in `MetricsStore`. */
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
    throw new Error(`failed-document purge did not converge for prefix ${prefix}`);
  }
}
