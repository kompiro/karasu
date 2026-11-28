import { describe, it, expect } from "vitest";
import { synthesizeSharePayload } from "@karasu-tools/core";
import { translate } from "@karasu-tools/i18n";
import { decodeShare, encodeShare, fitsUnfurlPayload } from "../utils/inline-share.js";
import {
  parseRepoPermalink,
  resolveRepoPermalink,
  GitHubRawFileSystemProvider,
} from "./repo-permalink.js";

/** The longest payload `fitsUnfurlPayload` accepts, found from the predicate itself. */
function unfurlCap(): number {
  let fits = 0;
  let overflows = 1 << 20;
  while (overflows - fits > 1) {
    const mid = Math.floor((fits + overflows) / 2);
    if (fitsUnfurlPayload("x".repeat(mid))) fits = mid;
    else overflows = mid;
  }
  return fits;
}
const MAX_UNFURL_PAYLOAD = unfurlCap();

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

  // Each refusal is the `@karasu-tools/i18n` entry, in English because the
  // route has no locale source yet (#3837, #3838).
  it.each([
    ["", "empty permalink", translate("en", "permalink.parse.empty")],
    ["kompiro/karasu@", "empty ref after @", translate("en", "permalink.parse.emptyRef")],
    ["kompiro@main", "only one segment", translate("en", "permalink.parse.shape")],
    [
      "kompiro/karasu@bad ref",
      "space in ref",
      translate("en", "permalink.parse.invalidRef", { ref: "bad ref" }),
    ],
    [
      "kompiro/karasu/../secret.krs@main",
      "path traversal",
      translate("en", "permalink.parse.invalidPath", { path: "../secret.krs" }),
    ],
    [
      "kompiro/karasu/notes.txt@main",
      "non-.krs path",
      translate("en", "permalink.parse.notKrs", { path: "notes.txt" }),
    ],
    [
      "bad_owner!/karasu@main",
      "invalid owner charset",
      translate("en", "permalink.parse.invalidOwner", { owner: "bad_owner!" }),
    ],
    [
      "kompiro/bad repo@main",
      "invalid repo charset",
      translate("en", "permalink.parse.invalidRepo", { repo: "bad repo" }),
    ],
  ])("rejects %j (%s) with the catalog message", (input, _case, message) => {
    expect(parseRepoPermalink(input)).toEqual({ ok: false, message });
  });

  it("keeps the English wording the route has always sent", () => {
    // The catalog moved the words, not changed them: callers and crawlers that
    // read the plain-text body see the same text as before #3837.
    expect(parseRepoPermalink("kompiro@main")).toEqual({
      ok: false,
      message: "Expected '<owner>/<repo>[/<path>]@<ref>'.",
    });
    expect(parseRepoPermalink("kompiro/karasu/notes.txt@main")).toEqual({
      ok: false,
      message: 'Path must point to a .krs file, got "notes.txt".',
    });
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
    expect(res.message).toBe(
      translate("en", "permalink.notFound.message", {
        source: "o/r@sha",
        tried: "index.krs / karasu.krs",
      }),
    );
    expect(res.message).toBe("No .krs found at o/r@sha (looked for index.krs / karasu.krs).");
  });

  it("404s when an explicit path is missing", async () => {
    const res = await resolveRepoPermalink(
      "o/r/missing.krs@sha",
      stubFetch({ "index.krs": SINGLE_KRS }),
    );
    expect(res.status).toBe(404);
    expect(res.message).toBe(
      translate("en", "permalink.notFound.message", { source: "o/r@sha", tried: "missing.krs" }),
    );
  });

  it("400s on a malformed permalink (single segment)", async () => {
    const res = await resolveRepoPermalink("o", stubFetch({}));
    expect(res.status).toBe(400);
    expect(res.message).toBe(translate("en", "permalink.parse.shape"));
  });

  it("400s on an empty ref after '@'", async () => {
    const res = await resolveRepoPermalink("o/r@", stubFetch({}));
    expect(res.status).toBe(400);
    expect(res.message).toBe(translate("en", "permalink.parse.emptyRef"));
  });

  it("502s on an upstream GitHub failure (non-404)", async () => {
    const res = await resolveRepoPermalink("o/r@sha", stubFetch({ "index.krs": "__500__" }));
    expect(res.status).toBe(502);
    expect(res.message).toBe(translate("en", "permalink.upstream.message", { status: 500 }));
    expect(res.message).toBe("Upstream GitHub error (500).");
  });

  it("500s with the cause when resolving fails unexpectedly", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    const res = await resolveRepoPermalink("o/r@sha", fetchImpl);
    expect(res.status).toBe(500);
    expect(res.message).toBe(
      translate("en", "permalink.failed.message", { source: "o/r@sha", detail: "network down" }),
    );
    expect(res.message).toBe("Failed to resolve o/r@sha: network down");
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

  /** Length of the payload the resolver builds for `n` services, computed independently. */
  async function encodedLengthOf(n: number): Promise<number> {
    const fs = new GitHubRawFileSystemProvider(
      "o",
      "r",
      "sha",
      stubFetch({ "index.krs": krsWithServices(n) }),
    );
    return encodeShare(await synthesizeSharePayload("index.krs", fs)).length;
  }

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
    // The reported size is the model's real encoded length, not just some number over the cap.
    const encodedLength = await encodedLengthOf(400);
    expect(encodedLength).toBeGreaterThan(MAX_UNFURL_PAYLOAD);
    expect(reportedLength(res.message)).toBe(encodedLength);
    // Names the remedy, not just the failure.
    expect(res.message).toContain("narrower entry .krs");
    // The body is the i18n catalog entry, not text built in app code (#3837).
    // The route has no locale source yet, so it is the English entry (#3838).
    expect(res.message).toBe(
      translate("en", "permalink.tooLarge.message", {
        source: "o/r@sha",
        length: encodedLength,
        limit: MAX_UNFURL_PAYLOAD,
      }),
    );
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
    const refusedLength = await encodedLengthOf(overflows);
    expect(refusedLength).toBeGreaterThan(MAX_UNFURL_PAYLOAD);
    expect(reportedLength(refused.message)).toBe(refusedLength);
  });
});
