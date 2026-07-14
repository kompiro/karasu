import { describe, it, expect } from "vitest";
import { decodeShare } from "../utils/inline-share.js";
import {
  parseRepoPermalink,
  resolveRepoPermalink,
  GitHubRawFileSystemProvider,
} from "./repo-permalink.js";

const SINGLE_KRS = `system Shop {
  service Web { label "Web" }
  service Api { label "API" }
  Web -> Api "calls"
}`;

/**
 * Build a fetch stub from a map of repo-relative path → `.krs` text. Any path
 * not in the map 404s; a path whose value is the sentinel `__500__` returns a
 * 500 (upstream failure). Also asserts the host is always GitHub raw.
 */
function stubFetch(files: Record<string, string>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    expect(url.startsWith("https://raw.githubusercontent.com/")).toBe(true);
    const path = url.replace(/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\//, "");
    const body = files[path];
    if (body === undefined) return new Response("Not Found", { status: 404 });
    if (body === "__500__") return new Response("boom", { status: 500 });
    return new Response(body, { status: 200 });
  }) as typeof fetch;
}

describe("parseRepoPermalink", () => {
  it("parses owner/repo@ref with default entry", () => {
    const r = parseRepoPermalink("kompiro/karasu@abc123");
    expect(r).toEqual({
      ok: true,
      value: { owner: "kompiro", repo: "karasu", filePath: null, ref: "abc123" },
    });
  });

  it("parses an explicit .krs path", () => {
    const r = parseRepoPermalink("kompiro/karasu/docs/arch.krs@main");
    expect(r.ok && r.value).toMatchObject({
      owner: "kompiro",
      repo: "karasu",
      filePath: "docs/arch.krs",
      ref: "main",
    });
  });

  it("splits the ref on the LAST @", () => {
    const r = parseRepoPermalink("o/r/a@b.krs@sha1");
    expect(r.ok && r.value.ref).toBe("sha1");
    expect(r.ok && r.value.filePath).toBe("a@b.krs");
  });

  it.each([
    ["kompiro/karasu", "missing @ref"],
    ["kompiro@main", "only one segment"],
    ["kompiro/karasu@bad ref", "space in ref"],
    ["kompiro/karasu/../secret.krs@main", "path traversal"],
    ["kompiro/karasu/notes.txt@main", "non-.krs path"],
    ["bad_owner!/karasu@main", "invalid owner charset"],
  ])("rejects %s (%s)", (input) => {
    expect(parseRepoPermalink(input).ok).toBe(false);
  });
});

describe("GitHubRawFileSystemProvider", () => {
  it("maps repo-relative paths to raw.githubusercontent.com and memoizes", async () => {
    let calls = 0;
    const fetchImpl = (async (input: string | URL | Request) => {
      calls++;
      expect(String(input)).toBe("https://raw.githubusercontent.com/o/r/sha/index.krs");
      return new Response(SINGLE_KRS, { status: 200 });
    }) as typeof fetch;
    const fs = new GitHubRawFileSystemProvider("o", "r", "sha", fetchImpl);
    expect(await fs.readFile("index.krs")).toBe(SINGLE_KRS);
    await fs.readFile("index.krs"); // second read hits the memo
    expect(calls).toBe(1);
  });

  it("rejects an import that escapes the repo root", async () => {
    const fs = new GitHubRawFileSystemProvider("o", "r", "sha", stubFetch({}));
    await expect(fs.readFile("../../etc/passwd")).rejects.toThrow(/escapes repository root/);
  });

  it("readDir is unsupported (no directory listing in v1)", async () => {
    const fs = new GitHubRawFileSystemProvider("o", "r", "sha", stubFetch({}));
    await expect(fs.readDir()).rejects.toThrow(/not supported/);
  });
});

describe("resolveRepoPermalink", () => {
  it("resolves a single-file repo via the default index.krs (200)", async () => {
    const res = await resolveRepoPermalink("o/r@sha", stubFetch({ "index.krs": SINGLE_KRS }));
    expect(res.status).toBe(200);
    const payload = decodeShare(res.encodedPayload!);
    expect(payload?.krs).toContain("system Shop");
  });

  it("falls back to karasu.krs when index.krs is absent", async () => {
    const res = await resolveRepoPermalink("o/r@sha", stubFetch({ "karasu.krs": SINGLE_KRS }));
    expect(res.status).toBe(200);
    expect(decodeShare(res.encodedPayload!)?.krs).toContain("system Shop");
  });

  it("inlines a multi-file import (import resolution across the repo FS)", async () => {
    const entry = `import "./services.krs"\nsystem Shop {\n  service Web { label "Web" }\n}`;
    const imported = `service Api { label "API" }`;
    const res = await resolveRepoPermalink(
      "o/r@sha",
      stubFetch({ "index.krs": entry, "services.krs": imported }),
    );
    expect(res.status).toBe(200);
    const krs = decodeShare(res.encodedPayload!)?.krs ?? "";
    // The imported service is inlined into the single self-contained payload,
    // and the original import statement is dropped.
    expect(krs).toContain("Api");
    expect(krs).not.toContain('import "./services.krs"');
  });

  it("404s when no .krs is found at the ref", async () => {
    const res = await resolveRepoPermalink("o/r@sha", stubFetch({ "README.md": "x" }));
    expect(res.status).toBe(404);
    expect(res.message).toContain("No .krs found");
  });

  it("404s when an explicit path is missing", async () => {
    const res = await resolveRepoPermalink(
      "o/r/missing.krs@sha",
      stubFetch({ "index.krs": SINGLE_KRS }),
    );
    expect(res.status).toBe(404);
  });

  it("400s on a malformed permalink", async () => {
    const res = await resolveRepoPermalink("o/r", stubFetch({}));
    expect(res.status).toBe(400);
  });

  it("502s on an upstream GitHub failure (non-404)", async () => {
    const res = await resolveRepoPermalink("o/r@sha", stubFetch({ "index.krs": "__500__" }));
    expect(res.status).toBe(502);
  });
});
