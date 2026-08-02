/**
 * The store as one object, because the two halves must not be updated apart.
 *
 * `KrsCache` holds documents inside an installation prefix; `RepoDirectory`
 * holds the `owner/repo → installation + sha` pointer outside it, so a reader
 * who has only a repo name can find the current document. Nothing enforces
 * their consistency but the code that writes them, and a caller who remembers
 * one and forgets the other produces either a diagram nobody can reach or a
 * pointer that outlives an uninstall. So callers get this facade and not the
 * halves.
 *
 * Purge order is deliberate: **the pointer goes first.** If the process dies
 * between the two steps, a repo with no pointer is invisible (correct, if
 * wasteful), whereas a pointer with no document is a 404 that claims a diagram
 * exists. Failing towards invisibility is the right direction for a service
 * whose purge is a data-trust promise (ADR-1990 decision 6).
 */
import type { KVNamespaceLike } from "../env.js";
import type { CachedRef, RepoRef } from "./keys.js";
import { installationPrefix } from "./keys.js";
import { KrsCache, type KrsCacheEntry } from "./krs-cache.js";
import { RepoDirectory } from "./repo-directory.js";

export interface PublishedKrs extends KrsCacheEntry {
  installationId: string;
  sha: string;
}

export interface PurgeResult {
  /** Cached documents deleted. */
  documents: number;
  /** Directory pointers removed. */
  pointers: number;
}

/** The installation id as the directory records it, canonical and comparable. */
function canonicalInstallationId(installationId: number | string): string {
  const prefix = installationPrefix(installationId);
  return prefix.split("/")[2] as string;
}

export class NestStore {
  private readonly cache: KrsCache;
  private readonly directory: RepoDirectory;

  constructor(kv: KVNamespaceLike, cache = new KrsCache(kv), directory = new RepoDirectory(kv)) {
    this.cache = cache;
    this.directory = directory;
  }

  /** The current generated `.krs` for a repo, or `undefined` if there is none. */
  async latest(owner: string, repo: string): Promise<PublishedKrs | undefined> {
    const pointer = await this.directory.get(owner, repo);
    if (pointer === undefined) return undefined;
    const entry = await this.cache.get({
      installationId: pointer.installationId,
      owner,
      repo,
      sha: pointer.sha,
    });
    // A pointer with no document reads as "nothing generated" rather than as
    // an error: it is the state a half-finished purge leaves behind, and the
    // honest answer to a reader is the same either way.
    if (entry === undefined) return undefined;
    return { ...entry, installationId: pointer.installationId, sha: pointer.sha };
  }

  /** Store a generated `.krs` and make it the one `/<owner>/<repo>` serves. */
  async publish(ref: CachedRef, entry: KrsCacheEntry): Promise<void> {
    // Document first: a pointer is only ever published once the thing it
    // points at exists.
    await this.cache.put(ref, entry);
    await this.directory.publish(ref.owner, ref.repo, {
      installationId: canonicalInstallationId(ref.installationId),
      sha: ref.sha.trim().toLowerCase(),
      generatedAt: entry.generatedAt,
    });
  }

  /**
   * Delete everything an installation produced, pointers included.
   *
   * The repo list is read before anything is deleted, because it is derived
   * from the very keys the purge removes.
   */
  async purgeInstallation(installationId: number | string): Promise<PurgeResult> {
    const canonical = canonicalInstallationId(installationId);
    const repos = await this.cache.listRepos(canonical);
    let pointers = 0;
    for (const { owner, repo } of repos) {
      if (await this.directory.unpublishOwnedBy(owner, repo, canonical)) pointers += 1;
    }
    const documents = await this.cache.purgeInstallation(canonical);
    return { documents, pointers };
  }

  /** Delete one repo's documents and its pointer. */
  async purgeRepo(ref: RepoRef): Promise<PurgeResult> {
    const canonical = canonicalInstallationId(ref.installationId);
    const removed = await this.directory.unpublishOwnedBy(ref.owner, ref.repo, canonical);
    const documents = await this.cache.purgeRepo({ ...ref, installationId: canonical });
    return { documents, pointers: removed ? 1 : 0 };
  }
}
