/**
 * The purge is a promise, so it gets a machine check rather than a habit.
 *
 * ADR-1990 decision 6 says uninstalling the App removes what the service
 * stored. Nothing in the type system enforces that: a new feature adds a KV
 * prefix, writes to it, and the purge silently keeps returning success while
 * leaving keys behind that name someone's private repository. That is exactly
 * what happened when `reads/` was added in #2226 — the code that introduced
 * it even carried a comment explaining why metrics must be purged, and did
 * not carry the argument across to the prefix it was adding.
 *
 * So the check is behavioural, not structural: write something under every
 * prefix the package uses, purge, and assert the store is empty. A new prefix
 * that nobody wired into `NestStore` fails here the first time it is written
 * to by a test — and if it is never written to by a test, `SEEDERS` below is
 * the list a reviewer can see is short.
 *
 * See TPL-2226.
 */
import { describe, expect, it } from "vitest";
import { FailedDocumentStore } from "../meter/failed-document.js";
import { ReadCounter } from "../meter/reads.js";
import { MetricsStore } from "../meter/record.js";
import { QuotaLedger } from "../quota/ledger.js";
import { markGenerated } from "./krs-cache.js";
import { NestStore } from "./nest-store.js";
import { RunStatusStore } from "./run-status.js";
import { MemoryKV } from "../testing/memory-kv.js";

const SHA = "a".repeat(40);
const ref = { installationId: "42", owner: "kompiro", repo: "shop" };

/**
 * One writer per KV prefix this package uses.
 *
 * Adding a prefix without adding it here is the failure this file cannot
 * catch by itself; adding it here without wiring the purge is the failure it
 * catches immediately.
 */
const SEEDERS: { prefix: string; seed: (kv: MemoryKV) => Promise<void> }[] = [
  {
    prefix: "krs/",
    seed: async (kv) => {
      await new NestStore(kv).publish(
        { ...ref, sha: SHA },
        { krs: markGenerated("system Shop {}\n"), generatedAt: "2026-08-02T00:00:00Z" },
      );
    },
  },
  {
    prefix: "idx/",
    // Written by the same publish; listed separately so the prefix is named.
    seed: async (kv) => {
      await new NestStore(kv).publish(
        { ...ref, sha: SHA },
        { krs: markGenerated("system Shop {}\n"), generatedAt: "2026-08-02T00:00:00Z" },
      );
    },
  },
  {
    prefix: "runs/",
    seed: async (kv) => {
      await new RunStatusStore(kv).put(ref, {
        state: "done",
        sha: SHA,
        startedAt: "2026-08-02T00:00:00Z",
      });
    },
  },
  {
    prefix: "metrics/",
    seed: async (kv) => {
      await new MetricsStore(kv).record(ref, {
        sha: SHA,
        finishedAt: "2026-08-02T00:15:00Z",
        outcome: "done",
        model: "claude-opus-5",
        durationMs: 900_000,
        inputTokens: 1,
        outputTokens: 1,
        passes: [],
        files: 1,
        bytesRead: 1,
        redactions: 0,
        unreadableFiles: 0,
      });
    },
  },
  {
    prefix: "failed/",
    seed: async (kv) => {
      await new FailedDocumentStore(kv).put(ref, SHA, "system Shop { broken");
    },
  },
  {
    prefix: "reads/",
    seed: async (kv) => {
      await new ReadCounter(kv).increment(ref, new Date("2026-08-02T00:20:00Z"));
    },
  },
  {
    prefix: "quota/",
    seed: async (kv) => {
      await new QuotaLedger(kv).charge("42", new Date("2026-08-02T00:00:00Z"));
    },
  },
];

async function seedEverything(kv: MemoryKV): Promise<void> {
  for (const { seed } of SEEDERS) await seed(kv);
}

const remaining = async (kv: MemoryKV): Promise<string[]> =>
  (await kv.list({ limit: 1000 })).keys.map((key) => key.name);

describe("purge coverage (ADR-1990 decision 6)", () => {
  it("leaves nothing behind when an installation is removed", async () => {
    const kv = new MemoryKV();
    await seedEverything(kv);
    expect((await remaining(kv)).length).toBeGreaterThanOrEqual(SEEDERS.length - 1);

    await new NestStore(kv).purgeInstallation("42");
    expect(await remaining(kv)).toEqual([]);
  });

  it("leaves nothing repo-scoped behind when one repo leaves an installation", async () => {
    const kv = new MemoryKV();
    await seedEverything(kv);

    await new NestStore(kv).purgeRepo(ref);
    // The quota is per installation, and one repo leaving does not hand the
    // month's allowance back. Everything keyed by repo goes.
    expect(await remaining(kv)).toEqual(["quota/krs/v1/42/2026-08"]);
  });

  it("counts what it deleted in every category, so a webhook can say so", async () => {
    // A purge that reports zeroes while deleting things is indistinguishable
    // from one that deleted nothing, and the webhook logs this number.
    const kv = new MemoryKV();
    await seedEverything(kv);
    const result = await new NestStore(kv).purgeInstallation("42");
    expect(result).toEqual({
      documents: 1,
      pointers: 1,
      runs: 1,
      metrics: 1,
      reads: 1,
      quota: 1,
      failed: 1,
    });
  });

  it("touches nothing belonging to another installation", async () => {
    const kv = new MemoryKV();
    await seedEverything(kv);
    const other = { ...ref, installationId: "99" };
    await new MetricsStore(kv).record(other, {
      sha: SHA,
      finishedAt: "2026-08-02T00:15:00Z",
      outcome: "done",
      model: "claude-opus-5",
      durationMs: 1,
      inputTokens: 1,
      outputTokens: 1,
      passes: [],
      files: 1,
      bytesRead: 1,
      redactions: 0,
      unreadableFiles: 0,
    });
    await new ReadCounter(kv).increment(other, new Date("2026-08-02T00:20:00Z"));

    await new NestStore(kv).purgeInstallation("42");
    expect((await remaining(kv)).every((key) => key.includes("/99/"))).toBe(true);
    expect((await remaining(kv)).length).toBe(2);
  });
});
