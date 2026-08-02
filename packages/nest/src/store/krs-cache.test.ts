import { describe, expect, it } from "vitest";
import { MemoryKV } from "../testing/memory-kv.js";
import { KrsCache, markGenerated } from "./krs-cache.js";

const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const ref = { installationId: 42, owner: "kompiro", repo: "karasu", sha: SHA };
const entry = { krs: markGenerated("system Payments {}\n"), generatedAt: "2026-08-02T00:00:00Z" };

describe("markGenerated", () => {
  it("refuses an empty document", () => {
    // An empty `.krs` would cache as a valid negative and be served as a
    // diagram of nothing.
    expect(() => markGenerated("   \n ")).toThrowError(/empty/);
  });
});

describe("KrsCache", () => {
  it("round-trips an entry", async () => {
    const kv = new MemoryKV();
    const cache = new KrsCache(kv);
    await cache.put(ref, entry);
    expect(await cache.get(ref)).toEqual(entry);
  });

  it("misses on a different SHA, so a push does not serve a stale diagram", async () => {
    const kv = new MemoryKV();
    const cache = new KrsCache(kv);
    await cache.put(ref, entry);
    expect(await cache.get({ ...ref, sha: OTHER_SHA })).toBeUndefined();
  });

  it("misses across installations even for the same repo", async () => {
    const kv = new MemoryKV();
    const cache = new KrsCache(kv);
    await cache.put(ref, entry);
    expect(await cache.get({ ...ref, installationId: 43 })).toBeUndefined();
  });

  it("stores the generation timestamp as listable metadata", async () => {
    const kv = new MemoryKV();
    await new KrsCache(kv).put(ref, entry);
    expect(kv.puts[0]?.options?.metadata).toEqual({ generatedAt: entry.generatedAt });
    const listed = await kv.list({ prefix: "krs/v1/42/" });
    expect(listed.keys[0]?.metadata).toEqual({ generatedAt: entry.generatedAt });
  });

  it("applies a TTL as a growth backstop", async () => {
    const kv = new MemoryKV();
    await new KrsCache(kv, { ttlSeconds: 60 }).put(ref, entry);
    expect(kv.puts[0]?.options?.expirationTtl).toBe(60);
    kv.advance(61);
    expect(await new KrsCache(kv).get(ref)).toBeUndefined();
  });

  it("treats an unreadable value as a miss rather than a permanent failure", async () => {
    const kv = new MemoryKV();
    const cache = new KrsCache(kv);
    await cache.put(ref, entry);
    await kv.put(kv.keys()[0] as string, "not json");
    // A miss lets the next generation overwrite it; throwing would make one
    // bad entry a permanent error for that repo.
    expect(await cache.get(ref)).toBeUndefined();
  });

  it("treats a structurally wrong value as a miss", async () => {
    const kv = new MemoryKV();
    const cache = new KrsCache(kv);
    await cache.put(ref, entry);
    await kv.put(kv.keys()[0] as string, JSON.stringify({ krs: 42 }));
    expect(await cache.get(ref)).toBeUndefined();
  });

  it("deletes one SHA without touching the rest of the repo", async () => {
    const kv = new MemoryKV();
    const cache = new KrsCache(kv);
    await cache.put(ref, entry);
    await cache.put({ ...ref, sha: OTHER_SHA }, entry);
    await cache.delete(ref);
    expect(await cache.get(ref)).toBeUndefined();
    expect(await cache.get({ ...ref, sha: OTHER_SHA })).toEqual(entry);
  });

  it("is silent when deleting a key that is not there", async () => {
    await expect(new KrsCache(new MemoryKV()).delete(ref)).resolves.toBeUndefined();
  });

  describe("purgeInstallation", () => {
    it("deletes everything the installation produced and nothing else", async () => {
      const kv = new MemoryKV();
      const cache = new KrsCache(kv);
      await cache.put(ref, entry);
      await cache.put({ ...ref, sha: OTHER_SHA }, entry);
      await cache.put({ ...ref, repo: "hane" }, entry);
      await cache.put({ ...ref, installationId: 43 }, entry);

      expect(await cache.purgeInstallation(42)).toBe(3);
      expect(kv.keys()).toEqual([`krs/v1/43/kompiro/karasu/${SHA}`]);
    });

    it("does not stop at the first page", async () => {
      // The uninstall path is the one operation that must not half-finish, and
      // a purge that ignores the cursor half-finishes at exactly 1000 keys.
      const kv = new MemoryKV(2);
      const cache = new KrsCache(kv);
      for (let index = 0; index < 7; index += 1) {
        await cache.put({ ...ref, sha: index.toString(16).padStart(40, "0") }, entry);
      }
      expect(await cache.purgeInstallation(42)).toBe(7);
      expect(kv.keys()).toEqual([]);
    });

    it("reports zero rather than failing when there is nothing to delete", async () => {
      expect(await new KrsCache(new MemoryKV()).purgeInstallation(42)).toBe(0);
    });

    it("does not reach a neighbouring installation whose id shares a prefix", async () => {
      const kv = new MemoryKV();
      const cache = new KrsCache(kv);
      await cache.put({ ...ref, installationId: 4 }, entry);
      await cache.put({ ...ref, installationId: 42 }, entry);
      expect(await cache.purgeInstallation(4)).toBe(1);
      expect(kv.keys()).toEqual([`krs/v1/42/kompiro/karasu/${SHA}`]);
    });
  });

  describe("purgeRepo", () => {
    it("deletes every SHA for one repo and leaves siblings alone", async () => {
      const kv = new MemoryKV();
      const cache = new KrsCache(kv);
      await cache.put(ref, entry);
      await cache.put({ ...ref, sha: OTHER_SHA }, entry);
      await cache.put({ ...ref, repo: "hane" }, entry);

      expect(await cache.purgeRepo(ref)).toBe(2);
      expect(kv.keys()).toEqual([`krs/v1/42/kompiro/hane/${SHA}`]);
    });

    it("purges regardless of the casing it is handed", async () => {
      const kv = new MemoryKV();
      const cache = new KrsCache(kv);
      await cache.put(ref, entry);
      expect(await cache.purgeRepo({ ...ref, owner: "Kompiro", repo: "KARASU" })).toBe(1);
      expect(kv.keys()).toEqual([]);
    });

    it("does not reach a repo whose name extends this one", async () => {
      const kv = new MemoryKV();
      const cache = new KrsCache(kv);
      await cache.put({ ...ref, repo: "kara" }, entry);
      await cache.put({ ...ref, repo: "karasu" }, entry);
      expect(await cache.purgeRepo({ ...ref, repo: "kara" })).toBe(1);
      expect(kv.keys()).toEqual([`krs/v1/42/kompiro/karasu/${SHA}`]);
    });
  });
});
