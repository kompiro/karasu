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

  constructor(private readonly options: GitHubClientOptions) {
    // Bound before it is stored. The Workers runtime throws "Illegal
    // invocation" when the global `fetch` is later called as a detached
    // reference; Node tolerates it, so the unit tests would not catch it.
    const impl = options.fetchImpl ?? fetch;
    this.fetchImpl = (input, init) => impl(input, init);
    this.now = options.now ?? (() => Date.now());
  }

  /** Which installation, if any, can read this repository. */
  async installationIdFor(owner: string, repo: string): Promise<string | undefined> {
    const response = await this.callWithAppJwt(`/repos/${owner}/${repo}/installation`);
    if (response.status === 404) return undefined;
    const body = await this.readJson(response, `/repos/${owner}/${repo}/installation`);
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
  async installationToken(installationId: string): Promise<string> {
    const cached = this.tokens.get(installationId);
    if (cached && cached.expiresAtMs - TOKEN_RENEWAL_MARGIN_MS > this.now()) return cached.token;

    const path = `/app/installations/${installationId}/access_tokens`;
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
    const path = `/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`;
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
    const repoPath = `/repos/${owner}/${repo}`;
    const meta = await this.readJson(
      await this.callWithInstallation(installationId, repoPath),
      repoPath,
    );
    const branch = (meta as { default_branch?: unknown }).default_branch;
    if (typeof branch !== "string") {
      throw new GitHubApiError(200, repoPath, "the repository has no default branch");
    }
    const refPath = `/repos/${owner}/${repo}/commits/${branch}`;
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

  /** One blob's contents as text. */
  async blob(installationId: string, owner: string, repo: string, sha: string): Promise<string> {
    const path = `/repos/${owner}/${repo}/git/blobs/${sha}`;
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
