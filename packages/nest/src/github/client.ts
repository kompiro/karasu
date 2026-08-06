/**
 * The GitHub API surface karasu-nest actually uses.
 *
 * Small on purpose. This module holds the App private key's only consumer and
 * the code path that reads other people's private repositories, so every
 * method here is one someone has to justify. Today: find the installation for
 * a repo, mint an installation token, list a tree, read a blob.
 *
 * `fetch` and `now` are injected. Not for purity — for the unit tests to be
 * able to assert the things that matter here, which are all about *when* a
 * token is reused and *whether* a failing call is retried.
 */
import { createAppJwt } from "./app-jwt.js";

const API_ROOT = "https://api.github.com";

/**
 * Identifies the caller to GitHub and pins the API version, so a future
 * default change on their side cannot alter a response shape underneath us.
 */
const BASE_HEADERS: Record<string, string> = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "karasu-nest",
};

/**
 * Everything interpolated into an API path goes through here.
 *
 * `keys.ts` already canonicalises owner and repo before they become cache
 * keys, but this module is the one that sends an authenticated request, and
 * it must not depend on every future caller having remembered. Unencoded, a
 * segment containing `../` is normalised away by the URL parser and the
 * request lands on a different endpoint **still carrying the installation
 * token**; a `#` truncates the rest of the URL, silently dropping
 * `?recursive=1` and returning a partial tree with `truncated: false`.
 */
function segment(value: string): string {
  return encodeURIComponent(value);
}

/** A commit SHA is always full 40-hex here; anything else is a caller bug. */
function shaSegment(value: string): string {
  if (!/^[0-9a-fA-F]{40}$/.test(value)) {
    throw new GitHubApiError(0, "", "a commit SHA must be 40 hexadecimal characters");
  }
  return value.toLowerCase();
}

/**
 * Base64 of UTF-8 bytes.
 *
 * `btoa` takes a binary string, so text has to be encoded first: passing a
 * `.krs` containing any non-ASCII character straight to `btoa` throws, and
 * karasu documents routinely carry Japanese labels.
 */
/**
 * Encode a repository-relative file path for a URL.
 *
 * `segment()` alone will not do: a path has `/` separators that must survive,
 * so they are preserved and each part encoded. That leaves `..`, which
 * `encodeURIComponent` passes through unchanged — and on a `PUT` helper a
 * traversal is a write to a normalised endpoint, which is exactly what
 * `segment()` exists to prevent. Rejected rather than escaped: escaping needs
 * a matching unescape somewhere, and there is nothing here to unescape it.
 */
function filePathSegments(filePath: string): string {
  const parts = filePath.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new GitHubApiError(0, filePath, "a file path may not contain . or .. segments");
  }
  return parts.map(segment).join("/");
}

function base64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

import { readGzippedArchive, type ReadArchiveOptions, type ReadArchiveResult } from "./tar.js";

export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export interface GitHubClientOptions {
  appId: string;
  privateKeyPem: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

export interface TreeEntry {
  path: string;
  /** SHA of the blob, for reading it. */
  sha: string;
  /** Bytes. GitHub omits it for submodules and symlinks. */
  size?: number;
}

export interface RepoTree {
  sha: string;
  entries: TreeEntry[];
  /**
   * GitHub caps a recursive tree listing. When this is true the listing is a
   * prefix of the repository, not the repository, and a caller that reverses
   * it is describing part of a system while implying the whole.
   */
  truncated: boolean;
}

/**
 * An installation token is renewed this many milliseconds before GitHub says
 * it expires, so a request that starts just under the wire does not finish
 * just over it.
 */
const TOKEN_RENEWAL_MARGIN_MS = 60_000;

export class GitHubClient {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly tokens = new Map<string, CachedToken>();
  /**
   * In-flight mints, so a burst of concurrent blob reads shares one token
   * request instead of each issuing its own. A Workers isolate serves requests
   * concurrently and the pipeline fetches blobs with `Promise.all`, so this
   * races for real, not hypothetically.
   */
  private readonly minting = new Map<string, Promise<string>>();

  constructor(private readonly options: GitHubClientOptions) {
    // The global `fetch` is called by name inside the wrapper, never captured
    // into a variable first. The Workers runtime throws "Illegal invocation"
    // when it is invoked through a detached reference, and capturing it into a
    // local before wrapping is exactly that — the closure has to re-resolve
    // the global binding at call time for the receiver check to pass. Node
    // tolerates the detached form, so no unit test can catch this; the same
    // guard is documented in `functions/[[path]].ts`.
    const injected = options.fetchImpl;
    this.fetchImpl =
      injected === undefined
        ? (input, init) => fetch(input, init)
        : (input, init) => injected(input, init);
    this.now = options.now ?? (() => Date.now());
  }

  /** Which installation, if any, can read this repository. */
  async installationIdFor(owner: string, repo: string): Promise<string | undefined> {
    const response = await this.callWithAppJwt(
      `/repos/${segment(owner)}/${segment(repo)}/installation`,
    );
    if (response.status === 404) return undefined;
    const body = await this.readJson(
      response,
      `/repos/${segment(owner)}/${segment(repo)}/installation`,
    );
    const id = (body as { id?: unknown }).id;
    if (typeof id !== "number" && typeof id !== "string") return undefined;
    return String(id);
  }

  /**
   * A token scoped to one installation, reused until shortly before it
   * expires.
   *
   * The cache is per isolate, which is the right scope: it is not shared
   * between installations and it evaporates when the isolate does, so a
   * revoked installation cannot keep a token alive beyond an hour.
   */
  installationToken(installationId: string): Promise<string> {
    const cached = this.tokens.get(installationId);
    if (cached && cached.expiresAtMs - TOKEN_RENEWAL_MARGIN_MS > this.now()) {
      return Promise.resolve(cached.token);
    }
    const inFlight = this.minting.get(installationId);
    if (inFlight) return inFlight;

    const mint = this.mintToken(installationId).finally(() => {
      // Cleared whether it resolved or rejected: a rejected promise left here
      // would replay one failure to every later caller.
      this.minting.delete(installationId);
    });
    this.minting.set(installationId, mint);
    return mint;
  }

  private async mintToken(installationId: string): Promise<string> {
    const path = `/app/installations/${segment(installationId)}/access_tokens`;
    const response = await this.callWithAppJwt(path, { method: "POST" });
    const body = await this.readJson(response, path);
    const { token, expires_at: expiresAt } = body as Record<string, unknown>;
    if (typeof token !== "string" || typeof expiresAt !== "string") {
      throw new GitHubApiError(response.status, path, "the access-token response was malformed");
    }
    const expiresAtMs = Date.parse(expiresAt);
    this.tokens.set(installationId, {
      token,
      // An unparseable expiry is treated as already stale rather than as
      // never-expiring: re-minting costs one request, using a dead token
      // costs a failed generation.
      expiresAtMs: Number.isNaN(expiresAtMs) ? 0 : expiresAtMs,
    });
    return token;
  }

  /** Drop a cached token, so the next call mints a fresh one. */
  forgetToken(installationId: string): void {
    this.tokens.delete(installationId);
  }

  /** The full recursive tree at a commit. */
  async tree(installationId: string, owner: string, repo: string, sha: string): Promise<RepoTree> {
    const path = `/repos/${segment(owner)}/${segment(repo)}/git/trees/${shaSegment(sha)}?recursive=1`;
    const body = await this.readJson(await this.callWithInstallation(installationId, path), path);
    const { sha: treeSha, tree, truncated } = body as Record<string, unknown>;
    const entries: TreeEntry[] = [];
    if (Array.isArray(tree)) {
      for (const raw of tree) {
        // GitHub does not send nulls here, but this array crosses a trust
        // boundary and a null would otherwise crash the whole reverse on one
        // malformed element (TPL-168).
        if (typeof raw !== "object" || raw === null) continue;
        const item = raw as Record<string, unknown>;
        if (item.type !== "blob") continue;
        if (typeof item.path !== "string" || typeof item.sha !== "string") continue;
        entries.push({
          path: item.path,
          sha: item.sha,
          ...(typeof item.size === "number" ? { size: item.size } : {}),
        });
      }
    }
    return {
      sha: typeof treeSha === "string" ? treeSha : sha,
      entries,
      truncated: truncated === true,
    };
  }

  /** The default branch's head commit SHA. */
  async defaultBranchSha(installationId: string, owner: string, repo: string): Promise<string> {
    const repoPath = `/repos/${segment(owner)}/${segment(repo)}`;
    const meta = await this.readJson(
      await this.callWithInstallation(installationId, repoPath),
      repoPath,
    );
    const branch = (meta as { default_branch?: unknown }).default_branch;
    if (typeof branch !== "string") {
      throw new GitHubApiError(200, repoPath, "the repository has no default branch");
    }
    const refPath = `${repoPath}/commits/${segment(branch)}`;
    const commit = await this.readJson(
      await this.callWithInstallation(installationId, refPath),
      refPath,
    );
    const sha = (commit as { sha?: unknown }).sha;
    if (typeof sha !== "string") {
      throw new GitHubApiError(200, refPath, "the default branch has no commit");
    }
    return sha;
  }

  /**
   * A ref's current commit, or `undefined` if the ref does not exist.
   *
   * `ref` is the part after `refs/`, e.g. `heads/karasu-nest/model-abc123`.
   */
  async refSha(
    installationId: string,
    owner: string,
    repo: string,
    ref: string,
  ): Promise<string | undefined> {
    const path = `/repos/${segment(owner)}/${segment(repo)}/git/ref/${ref
      .split("/")
      .map(segment)
      .join("/")}`;
    const response = await this.callWithInstallation(installationId, path);
    if (response.status === 404) return undefined;
    const body = await this.readJson(response, path);
    const sha = (body as { object?: { sha?: unknown } }).object?.sha;
    return typeof sha === "string" ? sha : undefined;
  }

  /** Create a branch at a commit. Throws if the ref already exists. */
  async createRef(
    installationId: string,
    owner: string,
    repo: string,
    ref: string,
    sha: string,
  ): Promise<void> {
    const path = `/repos/${segment(owner)}/${segment(repo)}/git/refs`;
    const response = await this.callWithInstallation(installationId, path, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/${ref}`, sha }),
    });
    if (!response.ok) {
      throw new GitHubApiError(response.status, path, `could not create ${ref}`);
    }
  }

  /** The blob sha of a file on a branch, or `undefined` if it is not there. */
  async fileSha(
    installationId: string,
    owner: string,
    repo: string,
    filePath: string,
    ref: string,
  ): Promise<string | undefined> {
    const path = `/repos/${segment(owner)}/${segment(repo)}/contents/${filePathSegments(
      filePath,
    )}?ref=${encodeURIComponent(ref)}`;
    const response = await this.callWithInstallation(installationId, path);
    if (response.status === 404) return undefined;
    const body = await this.readJson(response, path);
    const sha = (body as { sha?: unknown }).sha;
    return typeof sha === "string" ? sha : undefined;
  }

  /**
   * Write a file on a branch.
   *
   * `sha` must be the file's current blob sha when replacing one, and absent
   * when creating it. Getting that wrong is a 409 rather than a lost write,
   * which is why the caller looks it up rather than this guessing.
   */
  async putFile(
    installationId: string,
    owner: string,
    repo: string,
    file: { path: string; content: string; message: string; branch: string; sha?: string },
  ): Promise<void> {
    const path = `/repos/${segment(owner)}/${segment(repo)}/contents/${filePathSegments(file.path)}`;
    const response = await this.callWithInstallation(installationId, path, {
      method: "PUT",
      body: JSON.stringify({
        message: file.message,
        content: base64Utf8(file.content),
        branch: file.branch,
        ...(file.sha === undefined ? {} : { sha: file.sha }),
      }),
    });
    if (!response.ok) {
      throw new GitHubApiError(response.status, path, `could not write ${file.path}`);
    }
  }

  /**
   * An open pull request whose head is `branch`, if one is already there.
   *
   * Two things the obvious version gets wrong. GitHub's `head=` filter matches
   * the head *label*, which carries the owner login in its canonical case —
   * and the owner reaching this code has been lower-cased on its way through
   * the key normaliser, so `Kompiro:branch` would never match and the
   * duplicate guard would never fire. `ownerLogin` is the canonical spelling,
   * read from the repository metadata.
   *
   * And the filter is not trusted to have worked: every candidate's
   * `head.ref` is compared here. If GitHub ever ignores an unmatched filter
   * and returns the full list, accepting the first element would report
   * somebody else's pull request as ours and skip the delivery entirely.
   */
  async openPullRequest(
    installationId: string,
    owner: string,
    repo: string,
    branch: string,
    ownerLogin: string,
  ): Promise<{ number: number; url: string } | undefined> {
    const path = `/repos/${segment(owner)}/${segment(repo)}/pulls?state=open&head=${encodeURIComponent(
      `${ownerLogin}:${branch}`,
    )}`;
    const body = await this.readJson(await this.callWithInstallation(installationId, path), path);
    if (!Array.isArray(body)) return undefined;
    for (const raw of body) {
      if (typeof raw !== "object" || raw === null) continue;
      const pull = raw as { number?: unknown; html_url?: unknown; head?: { ref?: unknown } };
      if (pull.head?.ref !== branch) continue;
      if (typeof pull.number !== "number" || typeof pull.html_url !== "string") continue;
      return { number: pull.number, url: pull.html_url };
    }
    return undefined;
  }

  /** Delete a ref. Used to clean up a branch whose pull request never opened. */
  async deleteRef(installationId: string, owner: string, repo: string, ref: string): Promise<void> {
    const path = `/repos/${segment(owner)}/${segment(repo)}/git/refs/${ref
      .split("/")
      .map(segment)
      .join("/")}`;
    const response = await this.callWithInstallation(installationId, path, { method: "DELETE" });
    if (!response.ok && response.status !== 404 && response.status !== 422) {
      throw new GitHubApiError(response.status, path, `could not delete ${ref}`);
    }
  }

  /** Open a pull request. */
  async createPullRequest(
    installationId: string,
    owner: string,
    repo: string,
    pull: { title: string; head: string; base: string; body: string },
  ): Promise<{ number: number; url: string }> {
    const path = `/repos/${segment(owner)}/${segment(repo)}/pulls`;
    const response = await this.callWithInstallation(installationId, path, {
      method: "POST",
      body: JSON.stringify(pull),
    });
    if (!response.ok) {
      throw new GitHubApiError(response.status, path, "could not open a pull request");
    }
    const body = await this.readJson(response, path);
    const { number, html_url: url } = body as Record<string, unknown>;
    if (typeof number !== "number" || typeof url !== "string") {
      throw new GitHubApiError(response.status, path, "the pull-request response was malformed");
    }
    return { number, url };
  }

  /**
   * The default branch and the owner's canonical login.
   *
   * One request for both, because delivery needs both and the login's case
   * matters: everything downstream of the route has been lower-cased, and
   * GitHub's pull-request head filter is not.
   */
  async repoInfo(
    installationId: string,
    owner: string,
    repo: string,
  ): Promise<{ defaultBranch: string; ownerLogin: string }> {
    const path = `/repos/${segment(owner)}/${segment(repo)}`;
    const body = await this.readJson(await this.callWithInstallation(installationId, path), path);
    const { default_branch: branch, owner: repoOwner } = body as {
      default_branch?: unknown;
      owner?: { login?: unknown };
    };
    if (typeof branch !== "string") {
      throw new GitHubApiError(200, path, "the repository has no default branch");
    }
    return {
      defaultBranch: branch,
      ownerLogin: typeof repoOwner?.login === "string" ? repoOwner.login : owner,
    };
  }

  /**
   * Every source file in one request, as a repository archive.
   *
   * This replaced a `tree` call plus one `blob` call per file. Workers caps
   * subrequests per invocation (50 free, 1000 paid) and KV operations count
   * toward the same budget, so per-file fetching put a hard ceiling on
   * repository size that had nothing to do with the model -- an 85-file
   * repository died partway through with `Too many subrequests`.
   *
   * `accept` decides before any bytes are decoded, so a binary or a lockfile
   * costs nothing but a header read.
   */
  async sourceFiles(
    installationId: string,
    owner: string,
    repo: string,
    sha: string,
    options: ReadArchiveOptions,
  ): Promise<ReadArchiveResult> {
    const path = `/repos/${segment(owner)}/${segment(repo)}/tarball/${shaSegment(sha)}`;
    const response = await this.callWithInstallation(installationId, path);
    if (!response.ok) {
      throw new GitHubApiError(response.status, path, "could not read the repository archive");
    }
    if (response.body === null) {
      throw new GitHubApiError(response.status, path, "the repository archive was empty");
    }
    return await readGzippedArchive(response.body, options);
  }

  /** One blob's contents as text. */
  async blob(installationId: string, owner: string, repo: string, sha: string): Promise<string> {
    const path = `/repos/${segment(owner)}/${segment(repo)}/git/blobs/${shaSegment(sha)}`;
    const body = await this.readJson(await this.callWithInstallation(installationId, path), path);
    const { content, encoding } = body as Record<string, unknown>;
    if (typeof content !== "string") {
      throw new GitHubApiError(200, path, "the blob response had no content");
    }
    if (encoding !== "base64") {
      throw new GitHubApiError(200, path, `unexpected blob encoding: ${String(encoding)}`);
    }
    // GitHub wraps base64 at 60 columns; atob rejects the newlines.
    const binary = atob(content.replace(/\s+/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new TextDecoder().decode(bytes);
  }

  private async callWithAppJwt(path: string, init: RequestInit = {}): Promise<Response> {
    const jwt = await createAppJwt({
      appId: this.options.appId,
      privateKeyPem: this.options.privateKeyPem,
      now: this.now(),
    });
    return await this.fetchImpl(`${API_ROOT}${path}`, {
      ...init,
      headers: { ...BASE_HEADERS, Authorization: `Bearer ${jwt}` },
    });
  }

  /**
   * Call with an installation token, retrying once on 401.
   *
   * The retry exists because the token cache can hold a token GitHub has
   * already invalidated — a permission change or a manual revocation does not
   * tell us. One retry with a fresh token turns that into a hiccup instead of
   * a failed generation; more than one would just be a slow way to fail.
   */
  private async callWithInstallation(
    installationId: string,
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const call = async (): Promise<Response> =>
      await this.fetchImpl(`${API_ROOT}${path}`, {
        ...init,
        headers: {
          ...BASE_HEADERS,
          Authorization: `Bearer ${await this.installationToken(installationId)}`,
        },
      });
    const first = await call();
    if (first.status !== 401) return first;
    // Only replay a request that is safe to replay. Every caller today is a
    // GET, but this helper is where a future write would go, and re-sending a
    // write against a genuinely revoked installation is a different kind of
    // mistake from re-sending a read.
    const method = (init.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") return first;
    this.forgetToken(installationId);
    return await call();
  }

  private async readJson(response: Response, path: string): Promise<unknown> {
    if (!response.ok) {
      // The status and the path are ours; the response body is GitHub's and
      // may quote repository contents, so it does not travel with the error.
      throw new GitHubApiError(response.status, path, `GitHub returned ${response.status}`);
    }
    try {
      return await response.json();
    } catch {
      throw new GitHubApiError(response.status, path, "GitHub returned a malformed response");
    }
  }
}
