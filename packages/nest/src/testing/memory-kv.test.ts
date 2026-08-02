import { describe, expect, it } from "vitest";
import { MemoryKV } from "./memory-kv.js";

/**
 * The fake is only useful if it is faithful about the parts the store's
 * correctness rests on: prefix filtering, key order, cursor semantics and TTL.
 * A fake that is wrong here makes correct code look broken, or worse.
 */
describe("MemoryKV", () => {
  const seed = async (kv: MemoryKV, keys: string[]): Promise<void> => {
    for (const key of keys) await kv.put(key, key);
  };

  it("returns keys under a prefix, in sorted order", async () => {
    const kv = new MemoryKV();
    await seed(kv, ["b/2", "a/1", "b/1"]);
    const listed = await kv.list({ prefix: "b/" });
    expect(listed.keys.map((key) => key.name)).toEqual(["b/1", "b/2"]);
    expect(listed.list_complete).toBe(true);
    expect(listed.cursor).toBeUndefined();
  });

  it("paginates with a key-based cursor, like real KV", async () => {
    const kv = new MemoryKV(2);
    await seed(kv, ["k/1", "k/2", "k/3", "k/4", "k/5"]);
    const names: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await kv.list({ prefix: "k/", cursor });
      names.push(...page.keys.map((key) => key.name));
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor !== undefined);
    expect(names).toEqual(["k/1", "k/2", "k/3", "k/4", "k/5"]);
  });

  it("does not skip when keys are deleted mid-walk", async () => {
    // The behaviour a delete-as-you-go caller depends on. An offset cursor
    // would skip every other key here.
    const kv = new MemoryKV(2);
    await seed(kv, ["k/1", "k/2", "k/3", "k/4"]);
    const first = await kv.list({ prefix: "k/" });
    for (const key of first.keys) await kv.delete(key.name);
    const next = await kv.list({ prefix: "k/", cursor: first.cursor });
    expect(next.keys.map((key) => key.name)).toEqual(["k/3", "k/4"]);
  });

  it("caps the page size at the configured maximum", async () => {
    const kv = new MemoryKV(2);
    await seed(kv, ["k/1", "k/2", "k/3"]);
    expect((await kv.list({ prefix: "k/", limit: 100 })).keys).toHaveLength(2);
  });

  it("expires an entry once its TTL has passed", async () => {
    const kv = new MemoryKV();
    await kv.put("k/1", "v", { expirationTtl: 60 });
    kv.advance(59);
    expect(await kv.get("k/1")).toBe("v");
    kv.advance(2);
    expect(await kv.get("k/1")).toBeNull();
    expect((await kv.list({ prefix: "k/" })).keys).toEqual([]);
  });

  it("rejects a TTL the real binding would reject", async () => {
    const kv = new MemoryKV();
    await expect(kv.put("k/1", "v", { expirationTtl: 59 })).rejects.toThrowError(/60 seconds/);
  });

  it("keeps an entry with no TTL", async () => {
    const kv = new MemoryKV();
    await kv.put("k/1", "v");
    kv.advance(10_000_000);
    expect(await kv.get("k/1")).toBe("v");
  });

  it("returns null for an absent key and is silent on deleting one", async () => {
    const kv = new MemoryKV();
    expect(await kv.get("nope")).toBeNull();
    await expect(kv.delete("nope")).resolves.toBeUndefined();
  });
});
