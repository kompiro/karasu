import { describe, expect, it, vi } from "vitest";
import { MemoryKV } from "../testing/memory-kv.js";
import { MetricsStore, type RunMetrics } from "./record.js";

const SHA = "a".repeat(40);

function metrics(overrides: Partial<RunMetrics> = {}): RunMetrics {
  return {
    sha: SHA,
    finishedAt: "2026-08-02T12:00:00Z",
    outcome: "done",
    model: "claude-opus-5",
    durationMs: 900_000,
    inputTokens: 400_000,
    outputTokens: 300_000,
    passes: [{ name: "survey", inputTokens: 100_000, outputTokens: 20_000 }],
    files: 85,
    bytesRead: 1_200_000,
    redactions: 3,
    unreadableFiles: 0,
    ...overrides,
  };
}

const ref = { installationId: "42", owner: "kompiro", repo: "shop" };

describe("MetricsStore", () => {
  it("round-trips a run record", async () => {
    const store = new MetricsStore(new MemoryKV());
    await store.record(ref, metrics());
    expect(await store.latestFor(ref, SHA)).toEqual(metrics());
  });

  it("keys on the commit, so re-generating the same repo does not overwrite history", async () => {
    const store = new MetricsStore(new MemoryKV());
    const other = "b".repeat(40);
    await store.record(ref, metrics());
    await store.record(ref, metrics({ sha: other, outputTokens: 10 }));
    const total = await store.summarise();
    expect([total.runs, total.outputTokens]).toEqual([2, 300_010]);
  });

  it("keeps every attempt at one commit, because every attempt was billed", async () => {
    // A Workflow retries. Keying on the commit alone would let a successful
    // third attempt overwrite the two that were also paid for.
    const store = new MetricsStore(new MemoryKV());
    await store.record(ref, metrics({ finishedAt: "2026-08-02T12:00:00Z", outcome: "failed" }));
    await store.record(ref, metrics({ finishedAt: "2026-08-02T12:20:00Z", outcome: "failed" }));
    await store.record(ref, metrics({ finishedAt: "2026-08-02T12:40:00Z" }));

    const total = await store.summarise();
    expect([total.runs, total.failedRuns]).toEqual([3, 2]);
    expect(await store.attemptsFor(ref, SHA)).toBe(3);
    // The latest attempt is the one a status reader wants.
    expect((await store.latestFor(ref, SHA))?.finishedAt).toBe("2026-08-02T12:40:00Z");
  });

  it("keeps no repository content in the body", async () => {
    // A metrics store is the classic sideways leak: it outlives the run, it is
    // read by different code, and nobody thinks of it as holding source.
    const kv = new MemoryKV();
    await new MetricsStore(kv).record(ref, metrics());
    const raw = (await kv.get(`metrics/krs/v1/42/kompiro/shop/${SHA}/2026-08-02T12:00:00Z`)) ?? "";
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual([
      "bytesRead",
      "durationMs",
      "files",
      "finishedAt",
      "inputTokens",
      "model",
      "outcome",
      "outputTokens",
      "passes",
      "redactions",
      "sha",
      "unreadableFiles",
    ]);
  });

  it("adds only structural fields when a run failed to parse", async () => {
    // The failure record is the one thing that outlives a run, so it carries
    // why -- but a diagnostic's token value would be the generated text, and
    // "no repository content in the body" does not bend for debugging.
    const kv = new MemoryKV();
    await new MetricsStore(kv).record(
      ref,
      metrics({
        outcome: "failed",
        diagnostics: [{ code: "unexpected-token-in-block", blockKind: "domain", at: "42:7" }],
      }),
    );
    const raw = (await kv.get(`metrics/krs/v1/42/kompiro/shop/${SHA}/2026-08-02T12:00:00Z`)) ?? "";
    const parsed = JSON.parse(raw) as { diagnostics?: Record<string, unknown>[] };
    expect(Object.keys(parsed.diagnostics?.[0] ?? {}).sort()).toEqual(["at", "blockKind", "code"]);
  });

  describe("summarise", () => {
    it("splits token totals by model, because costs cannot be summed across them", async () => {
      const store = new MetricsStore(new MemoryKV());
      await store.record(ref, metrics());
      await store.record(ref, metrics({ sha: "b".repeat(40), model: "claude-haiku-4-5" }));
      const total = await store.summarise();
      expect(Object.keys(total.byModel).sort()).toEqual(["claude-haiku-4-5", "claude-opus-5"]);
      expect(total.byModel["claude-opus-5"]?.runs).toBe(1);
    });

    it("reports percentiles, not just a mean", async () => {
      // A mean hides the tail, and the tail is what decides whether a poll
      // interval and a quota are survivable.
      const store = new MetricsStore(new MemoryKV());
      const durations = [60_000, 120_000, 180_000, 240_000, 1_800_000];
      for (const [index, durationMs] of durations.entries()) {
        await store.record(
          ref,
          metrics({ sha: index.toString(16).repeat(40).slice(0, 40), durationMs }),
        );
      }
      const total = await store.summarise();
      expect([total.runs, total.durationP50Ms, total.durationP95Ms]).toEqual([
        5, 180_000, 1_800_000,
      ]);
    });

    it("scopes to one installation when asked, and the whole deploy otherwise", async () => {
      const store = new MetricsStore(new MemoryKV());
      await store.record(ref, metrics());
      await store.record({ ...ref, installationId: "99" }, metrics({ outputTokens: 7 }));
      const mine = await store.summarise("42");
      const everything = await store.summarise();
      expect([mine.runs, everything.runs]).toEqual([1, 2]);
    });

    it("counts a record with no usable summary as skipped, not as a run", async () => {
      // A report that refuses to produce a number because one key is corrupt
      // is a report nobody uses; one that silently drops it is worse.
      const kv = new MemoryKV();
      const store = new MetricsStore(kv);
      await store.record(ref, metrics());
      await kv.put(`metrics/krs/v1/42/kompiro/shop/${"c".repeat(40)}/x`, "{not json");
      const total = await store.summarise();
      expect([total.runs, total.skipped]).toEqual([1, 1]);
    });

    it("reads its totals from list metadata, not by fetching every record", async () => {
      // One `get` per key would cap this report at roughly a thousand runs,
      // which is when it first becomes worth reading (Workers subrequests).
      const kv = new MemoryKV();
      const store = new MetricsStore(kv);
      await store.record(ref, metrics());
      const fetched = vi.spyOn(kv, "get");
      await store.summarise();
      expect(fetched).not.toHaveBeenCalled();
    });

    it("does not lose a model whose name collides with an object prototype key", async () => {
      // The name comes from the provider. On an object literal, `__proto__`
      // writes to the prototype and the entry vanishes from the report --
      // the exact silent omission the cost report exists to prevent.
      const store = new MetricsStore(new MemoryKV());
      await store.record(ref, metrics({ model: "__proto__" }));
      const total = await store.summarise();
      expect(Object.keys(total.byModel)).toEqual(["__proto__"]);
      expect(total.runs).toBe(1);
    });

    it("answers zero rather than NaN when nothing has run", async () => {
      const total = await new MetricsStore(new MemoryKV()).summarise();
      expect([total.runs, total.durationP50Ms, total.durationP95Ms]).toEqual([0, 0, 0]);
    });
  });

  describe("purge", () => {
    it("takes cost records with the rest of an installation", async () => {
      // ADR-1990 decision 6 has no "except the token counts" clause, and the
      // key holds the owner and repo names even though the body does not.
      const store = new MetricsStore(new MemoryKV());
      await store.record(ref, metrics());
      await store.record({ ...ref, repo: "other" }, metrics());
      await store.record({ ...ref, installationId: "99" }, metrics());

      expect(await store.purgeInstallation("42")).toBe(2);
      expect((await store.summarise()).runs).toBe(1);
    });

    it("folds a padded installation id to the same scope", async () => {
      // TPL-2284: two spellings of one id must not become two prefixes, or a
      // purge clears the one nobody wrote under.
      const store = new MetricsStore(new MemoryKV());
      await store.record(ref, metrics());
      expect(await store.purgeInstallation("042")).toBe(1);
    });

    it("removes one repo's records when it leaves an installation", async () => {
      const store = new MetricsStore(new MemoryKV());
      await store.record(ref, metrics());
      await store.record({ ...ref, repo: "other" }, metrics());
      expect(await store.deleteRepo(ref)).toBe(1);
      expect((await store.summarise()).runs).toBe(1);
    });

    it("does not let a repo prefix swallow a longer neighbour", async () => {
      const store = new MetricsStore(new MemoryKV());
      await store.record({ ...ref, repo: "shop" }, metrics());
      await store.record({ ...ref, repo: "shopfront" }, metrics());
      expect(await store.deleteRepo({ ...ref, repo: "shop" })).toBe(1);
      expect((await store.summarise()).runs).toBe(1);
    });
  });
});
