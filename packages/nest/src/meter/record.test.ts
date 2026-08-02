import { describe, expect, it } from "vitest";
import { MemoryKV } from "../testing/memory-kv.js";
import { MetricsStore, type RunMetrics } from "./record.js";

const SHA = "a".repeat(40);

function metrics(overrides: Partial<RunMetrics> = {}): RunMetrics {
  return {
    sha: SHA,
    finishedAt: "2026-08-02T12:00:00Z",
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
    expect(await store.get(ref, SHA)).toEqual(metrics());
  });

  it("keys on the commit, so re-generating the same repo does not overwrite history", async () => {
    const store = new MetricsStore(new MemoryKV());
    const other = "b".repeat(40);
    await store.record(ref, metrics());
    await store.record(ref, metrics({ sha: other, outputTokens: 10 }));
    const total = await store.summarise();
    expect([total.runs, total.outputTokens]).toEqual([2, 300_010]);
  });

  it("keeps no repository content in the body", async () => {
    // A metrics store is the classic sideways leak: it outlives the run, it is
    // read by different code, and nobody thinks of it as holding source.
    const kv = new MemoryKV();
    await new MetricsStore(kv).record(ref, metrics());
    const raw = (await kv.get(`metrics/krs/v1/42/kompiro/shop/${SHA}`)) ?? "";
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual([
      "bytesRead",
      "durationMs",
      "files",
      "finishedAt",
      "inputTokens",
      "model",
      "outputTokens",
      "passes",
      "redactions",
      "sha",
      "unreadableFiles",
    ]);
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

    it("skips a corrupt record rather than refusing to produce a report", async () => {
      const kv = new MemoryKV();
      const store = new MetricsStore(kv);
      await store.record(ref, metrics());
      await kv.put(`metrics/krs/v1/42/kompiro/shop/${"c".repeat(40)}`, "{not json");
      expect((await store.summarise()).runs).toBe(1);
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
