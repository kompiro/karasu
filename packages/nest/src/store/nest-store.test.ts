import { describe, expect, it } from "vitest";
import { MemoryKV } from "../testing/memory-kv.js";
import { KrsCache, markGenerated } from "./krs-cache.js";
import { NestStore } from "./nest-store.js";
import { RepoDirectory } from "./repo-directory.js";

const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const ref = { installationId: 42, owner: "kompiro", repo: "karasu", sha: SHA };
const entry = { krs: markGenerated("system Payments {}\n"), generatedAt: "2026-08-02T00:00:00Z" };

describe("NestStore", () => {
  it("makes a published document reachable by owner and repo alone", async () => {
    const store = new NestStore(new MemoryKV());
    await store.publish(ref, entry);
    expect(await store.latest("kompiro", "karasu")).toEqual({
      ...entry,
      installationId: "42",
      sha: SHA,
    });
  });

  it("resolves regardless of the casing in the URL", async () => {
    const store = new NestStore(new MemoryKV());
    await store.publish(ref, entry);
    expect(await store.latest("Kompiro", "KARASU")).toBeDefined();
  });

  it("returns undefined for a repo nothing was published for", async () => {
    expect(await new NestStore(new MemoryKV()).latest("kompiro", "karasu")).toBeUndefined();
  });

  it("moves the pointer to the newest SHA", async () => {
    const store = new NestStore(new MemoryKV());
    await store.publish(ref, entry);
    const second = { ...entry, generatedAt: "2026-08-03T00:00:00Z" };
    await store.publish({ ...ref, sha: OTHER_SHA }, second);
    expect((await store.latest("kompiro", "karasu"))?.sha).toBe(OTHER_SHA);
  });

  it("records a zero-padded installation id canonically", async () => {
    const kv = new MemoryKV();
    const store = new NestStore(kv);
    await store.publish({ ...ref, installationId: "0042" }, entry);
    expect((await store.latest("kompiro", "karasu"))?.installationId).toBe("42");
    // And a purge given the other spelling still reaches both halves.
    expect(await store.purgeInstallation(42)).toEqual({
      documents: 1,
      pointers: 1,
      runs: 0,
      metrics: 0,
      reads: 0,
      failed: 0,
    });
  });

  it("expires the pointer with the document, so no orphan outlives an uninstall", async () => {
    // The purge derives its repo list from live documents. A pointer that
    // outlived its document would never appear in that list, and would go on
    // naming a revoked installation forever — the exact promise ADR-1990
    // decision 6 makes.
    const kv = new MemoryKV();
    const store = new NestStore(kv, new KrsCache(kv, { ttlSeconds: 60 }));
    await store.publish(ref, entry);
    kv.advance(61);
    expect(kv.keys()).toEqual([]);
    expect(await store.latest("kompiro", "karasu")).toBeUndefined();
  });

  it("reads a pointer with no document as nothing generated", async () => {
    // The state a half-finished purge leaves behind. The honest answer to a
    // reader is the same as for a repo that was never generated.
    const kv = new MemoryKV();
    const store = new NestStore(kv);
    await new RepoDirectory(kv).publish(
      "kompiro",
      "karasu",
      { installationId: "42", sha: SHA, generatedAt: entry.generatedAt },
      3600,
    );
    expect(await store.latest("kompiro", "karasu")).toBeUndefined();
  });

  describe("purgeInstallation", () => {
    it("removes documents and pointers together", async () => {
      const kv = new MemoryKV();
      const store = new NestStore(kv);
      await store.publish(ref, entry);
      await store.publish({ ...ref, sha: OTHER_SHA }, entry);
      await store.publish({ ...ref, repo: "hane" }, entry);

      expect(await store.purgeInstallation(42)).toEqual({
        documents: 3,
        pointers: 2,
        runs: 0,
        metrics: 0,
        reads: 0,
        failed: 0,
      });
      expect(kv.keys()).toEqual([]);
      expect(await store.latest("kompiro", "karasu")).toBeUndefined();
    });

    it("leaves another installation's documents and pointers alone", async () => {
      const kv = new MemoryKV();
      const store = new NestStore(kv);
      await store.publish(ref, entry);
      await store.publish({ ...ref, installationId: 43, repo: "hane" }, entry);

      expect(await store.purgeInstallation(42)).toEqual({
        documents: 1,
        pointers: 1,
        runs: 0,
        metrics: 0,
        reads: 0,
        failed: 0,
      });
      expect(await store.latest("kompiro", "hane")).toBeDefined();
    });

    it("does not delete a pointer a newer installation has taken over", async () => {
      // A repo moving between installations: the old installation's uninstall
      // must not unpublish what the new one just published.
      const kv = new MemoryKV();
      const store = new NestStore(kv);
      await store.publish(ref, entry);
      await store.publish({ ...ref, installationId: 43, sha: OTHER_SHA }, entry);

      // The old installation's documents still go; only the pointer stays,
      // because it now belongs to someone else.
      expect(await store.purgeInstallation(42)).toEqual({
        documents: 1,
        pointers: 0,
        runs: 0,
        metrics: 0,
        reads: 0,
        failed: 0,
      });
      expect((await store.latest("kompiro", "karasu"))?.installationId).toBe("43");
    });

    it("reports zeroes rather than failing for an installation with nothing stored", async () => {
      expect(await new NestStore(new MemoryKV()).purgeInstallation(42)).toEqual({
        documents: 0,
        pointers: 0,
        runs: 0,
        metrics: 0,
        reads: 0,
        failed: 0,
      });
    });

    it("collects the repo list before deleting the keys it is derived from", async () => {
      // Reading it after the purge would find nothing, so the pointer would
      // survive the uninstall and keep claiming a diagram exists.
      const kv = new MemoryKV(1);
      const store = new NestStore(kv);
      for (const repo of ["a", "b", "c"]) await store.publish({ ...ref, repo }, entry);
      expect(await store.purgeInstallation(42)).toEqual({
        documents: 3,
        pointers: 3,
        runs: 0,
        metrics: 0,
        reads: 0,
        failed: 0,
      });
      expect(kv.keys()).toEqual([]);
    });
  });

  describe("purgeRepo", () => {
    it("removes one repo's documents and pointer", async () => {
      const kv = new MemoryKV();
      const store = new NestStore(kv);
      await store.publish(ref, entry);
      await store.publish({ ...ref, sha: OTHER_SHA }, entry);
      await store.publish({ ...ref, repo: "hane" }, entry);

      expect(await store.purgeRepo(ref)).toEqual({
        documents: 2,
        pointers: 1,
        runs: 0,
        metrics: 0,
        reads: 0,
        failed: 0,
      });
      expect(await store.latest("kompiro", "karasu")).toBeUndefined();
      expect(await store.latest("kompiro", "hane")).toBeDefined();
    });

    it("does not remove a pointer owned by a different installation", async () => {
      const kv = new MemoryKV();
      const store = new NestStore(kv);
      await store.publish({ ...ref, installationId: 43 }, entry);
      expect(await store.purgeRepo({ ...ref, installationId: 42 })).toEqual({
        documents: 0,
        pointers: 0,
        runs: 0,
        metrics: 0,
        reads: 0,
        failed: 0,
      });
      expect(await store.latest("kompiro", "karasu")).toBeDefined();
    });
  });
});
