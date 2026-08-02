import { beforeAll, describe, expect, it } from "vitest";
import { generateTestKeyPair, type TestKeyPair } from "../testing/rsa-keys.js";
import { GitHubApiError, GitHubClient } from "./client.js";

let keys: TestKeyPair;
beforeAll(async () => {
  keys = await generateTestKeyPair();
});

interface Call {
  url: string;
  method: string;
  authorization: string | null;
}

/** A fetch double that answers from a path -> response table and records calls. */
function stubFetch(routes: Record<string, (call: Call) => Response>): {
  fetchImpl: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const call: Call = {
      url,
      method: init?.method ?? "GET",
      authorization: headers.get("Authorization"),
    };
    calls.push(call);
    const path = url.replace("https://api.github.com", "");
    const handler = routes[path];
    if (!handler) return Promise.resolve(new Response("no route", { status: 599 }));
    return Promise.resolve(handler(call));
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const tokenResponse = (token: string, expiresAt: string): Response =>
  json({ token, expires_at: expiresAt });

function client(
  fetchImpl: typeof fetch,
  now: () => number = () => Date.parse("2026-08-02T12:00:00Z"),
): GitHubClient {
  return new GitHubClient({ appId: "1234", privateKeyPem: keys.pkcs8Pem, fetchImpl, now });
}

describe("GitHubClient", () => {
  describe("installationIdFor", () => {
    it("returns the installation that can read the repo", async () => {
      const { fetchImpl, calls } = stubFetch({
        "/repos/kompiro/karasu/installation": () => json({ id: 42 }),
      });
      expect(await client(fetchImpl).installationIdFor("kompiro", "karasu")).toBe("42");
      // Authenticated as the App, not as an installation.
      expect(calls[0]?.authorization).toMatch(/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./);
    });

    it("returns undefined when the App is not installed on the repo", async () => {
      // A 404 here means "not installed", which is an answer, not a failure.
      const { fetchImpl } = stubFetch({
        "/repos/kompiro/karasu/installation": () => json({}, 404),
      });
      expect(await client(fetchImpl).installationIdFor("kompiro", "karasu")).toBeUndefined();
    });

    it("raises other failures rather than reading them as not installed", async () => {
      const { fetchImpl } = stubFetch({
        "/repos/kompiro/karasu/installation": () => json({}, 500),
      });
      await expect(client(fetchImpl).installationIdFor("kompiro", "karasu")).rejects.toThrowError(
        GitHubApiError,
      );
    });
  });

  describe("installationToken", () => {
    const path = "/app/installations/42/access_tokens";

    it("mints a token and reuses it until it is nearly expired", async () => {
      let minted = 0;
      const { fetchImpl } = stubFetch({
        [path]: () => {
          minted += 1;
          return tokenResponse(`ghs_token_${minted}`, "2026-08-02T13:00:00Z");
        },
      });
      const github = client(fetchImpl);
      expect(await github.installationToken("42")).toBe("ghs_token_1");
      expect(await github.installationToken("42")).toBe("ghs_token_1");
      expect(minted).toBe(1);
    });

    it("re-mints before the token expires, not after", async () => {
      // A request that starts just under the wire must not finish just over
      // it, so the cache is abandoned a minute early.
      let clock = Date.parse("2026-08-02T12:00:00Z");
      let minted = 0;
      const { fetchImpl } = stubFetch({
        [path]: () => {
          minted += 1;
          return tokenResponse(`ghs_token_${minted}`, "2026-08-02T13:00:00Z");
        },
      });
      const github = client(fetchImpl, () => clock);
      await github.installationToken("42");
      // Still comfortably inside the window: no re-mint.
      clock = Date.parse("2026-08-02T12:58:00Z");
      expect(await github.installationToken("42")).toBe("ghs_token_1");
      // Just inside the one-minute renewal margin before 13:00:00Z.
      clock = Date.parse("2026-08-02T12:59:30Z");
      expect(await github.installationToken("42")).toBe("ghs_token_2");
      expect(minted).toBe(2);
    });

    it("keeps installations' tokens apart", async () => {
      const { fetchImpl } = stubFetch({
        "/app/installations/42/access_tokens": () =>
          tokenResponse("for-42", "2026-08-02T13:00:00Z"),
        "/app/installations/43/access_tokens": () =>
          tokenResponse("for-43", "2026-08-02T13:00:00Z"),
      });
      const github = client(fetchImpl);
      expect(await github.installationToken("42")).toBe("for-42");
      expect(await github.installationToken("43")).toBe("for-43");
    });

    it("treats an unparseable expiry as already stale", async () => {
      // Re-minting costs one request; using a dead token costs a generation.
      let minted = 0;
      const { fetchImpl } = stubFetch({
        [path]: () => {
          minted += 1;
          return tokenResponse(`ghs_token_${minted}`, "whenever");
        },
      });
      const github = client(fetchImpl);
      await github.installationToken("42");
      await github.installationToken("42");
      expect(minted).toBe(2);
    });

    it("rejects a malformed token response instead of caching nonsense", async () => {
      const { fetchImpl } = stubFetch({ [path]: () => json({ token: 42 }) });
      await expect(client(fetchImpl).installationToken("42")).rejects.toThrowError(GitHubApiError);
    });
  });

  describe("tree", () => {
    const path = "/repos/kompiro/karasu/git/trees/abc?recursive=1";

    it("returns blob entries with a token, not the App JWT", async () => {
      const { fetchImpl, calls } = stubFetch({
        "/app/installations/42/access_tokens": () =>
          tokenResponse("ghs_token", "2026-08-02T13:00:00Z"),
        [path]: () =>
          json({
            sha: "abc",
            truncated: false,
            tree: [
              { path: "src/a.ts", sha: "aaa", size: 10, type: "blob" },
              { path: "src", sha: "bbb", type: "tree" },
            ],
          }),
      });
      const result = await client(fetchImpl).tree("42", "kompiro", "karasu", "abc");
      // Trees are not files; including them would inflate the file count the
      // pipeline reasons about.
      expect(result.entries).toEqual([{ path: "src/a.ts", sha: "aaa", size: 10 }]);
      expect(calls.at(-1)?.authorization).toBe("Bearer ghs_token");
    });

    it("reports truncation rather than silently describing part of a repo", async () => {
      const { fetchImpl } = stubFetch({
        "/app/installations/42/access_tokens": () => tokenResponse("t", "2026-08-02T13:00:00Z"),
        [path]: () => json({ sha: "abc", truncated: true, tree: [] }),
      });
      expect((await client(fetchImpl).tree("42", "kompiro", "karasu", "abc")).truncated).toBe(true);
    });

    it("survives a tree entry missing the fields it needs", async () => {
      const { fetchImpl } = stubFetch({
        "/app/installations/42/access_tokens": () => tokenResponse("t", "2026-08-02T13:00:00Z"),
        [path]: () => json({ sha: "abc", tree: [{ type: "blob" }, null, "nonsense"] }),
      });
      expect((await client(fetchImpl).tree("42", "kompiro", "karasu", "abc")).entries).toEqual([]);
    });

    it("retries once with a fresh token when GitHub says the token is dead", async () => {
      // The cache can hold a token a permission change already invalidated,
      // and nothing tells us. One retry turns that into a hiccup.
      let minted = 0;
      let treeCalls = 0;
      const { fetchImpl } = stubFetch({
        "/app/installations/42/access_tokens": () => {
          minted += 1;
          return tokenResponse(`token-${minted}`, "2026-08-02T13:00:00Z");
        },
        [path]: () => {
          treeCalls += 1;
          return treeCalls === 1 ? json({}, 401) : json({ sha: "abc", tree: [] });
        },
      });
      await expect(client(fetchImpl).tree("42", "kompiro", "karasu", "abc")).resolves.toBeDefined();
      expect(minted).toBe(2);
      expect(treeCalls).toBe(2);
    });

    it("gives up after one retry rather than looping on a real 401", async () => {
      let treeCalls = 0;
      const { fetchImpl } = stubFetch({
        "/app/installations/42/access_tokens": () => tokenResponse("t", "2026-08-02T13:00:00Z"),
        [path]: () => {
          treeCalls += 1;
          return json({}, 401);
        },
      });
      await expect(client(fetchImpl).tree("42", "kompiro", "karasu", "abc")).rejects.toThrowError(
        GitHubApiError,
      );
      expect(treeCalls).toBe(2);
    });
  });

  describe("blob", () => {
    const path = "/repos/kompiro/karasu/git/blobs/aaa";

    it("decodes base64 content, including GitHub's line wrapping", async () => {
      const content = "export const answer = 42;\n".repeat(10);
      const base64 =
        btoa(content)
          .match(/.{1,60}/g)
          ?.join("\n") ?? "";
      const { fetchImpl } = stubFetch({
        "/app/installations/42/access_tokens": () => tokenResponse("t", "2026-08-02T13:00:00Z"),
        [path]: () => json({ content: base64, encoding: "base64" }),
      });
      expect(await client(fetchImpl).blob("42", "kompiro", "karasu", "aaa")).toBe(content);
    });

    it("decodes UTF-8 rather than mangling non-ASCII", async () => {
      const content = "// 鴉のアーキテクチャ\n";
      const bytes = new TextEncoder().encode(content);
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const { fetchImpl } = stubFetch({
        "/app/installations/42/access_tokens": () => tokenResponse("t", "2026-08-02T13:00:00Z"),
        [path]: () => json({ content: btoa(binary), encoding: "base64" }),
      });
      expect(await client(fetchImpl).blob("42", "kompiro", "karasu", "aaa")).toBe(content);
    });

    it("refuses an encoding it does not understand", async () => {
      const { fetchImpl } = stubFetch({
        "/app/installations/42/access_tokens": () => tokenResponse("t", "2026-08-02T13:00:00Z"),
        [path]: () => json({ content: "x", encoding: "none" }),
      });
      await expect(client(fetchImpl).blob("42", "kompiro", "karasu", "aaa")).rejects.toThrowError(
        /unexpected blob encoding/,
      );
    });
  });

  describe("defaultBranchSha", () => {
    it("resolves the head commit of the repository's default branch", async () => {
      const { fetchImpl } = stubFetch({
        "/app/installations/42/access_tokens": () => tokenResponse("t", "2026-08-02T13:00:00Z"),
        "/repos/kompiro/karasu": () => json({ default_branch: "trunk" }),
        "/repos/kompiro/karasu/commits/trunk": () => json({ sha: "d".repeat(40) }),
      });
      expect(await client(fetchImpl).defaultBranchSha("42", "kompiro", "karasu")).toBe(
        "d".repeat(40),
      );
    });
  });

  it("keeps GitHub's response body out of the error it raises", async () => {
    // The body is GitHub's and may quote repository contents; the status and
    // the path are ours.
    const { fetchImpl } = stubFetch({
      "/repos/kompiro/karasu/installation": () =>
        new Response("secret-looking detail from the repo", { status: 403 }),
    });
    const error = await client(fetchImpl)
      .installationIdFor("kompiro", "karasu")
      .catch((cause: unknown) => cause as GitHubApiError);
    expect(error).toBeInstanceOf(GitHubApiError);
    expect((error as GitHubApiError).message).toBe("GitHub returned 403");
    expect((error as GitHubApiError).status).toBe(403);
  });

  it("identifies itself and pins the API version on every call", async () => {
    const seen: Headers[] = [];
    const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Headers(init?.headers));
      return Promise.resolve(json({ id: 42 }));
    }) as typeof fetch;
    await client(fetchImpl).installationIdFor("kompiro", "karasu");
    expect(seen[0]?.get("X-GitHub-Api-Version")).toBe("2022-11-28");
    expect(seen[0]?.get("User-Agent")).toBe("karasu-nest");
  });
});
