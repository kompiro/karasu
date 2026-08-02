/**
 * `owner/repo` → the installation and SHA whose generated `.krs` is current.
 *
 * The cache is keyed by installation because that is what purge has to be
 * scoped to. A reader arriving at `/<owner>/<repo>` has neither the
 * installation nor the SHA, so something has to bridge the two, and it cannot
 * be a GitHub API call on the read path.
 *
 *     idx/v1/<owner>/<repo> -> { installationId, sha, generatedAt }
 *
 * This index lives **outside** the installation prefix, so it does not vanish
 * when `KrsCache.purgeInstallation` sweeps that prefix. Keeping it in sync is
 * therefore `NestStore`'s job, not something a caller may be trusted to
 * remember: a directory entry surviving a purge would point at a deleted
 * document, which is a dangling pointer rather than a leak, but a directory
 * entry surviving an *uninstall* would still say "this repo has a diagram"
 * about someone who revoked access.
 */
import type { KVNamespaceLike } from "../env.js";
import { InvalidRefError, normaliseName } from "./keys.js";

const INDEX_PREFIX = "idx/v1";

export interface DirectoryEntry {
  installationId: string;
  sha: string;
  generatedAt: string;
}

function indexKey(owner: string, repo: string): string {
  return `${INDEX_PREFIX}/${normaliseName(owner, "owner")}/${normaliseName(repo, "repo")}`;
}

export class RepoDirectory {
  constructor(private readonly kv: KVNamespaceLike) {}

  async get(owner: string, repo: string): Promise<DirectoryEntry | undefined> {
    let key: string;
    try {
      key = indexKey(owner, repo);
    } catch (cause) {
      // An unroutable name cannot have an entry. Surfacing it as a lookup
      // failure rather than a thrown error keeps the route's 400-vs-404
      // decision in the route, where the caller-facing wording lives.
      if (cause instanceof InvalidRefError) return undefined;
      throw cause;
    }
    const raw = await this.kv.get(key);
    if (raw === null) return undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return undefined;
    }
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const { installationId, sha, generatedAt } = parsed as Record<string, unknown>;
    if (
      typeof installationId !== "string" ||
      typeof sha !== "string" ||
      typeof generatedAt !== "string"
    ) {
      return undefined;
    }
    return { installationId, sha, generatedAt };
  }

  /**
   * `ttlSeconds` is not optional by accident.
   *
   * The document it points at expires on a TTL. If the pointer did not, a
   * document that aged out before its installation was uninstalled would
   * leave a pointer that `purgeInstallation` never sees — the repo list a
   * purge works from is derived from live documents — and that pointer would
   * go on naming a revoked installation forever. Giving the pointer the same
   * lifetime as the document closes that hole by construction rather than by
   * a sweeper nobody would run.
   */
  async publish(
    owner: string,
    repo: string,
    entry: DirectoryEntry,
    ttlSeconds: number,
  ): Promise<void> {
    await this.kv.put(indexKey(owner, repo), JSON.stringify(entry), {
      expirationTtl: ttlSeconds,
    });
  }

  /**
   * Remove the entry, but only if it still names `installationId`.
   *
   * The guard matters when a repo moves between installations: an uninstall
   * webhook for the old installation must not delete the pointer the new one
   * just published. Returns whether anything was removed.
   */
  async unpublishOwnedBy(owner: string, repo: string, installationId: string): Promise<boolean> {
    const current = await this.get(owner, repo);
    if (current === undefined || current.installationId !== installationId) return false;
    await this.kv.delete(indexKey(owner, repo));
    return true;
  }
}
