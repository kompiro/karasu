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
import { ReadCounter } from "../meter/reads.js";
import { FailedDocumentStore } from "../meter/failed-document.js";
import { MetricsStore } from "../meter/record.js";
import type { CachedRef, RepoRef } from "./keys.js";
import { installationPrefix } from "./keys.js";
import { KrsCache, type KrsCacheEntry } from "./krs-cache.js";
import { RepoDirectory } from "./repo-directory.js";
import { RunStatusStore } from "./run-status.js";

export interface PublishedKrs extends KrsCacheEntry {
  installationId: string;
  sha: string;
}

export interface PurgeResult {
  /** Cached documents deleted. */
  documents: number;
  /** Directory pointers removed. */
  pointers: number;
  /** Run-status records deleted. */
  runs: number;
  /** Cost records deleted. */
  metrics: number;
  /** Read-count buckets deleted. */
  reads: number;
  /** Documents kept from failed runs. */
  failed: number;
}

/** The installation id as the directory records it, canonical and comparable. */
function canonicalInstallationId(installationId: number | string): string {
  const prefix = installationPrefix(installationId);
  return prefix.split("/")[2] as string;
}

export class NestStore {
  private readonly cache: KrsCache;
  private readonly directory: RepoDirectory;

  private readonly runs: RunStatusStore;
  private readonly metrics: MetricsStore;
  private readonly reads: ReadCounter;
  private readonly failed: FailedDocumentStore;

  constructor(kv: KVNamespaceLike, cache = new KrsCache(kv), directory = new RepoDirectory(kv)) {
    this.cache = cache;
    this.directory = directory;
    // Run records, cost records and read buckets each live under their own
    // prefix, so the document purge does not reach them. Owning all of it here
    // means no caller has to know that — and a caller who did not know would
    // leave a key naming an uninstalled repo behind (ADR-1990 decision 6).
    // Every prefix this package writes must appear in both purge methods
    // below; `nest-purge-coverage.test.ts` fails the build if one does not.
    this.runs = new RunStatusStore(kv);
    this.metrics = new MetricsStore(kv);
    this.reads = new ReadCounter(kv);
    this.failed = new FailedDocumentStore(kv);
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
    // an error. Publish writes the document first and purge removes the
    // pointer first, so neither ordering produces this state deliberately —
    // it is what a lost write or an eventually-consistent read looks like,
    // and the honest answer to a reader is the same as for a repo that was
    // never generated.
    if (entry === undefined) return undefined;
    return { ...entry, installationId: pointer.installationId, sha: pointer.sha };
  }

  /** Store a generated `.krs` and make it the one `/<owner>/<repo>` serves. */
  async publish(ref: CachedRef, entry: KrsCacheEntry): Promise<void> {
    // Document first: a pointer is only ever published once the thing it
    // points at exists.
    await this.cache.put(ref, entry);
    // Same lifetime as the document. A pointer that outlived its document
    // would survive `purgeInstallation` too, because the repo list a purge
    // works from is derived from live documents — so it would go on naming a
    // revoked installation forever.
    await this.directory.publish(
      ref.owner,
      ref.repo,
      {
        installationId: canonicalInstallationId(ref.installationId),
        sha: ref.sha.trim().toLowerCase(),
        generatedAt: entry.generatedAt,
      },
      this.cache.ttlSeconds,
    );
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
    const runs = await this.runs.purgeInstallation(canonical);
    const metrics = await this.metrics.purgeInstallation(canonical);
    const reads = await this.reads.purgeInstallation(canonical);
    const failed = await this.failed.purgeInstallation(canonical);
    return { documents, pointers, runs, metrics, reads, failed };
  }

  /** Delete one repo's documents and its pointer. */
  async purgeRepo(ref: RepoRef): Promise<PurgeResult> {
    const canonical = canonicalInstallationId(ref.installationId);
    const removed = await this.directory.unpublishOwnedBy(ref.owner, ref.repo, canonical);
    const documents = await this.cache.purgeRepo({ ...ref, installationId: canonical });
    // A repo leaving an installation is a revocation too, so its run record
    // goes with it rather than lingering until its TTL.
    const runs = (await this.runs.deleteRepo({ ...ref, installationId: canonical })) ? 1 : 0;
    const metrics = await this.metrics.deleteRepo({ ...ref, installationId: canonical });
    const reads = await this.reads.deleteRepo({ ...ref, installationId: canonical });
    const failed = await this.failed.deleteRepo({ ...ref, installationId: canonical });
    return { documents, pointers: removed ? 1 : 0, runs, metrics, reads, failed };
  }
}
