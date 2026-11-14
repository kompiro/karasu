import { describe, it, expect } from "vitest";
import { decodeShare, MAX_UNFURL_PAYLOAD } from "../utils/inline-share.js";
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

  it("defaults ref to HEAD when @ is omitted (default branch)", () => {
    expect(parseRepoPermalink("kompiro/karasu")).toEqual({
      ok: true,
      value: { owner: "kompiro", repo: "karasu", filePath: null, ref: "HEAD" },
    });
  });

  it("defaults ref to HEAD with an explicit path and no @", () => {
    const r = parseRepoPermalink("kompiro/karasu/docs/arch.krs");
    expect(r.ok && r.value).toMatchObject({ filePath: "docs/arch.krs", ref: "HEAD" });
  });

  it("splits the ref on the LAST @", () => {
    const r = parseRepoPermalink("o/r/a@b.krs@sha1");
    expect(r.ok && r.value.ref).toBe("sha1");
    expect(r.ok && r.value.filePath).toBe("a@b.krs");
  });

  it.each([
    ["kompiro/karasu@", "empty ref after @"],
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

  it("flags immutable=true only for a full 40-hex SHA (cache TTL selector)", async () => {
    const sha = await resolveRepoPermalink(
      `o/r@${"a".repeat(40)}`,
      stubFetch({ "index.krs": SINGLE_KRS }),
    );
    expect(sha.status).toBe(200);
    expect(sha.immutable).toBe(true);

    // Abbreviated SHAs are indistinguishable from a hex-looking branch → mutable.
    const shortSha = await resolveRepoPermalink(
      "o/r@a1b2c3d",
      stubFetch({ "index.krs": SINGLE_KRS }),
    );
    expect(shortSha.immutable).toBe(false);

    const branch = await resolveRepoPermalink("o/r@main", stubFetch({ "index.krs": SINGLE_KRS }));
    expect(branch.immutable).toBe(false);

    const head = await resolveRepoPermalink("o/r", stubFetch({ "index.krs": SINGLE_KRS }));
    expect(head.immutable).toBe(false);
  });

  it("resolves the default branch (HEAD) when @ is omitted", async () => {
    // No `@ref` → the provider fetches raw at the `HEAD` ref (default branch).
    let seenRef: string | undefined;
    const fetchImpl = (async (input: string | URL | Request) => {
      const m = String(input).match(/raw\.githubusercontent\.com\/o\/r\/([^/]+)\//);
      seenRef = m?.[1];
      return new Response(SINGLE_KRS, { status: 200 });
    }) as typeof fetch;
    const res = await resolveRepoPermalink("o/r", fetchImpl);
    expect(res.status).toBe(200);
    expect(seenRef).toBe("HEAD");
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

  it("400s on a malformed permalink (single segment)", async () => {
    const res = await resolveRepoPermalink("o", stubFetch({}));
    expect(res.status).toBe(400);
  });

  it("400s on an empty ref after '@'", async () => {
    const res = await resolveRepoPermalink("o/r@", stubFetch({}));
    expect(res.status).toBe(400);
  });

  it("502s on an upstream GitHub failure (non-404)", async () => {
    const res = await resolveRepoPermalink("o/r@sha", stubFetch({ "index.krs": "__500__" }));
    expect(res.status).toBe(502);
  });

  it("degrades gracefully (200, not 500) on an unsupported directory import", async () => {
    // A directory import drives the resolver to `readDir` (unsupported in v1).
    // ImportResolver catches that, emits a diagnostic, and continues — so the
    // model still resolves to 200 (without the directory's files), never 500.
    const entry = `import "./domains/"\nsystem Shop { service Web { label "Web" } }`;
    const res = await resolveRepoPermalink("o/r@sha", stubFetch({ "index.krs": entry }));
    expect(res.status).toBe(200);
    expect(decodeShare(res.encodedPayload!)?.krs).toContain("system Shop");
  });
});

/**
 * Issue #2259 — the resolver hands its payload to `Location: /s?s=…`, which
 * `/s` echoes again into the `/render?s=…` OGP image URL. Both ride a request
 * line bounded by Cloudflare's 16 KB URL limit, so the resolver must refuse
 * above `MAX_UNFURL_PAYLOAD` rather than emit an unusable redirect (TPL-2259).
 */
describe("resolveRepoPermalink — unfurl payload cap", () => {
  const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

  /**
   * A parseable `.krs` with `n` services whose ids and labels come from a
   * deterministic LCG. The randomness is load-bearing: uniform boilerplate
   * deflates ~4x better than a real model, so a compressible fixture would need
   * thousands of nodes to reach the cap. At ~0.52 encoded/raw this matches the
   * ratio measured over `examples/` (Issue #2259).
   */
  function krsWithServices(n: number): string {
    let seed = 12345;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
    const word = (len: number) =>
      Array.from({ length: len }, () => ALPHABET[next() % ALPHABET.length]).join("");
    const lines = ["system Shop {"];
    for (let i = 0; i < n; i++) {
      lines.push(`  service Svc${i}${word(6)} { label "${word(24)}" }`);
    }
    lines.push("}");
    return lines.join("\n");
  }

  const resolveWith = (n: number) =>
    resolveRepoPermalink("o/r@sha", stubFetch({ "index.krs": krsWithServices(n) }));

  /** Encoded length the resolver reported it could not fit. */
  function reportedLength(message: string | undefined): number {
    const m = /encodes to (\d+) characters/.exec(message ?? "");
    if (m === null) throw new Error(`message should name the encoded length, got: ${message}`);
    return Number(m[1]);
  }

  it("refuses an over-cap model with a diagnostic naming the cause (413)", async () => {
    const res = await resolveWith(400);
    expect(res.status).toBe(413);
    // No payload to redirect to — the caller must not build a `/s?s=` URL.
    expect(res.encodedPayload).toBeUndefined();
    expect(res.message).toContain("Model too large for a permalink: o/r@sha");
    expect(res.message).toContain(String(MAX_UNFURL_PAYLOAD));
    expect(reportedLength(res.message)).toBeGreaterThan(MAX_UNFURL_PAYLOAD);
    // Names the remedy, not just the failure.
    expect(res.message).toContain("narrower entry .krs");
  });

  it("accepts right up to the cap and refuses one node past it", async () => {
    // Binary-search the service count where the resolver flips, then assert the
    // flip sits on MAX_UNFURL_PAYLOAD itself rather than on some other
    // threshold — i.e. the gate is the shared predicate, not a stricter guess.
    let fits = 1; // 1 service always fits
    let overflows = 400; // 400 services never fits (asserted above)
    while (overflows - fits > 1) {
      const mid = Math.floor((fits + overflows) / 2);
      if ((await resolveWith(mid)).status === 200) fits = mid;
      else overflows = mid;
    }

    const accepted = await resolveWith(fits);
    expect(accepted.status).toBe(200);
    expect(accepted.encodedPayload!.length).toBeLessThanOrEqual(MAX_UNFURL_PAYLOAD);

    const refused = await resolveWith(overflows);
    expect(refused.status).toBe(413);
    expect(reportedLength(refused.message)).toBeGreaterThan(MAX_UNFURL_PAYLOAD);
  });
});
