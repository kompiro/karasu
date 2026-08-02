import { describe, expect, it } from "vitest";
import { handleRequest } from "../app.js";
import type { NestEnv, NestExecutionContext } from "../env.js";
import { ReadCounter } from "../meter/reads.js";
import { markGenerated } from "../store/krs-cache.js";
import { NestStore } from "../store/nest-store.js";
import { MemoryKV } from "../testing/memory-kv.js";

/** Collects the detached work so a test can await it, as the runtime does. */
function recordingCtx(): NestExecutionContext & { settled: () => Promise<unknown[]> } {
  const pending: Promise<unknown>[] = [];
  return {
    waitUntil: (promise) => void pending.push(promise),
    settled: () => Promise.all(pending),
  };
}

const ctx: NestExecutionContext = { waitUntil: () => {} };
const SHA = "a".repeat(40);
const KRS = "system Payments {\n  service api\n}\n";
const entry = { krs: markGenerated(KRS), generatedAt: "2026-08-02T00:00:00Z" };

async function seeded(): Promise<NestEnv> {
  const kv = new MemoryKV();
  await new NestStore(kv).publish(
    { installationId: 42, owner: "kompiro", repo: "karasu", sha: SHA },
    entry,
  );
  return { KRS_CACHE: kv };
}

const get = (path: string, env: NestEnv): Promise<Response> =>
  handleRequest(new Request(`https://nest.example${path}`), env, ctx);

describe("GET /<owner>/<repo>", () => {
  it("serves the generated .krs with its provenance", async () => {
    const response = await get("/kompiro/karasu", await seeded());
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(KRS);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("X-Karasu-Source-Sha")).toBe(SHA);
    expect(response.headers.get("X-Karasu-Generated-At")).toBe(entry.generatedAt);
    expect(response.headers.get("X-Karasu-Generated")).toBe("true");
  });

  it("never lets the response be cached", async () => {
    // This service cannot tell a public repo from a private one at the cache
    // key, and guessing towards "cacheable" is the wrong guess to be wrong
    // about (ADR-1990 decision 6).
    const response = await get("/kompiro/karasu", await seeded());
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("resolves regardless of casing", async () => {
    expect((await get("/Kompiro/KARASU", await seeded())).status).toBe(200);
  });

  it("serves JSON with the same provenance on request", async () => {
    const response = await get("/kompiro/karasu?format=json", await seeded());
    expect(await response.json()).toEqual({
      owner: "kompiro",
      repo: "karasu",
      sha: SHA,
      generatedAt: entry.generatedAt,
      krs: KRS,
    });
    expect(response.headers.get("X-Karasu-Source-Sha")).toBe(SHA);
  });

  it("404s a repo nothing has been generated for, and says what to do", async () => {
    const body = await (await get("/kompiro/hane", await seeded())).json();
    expect(body.error.code).toBe("not_generated");
    // The signpost is the point of the 404: a bare "not found" would leave a
    // reader with no next step, which is the wall ADR-1990 set out to break.
    expect(body.error.message).toContain("reverse-engineering-with-ai");
  });

  it("distinguishes a malformed name from a repo with nothing generated", async () => {
    // Telling someone to install a GitHub App for a URL that can never work
    // would be worse than saying the URL is wrong.
    const response = await get("/kompiro/not a repo", await seeded());
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_repo");
  });

  it("does not shadow /healthz", async () => {
    const response = await get("/healthz", await seeded());
    expect((await response.json()).service).toBe("karasu-nest");
  });

  it("refuses rather than 500s when the cache binding is missing", async () => {
    const response = await get("/kompiro/karasu", {});
    expect(response.status).toBe(503);
    expect((await response.json()).error).toEqual({
      code: "not_configured",
      message: "This deploy is missing the KRS_CACHE binding.",
    });
  });

  it("answers HEAD with the headers and no body", async () => {
    const response = await handleRequest(
      new Request("https://nest.example/kompiro/karasu", { method: "HEAD" }),
      await seeded(),
      ctx,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Karasu-Source-Sha")).toBe(SHA);
    expect(await response.text()).toBe("");
  });

  it("405s a method the route does not serve", async () => {
    const response = await handleRequest(
      new Request("https://nest.example/kompiro/karasu", { method: "POST" }),
      await seeded(),
      ctx,
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, HEAD");
  });

  it("404s a path with more segments than owner/repo", async () => {
    expect((await get("/kompiro/karasu/extra", await seeded())).status).toBe(404);
  });

  describe("read counting (#2226)", () => {
    it("counts a served model, off the response path", async () => {
      // The count is the other half of the cost question: a generation read
      // once is a very expensive way to render one diagram.
      const kv = new MemoryKV();
      await new NestStore(kv).publish(
        { installationId: 42, owner: "kompiro", repo: "karasu", sha: SHA },
        entry,
      );
      const counting = recordingCtx();
      const response = await handleRequest(
        new Request("https://nest.example/kompiro/karasu"),
        { KRS_CACHE: kv },
        counting,
      );

      // Handed to `waitUntil` rather than awaited inline, so a slow KV write
      // cannot delay a reader. (The fake KV settles on a microtask, so the
      // count may already be in by the time this runs -- what is asserted is
      // that the work was handed over, not when it finished.)
      expect(response.status).toBe(200);
      expect((await counting.settled()).length).toBe(1);
      expect(await new ReadCounter(kv).totalReads()).toBe(1);
    });

    it("does not count a repository it had nothing for", async () => {
      const counting = recordingCtx();
      await handleRequest(
        new Request("https://nest.example/kompiro/nothing"),
        { KRS_CACHE: new MemoryKV() },
        counting,
      );
      await counting.settled();
      expect((await counting.settled()).length).toBe(0);
    });
  });
});
