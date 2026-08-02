/**
 * The key layout for karasu-nest's generated-`.krs` cache.
 *
 * This module is small but it is the **purge contract**. ADR-1990 decision 6
 * makes "uninstall = purge" a condition for the service being allowed to read
 * other people's private code at all, and the only way to delete everything an
 * installation ever produced without scanning unrelated keys is for the
 * installation id to be the outermost component. Changing that shape later is
 * not a refactor: it strands whatever is already stored beyond the reach of
 * the delete path.
 *
 *     krs/v1/<installation>/<owner>/<repo>/<sha>
 *
 * `v1` is there so a future layout change can be introduced next to the old
 * one and purged by prefix rather than migrated.
 */

const KEY_PREFIX = "krs/v1";

export interface RepoRef {
  /** GitHub App installation id. The unit purge is scoped to. */
  installationId: number | string;
  owner: string;
  repo: string;
}

export interface CachedRef extends RepoRef {
  /** The full commit SHA the `.krs` was generated from. */
  sha: string;
}

/** Thrown when a ref cannot be turned into a key that round-trips. */
export class InvalidRefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRefError";
  }
}

/**
 * GitHub owner and repository names are case-insensitive, so the key is
 * lower-cased. Without this, `Kompiro/Karasu` and `kompiro/karasu` would be
 * two entries and a repo-scoped purge would delete only the casing it was
 * handed — a purge that silently leaves data behind is worse than one that
 * fails loudly.
 */
export function normaliseName(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new InvalidRefError(`${field} must not be empty`);
  // `/` would forge a key boundary and let one repo's entry land inside
  // another's prefix; the rest are simply not valid GitHub names.
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    throw new InvalidRefError(`${field} contains characters that are not valid in a GitHub name`);
  }
  return trimmed.toLowerCase();
}

/**
 * The installation id is the purge scope, so two spellings of the same id
 * must not produce two prefixes. `installationId` is typed `number | string`
 * because a webhook payload and a route parameter both hand it over as text,
 * and `"042"` from one path would otherwise be a different scope from `42`
 * from another — leaving half an installation's entries beyond the reach of
 * `purgeInstallation`. Leading zeros are stripped for that reason, not for
 * tidiness.
 */
function normaliseInstallation(installationId: number | string): string {
  const value = String(installationId).trim();
  if (!/^[0-9]+$/.test(value)) {
    throw new InvalidRefError("installationId must be a positive integer");
  }
  const canonical = value.replace(/^0+(?=[0-9])/, "");
  if (canonical === "0") throw new InvalidRefError("installationId must be a positive integer");
  return canonical;
}

/**
 * The prefix covering every entry an installation has ever produced.
 * `purgeInstallation` lists on this and nothing else.
 */
export function installationPrefix(installationId: number | string): string {
  return `${KEY_PREFIX}/${normaliseInstallation(installationId)}/`;
}

/** The prefix covering every SHA cached for one repo under one installation. */
export function repoPrefix(ref: RepoRef): string {
  return `${installationPrefix(ref.installationId)}${normaliseName(ref.owner, "owner")}/${normaliseName(
    ref.repo,
    "repo",
  )}/`;
}

/**
 * The key for one generated `.krs`.
 *
 * The SHA is part of the key rather than of the value, so a push to the repo
 * misses instead of serving a diagram of code that is no longer there.
 */
export function cacheKey(ref: CachedRef): string {
  const sha = ref.sha.trim().toLowerCase();
  // Full 40-hex only. A short SHA or a branch name is mutable, and a mutable
  // cache key is how a stale diagram outlives the commit it described.
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new InvalidRefError("sha must be a full 40-character commit SHA");
  }
  return `${repoPrefix(ref)}${sha}`;
}
