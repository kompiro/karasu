import { describe, expect, it, vi } from "vitest";
import { handleRequest } from "../app.js";
import type { NestEnv, NestExecutionContext } from "../env.js";
import { MetricsStore, type RunMetrics } from "../meter/record.js";
import { ReadCounter } from "../meter/reads.js";
import { MemoryKV } from "../testing/memory-kv.js";

const TOKEN = "a-token-nobody-guesses";
const ctx: NestExecutionContext = { waitUntil: () => {} };
const ref = { installationId: "42", owner: "kompiro", repo: "shop" };

function run(overrides: Partial<RunMetrics> = {}): RunMetrics {
  return {
    sha: "a".repeat(40),
    finishedAt: "2026-08-02T12:00:00Z",
    model: "claude-opus-5",
    durationMs: 900_000,
    inputTokens: 400_000,
    outputTokens: 400_000,
    passes: [],
    files: 85,
    bytesRead: 1_200_000,
    redactions: 2,
    unreadableFiles: 0,
    ...overrides,
  };
}

function env(kv: MemoryKV): NestEnv {
  return { KRS_CACHE: kv, METRICS_TOKEN: TOKEN };
}

const call = (kvEnv: NestEnv, token?: string): Promise<Response> =>
  handleRequest(
    new Request("https://nest.example/admin/metrics", {
      headers: token === undefined ? {} : { Authorization: `Bearer ${token}` },
    }),
    kvEnv,
    ctx,
  );

describe("GET /admin/metrics", () => {
  it("reports cost per run against the pricing snapshot", async () => {
    // 400k in at $5/1M plus 400k out at $25/1M is $12 -- the figure #1994's
    // quota argument starts from.
    const kv = new MemoryKV();
    await new MetricsStore(kv).record(ref, run());
    const body = await (await call(env(kv), TOKEN)).json();
    expect(body.runs).toBe(1);
    expect(body.cost.perRunUsd).toBe(12);
    expect(body.pricingAsOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("reports reads per run, which is what the quota argument turns on", async () => {
    const kv = new MemoryKV();
    await new MetricsStore(kv).record(ref, run());
    const counter = new ReadCounter(kv);
    await counter.increment(ref, new Date("2026-08-02T00:00:00Z"));
    await counter.increment(ref, new Date("2026-08-03T00:00:00Z"));
    const body = await (await call(env(kv), TOKEN)).json();
    expect([body.reads, body.readsPerRun]).toEqual([2, 2]);
  });

  it("names a model it cannot price instead of quietly dropping its spend", async () => {
    // A single total that silently omits a model would be read as the bill.
    const kv = new MemoryKV();
    await new MetricsStore(kv).record(ref, run({ model: "some-other-model" }));
    const body = await (await call(env(kv), TOKEN)).json();
    expect(body.cost.unpricedModels).toEqual(["some-other-model"]);
    expect(body.cost.totalUsd).toBe(0);
  });

  it("names no repository, so the report is not a list of who installed the App", async () => {
    const kv = new MemoryKV();
    await new MetricsStore(kv).record(ref, run());
    const raw = await (await call(env(kv), TOKEN)).text();
    expect(raw).not.toContain("kompiro");
    expect(raw).not.toContain("shop");
  });

  it("answers zeroes rather than NaN before anything has run", async () => {
    const body = await (await call(env(new MemoryKV()), TOKEN)).json();
    expect([body.runs, body.readsPerRun, body.cost.perRunUsd]).toEqual([0, 0, 0]);
  });

  describe("auth", () => {
    it("refuses a missing token and a wrong one with the same answer", async () => {
      const kv = new MemoryKV();
      const missing = await call(env(kv));
      const wrong = await call(env(kv), "not-the-token");
      expect([missing.status, wrong.status]).toEqual([401, 401]);
      expect(await missing.text()).toBe(await wrong.text());
    });

    it("refuses a token that is a prefix of the real one", async () => {
      // A length check that short-circuits would leak the length; a prefix
      // comparison would accept this.
      const response = await call(env(new MemoryKV()), TOKEN.slice(0, 5));
      expect(response.status).toBe(401);
    });

    it("does not read the store before the token is checked", async () => {
      const kv = new MemoryKV();
      const listed = vi.spyOn(kv, "list");
      await call(env(kv), "wrong");
      expect(listed).not.toHaveBeenCalled();
    });

    it("refuses rather than 500s when no token is configured", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const response = await call({ KRS_CACHE: new MemoryKV() });
      expect(response.status).toBe(503);
      vi.restoreAllMocks();
    });

    it("is not shadowed by the /<owner>/<repo> route", async () => {
      // `/admin/metrics` has two segments and would otherwise be answered as a
      // repository named `admin/metrics`.
      const response = await call(env(new MemoryKV()), TOKEN);
      expect(response.status).toBe(200);
    });
  });
});
