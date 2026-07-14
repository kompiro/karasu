import {
  synthesizeSharePayload,
  normalizePath,
  isSafeRelativePath,
  type FileSystemProvider,
  type DirEntry,
} from "@karasu-tools/core";
import { encodeShare } from "../utils/inline-share.js";

/**
 * Repo-backed + ref-pinned permalink resolver for karasu-nest (Phase 2).
 *
 * Turns a permalink path `<owner>/<repo>[/<path>]@<ref>` into an inline share
 * payload by fetching the repo's committed `.krs` from GitHub raw at the pinned
 * ref and flattening it (imports inlined) through the existing
 * `synthesizeSharePayload`. The thin Cloudflare Pages Function
 * (`functions/r/[[path]].ts`) 302-redirects the result to the existing `/s`
 * page, so this whole surface reuses the inline-share render path — no new
 * package, DB, render layer, or anchor grammar (design:
 * docs/design/repo-backed-ref-pinned-permalink.md, Issue #1828).
 *
 * Framework-agnostic (mirrors share-render.ts / share-page.ts): the `fetch`
 * used to reach GitHub is injected, so the logic is unit-testable without the
 * Workers runtime or the network.
 *
 * Scope (v1, per the design doc's decided points):
 * - **public repos only** — the service holds no GitHub token (BYOK,
 *   ADR-20260407-04); private repos are a follow-up.
 * - **SHA-required for ADR permalinks** — a branch/tag ref also renders, but
 *   resolution is a single raw fetch; no GitHub API hop is taken (avoids the
 *   unauthenticated 60 req/h/IP rate limit).
 * - **whole-model open** — the deep `#krs-<view>-<id>` anchor and the
 *   SHA-keyed cache are separate follow-up slices (c). This slice opens the
 *   whole model.
 * - **directory / wildcard imports are not resolved** — GitHub has no cheap
 *   directory listing without an API hop, so `readDir` is unsupported here;
 *   explicit-file imports (`import "..."`, `@import`, named imports) work.
 *
 * Security (TPL-20260510-17): the untrusted `<owner>/<repo>/<path>@<ref>`
 * segments cross a trust boundary into a fetch URL. Each segment is
 * charset-validated and `..`/traversal is rejected before the raw URL is built,
 * and the host is hard-pinned to `raw.githubusercontent.com` (SSRF is
 * structurally impossible — the host is never taken from input).
 */

const PLAIN = "text/plain; charset=utf-8";

/** GitHub raw host — hard-pinned; never derived from input (SSRF guard). */
const RAW_HOST = "https://raw.githubusercontent.com";

/**
 * Default entry file names tried in order when the permalink omits a path.
 * `index.krs` first (the only name the app opens — app convention), then
 * `karasu.krs`.
 */
const DEFAULT_ENTRIES = ["index.krs", "karasu.krs"] as const;

/** GitHub owner (user / org): alphanumeric + hyphen, no slash. */
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
/** GitHub repo name: alphanumeric, dot, underscore, hyphen. */
const REPO_RE = /^[A-Za-z0-9._-]+$/;
/**
 * ref: a full/short commit SHA, or a slash-free branch/tag name. Slash-bearing
 * refs are not supported in v1 (they collide with the path grammar and SHA is
 * the required permalink form anyway).
 */
const REF_RE = /^[A-Za-z0-9._-]+$/;

interface ParsedRepoPermalink {
  owner: string;
  repo: string;
  /** Explicit `.krs` path, or null to fall back to DEFAULT_ENTRIES. */
  filePath: string | null;
  ref: string;
}

type ParseResult = { ok: true; value: ParsedRepoPermalink } | { ok: false; message: string };

/**
 * Parse a permalink path (the part after the `/r/` route prefix), e.g.
 * `kompiro/karasu@<sha>` or `kompiro/karasu/docs/arch.krs@main`.
 *
 * The ref is split on the LAST `@` so an `@` never appears in owner/repo/path
 * (validated charsets exclude it anyway). Returns a typed error (never throws)
 * so the caller maps it to a 400.
 */
export function parseRepoPermalink(rawPath: string): ParseResult {
  const path = rawPath.replace(/^\/+/, "").replace(/\/+$/, "");
  if (path === "") return { ok: false, message: "Empty permalink." };

  const at = path.lastIndexOf("@");
  if (at === -1) {
    return { ok: false, message: "Missing '@<ref>' — a repo permalink must pin a ref." };
  }
  const left = path.slice(0, at);
  const ref = path.slice(at + 1);
  if (!REF_RE.test(ref)) {
    return {
      ok: false,
      message: `Invalid ref "${ref}". Use a commit SHA, or a slash-free branch/tag name.`,
    };
  }

  const segments = left.split("/");
  if (segments.length < 2) {
    return { ok: false, message: "Expected '<owner>/<repo>[/<path>]@<ref>'." };
  }
  const [owner, repo, ...rest] = segments;
  if (!OWNER_RE.test(owner)) return { ok: false, message: `Invalid owner "${owner}".` };
  if (!REPO_RE.test(repo)) return { ok: false, message: `Invalid repo "${repo}".` };

  let filePath: string | null = null;
  if (rest.length > 0) {
    filePath = rest.join("/");
    // Reject traversal / absolute / backslash paths before it reaches a URL.
    if (!isSafeRelativePath(filePath)) {
      return { ok: false, message: `Invalid path "${filePath}".` };
    }
    if (!filePath.endsWith(".krs")) {
      return { ok: false, message: `Path must point to a .krs file, got "${filePath}".` };
    }
  }

  return { ok: true, value: { owner, repo, filePath, ref } };
}

/** Thrown by the provider so `synthesizeSharePayload` propagates a missing file. */
class FileNotFoundError extends Error {}

/**
 * A read-only FileSystemProvider backed by GitHub raw at a fixed owner/repo/ref.
 * `readFile` maps a repo-relative path to `raw.githubusercontent.com/...` and
 * fetches it; results are memoized so an import diamond fetches each file once.
 * Write / directory operations are unsupported (repo-backed is read-only, and
 * directory listing would need a rate-limited API hop — out of v1 scope).
 */
export class GitHubRawFileSystemProvider implements FileSystemProvider {
  private readonly cache = new Map<string, Promise<string>>();

  constructor(
    private readonly owner: string,
    private readonly repo: string,
    private readonly ref: string,
    private readonly fetchImpl: typeof fetch,
  ) {}

  private rawUrl(path: string): string {
    const normalized = normalizePath(path).replace(/^\/+/, "");
    // Defense in depth: a resolved import must never escape the repo root.
    if (normalized === ".." || normalized.startsWith("../")) {
      throw new FileNotFoundError(`Path escapes repository root: ${path}`);
    }
    return `${RAW_HOST}/${this.owner}/${this.repo}/${this.ref}/${normalized}`;
  }

  async readFile(path: string): Promise<string> {
    let pending = this.cache.get(path);
    if (!pending) {
      pending = this.fetchRaw(path);
      this.cache.set(path, pending);
    }
    return pending;
  }

  private async fetchRaw(path: string): Promise<string> {
    const res = await this.fetchImpl(this.rawUrl(path));
    if (res.status === 404) {
      throw new FileNotFoundError(`Not found: ${path}`);
    }
    if (!res.ok) {
      // Non-404 upstream failure (e.g. GitHub 5xx / rate limit) — distinct from
      // a genuinely missing file so the caller can return 502, not 404.
      const err = new Error(`GitHub raw fetch failed (${res.status}) for ${path}`);
      (err as Error & { upstreamStatus?: number }).upstreamStatus = res.status;
      throw err;
    }
    return res.text();
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.readFile(path);
      return true;
    } catch (err) {
      if (err instanceof FileNotFoundError) return false;
      throw err;
    }
  }

  // --- unsupported (read-only, no directory listing in v1) ------------------
  async writeFile(): Promise<void> {
    throw new Error("GitHubRawFileSystemProvider is read-only.");
  }
  async delete(): Promise<void> {
    throw new Error("GitHubRawFileSystemProvider is read-only.");
  }
  async mkdir(): Promise<void> {
    throw new Error("GitHubRawFileSystemProvider is read-only.");
  }
  async readDir(): Promise<DirEntry[]> {
    throw new Error(
      "Directory / wildcard imports are not supported for repo-backed permalinks (v1).",
    );
  }
}

interface ResolveResult {
  status: number;
  /** Present on 200: the `encodeShare` payload for `/s?s=<payload>`. */
  encodedPayload?: string;
  /** Present on non-200: a plain-text reason. */
  message?: string;
  contentType: string;
}

/**
 * Resolve a repo permalink path to an inline share payload.
 *
 * @param rawPath the path after the `/r/` prefix (`<owner>/<repo>[/<path>]@<ref>`)
 * @param fetchImpl injected fetch (the Workers runtime passes global `fetch`)
 *
 * Status: 200 (payload), 400 (bad permalink), 404 (no `.krs` at the ref),
 * 502 (upstream GitHub failure), 500 (unexpected).
 */
export async function resolveRepoPermalink(
  rawPath: string,
  fetchImpl: typeof fetch,
): Promise<ResolveResult> {
  const parsed = parseRepoPermalink(rawPath);
  if (!parsed.ok) {
    return { status: 400, message: parsed.message, contentType: PLAIN };
  }
  const { owner, repo, filePath, ref } = parsed.value;
  const fs = new GitHubRawFileSystemProvider(owner, repo, ref, fetchImpl);

  try {
    const entry = await resolveEntry(fs, filePath);
    if (entry === null) {
      const tried = filePath ?? DEFAULT_ENTRIES.join(" / ");
      return {
        status: 404,
        message: `No .krs found at ${owner}/${repo}@${ref} (looked for ${tried}).`,
        contentType: PLAIN,
      };
    }
    const payload = await synthesizeSharePayload(entry, fs);
    return { status: 200, encodedPayload: encodeShare(payload), contentType: PLAIN };
  } catch (err) {
    const upstream = (err as { upstreamStatus?: number }).upstreamStatus;
    if (typeof upstream === "number") {
      return {
        status: 502,
        message: `Upstream GitHub error (${upstream}).`,
        contentType: PLAIN,
      };
    }
    return {
      status: 500,
      message: `Failed to resolve ${owner}/${repo}@${ref}: ${(err as Error).message}`,
      contentType: PLAIN,
    };
  }
}

/**
 * Pick the entry file: the explicit path if given, else the first existing
 * DEFAULT_ENTRIES name. Returns null when nothing resolves. A FileNotFound on
 * an explicit path returns null (→ 404); other errors propagate (→ 502/500).
 */
async function resolveEntry(
  fs: GitHubRawFileSystemProvider,
  filePath: string | null,
): Promise<string | null> {
  if (filePath !== null) {
    return (await fs.exists(filePath)) ? filePath : null;
  }
  for (const candidate of DEFAULT_ENTRIES) {
    if (await fs.exists(candidate)) return candidate;
  }
  return null;
}
