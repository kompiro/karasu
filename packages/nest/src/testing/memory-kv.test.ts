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
    await seed(kv, ["sub/v1/2/b", "acct/v1/1", "sub/v1/2/a"]);
    const listed = await kv.list({ prefix: "sub/v1/2/" });
    expect(listed.keys.map((key) => key.name)).toEqual(["sub/v1/2/a", "sub/v1/2/b"]);
    expect(listed.list_complete).toBe(true);
    expect(listed.cursor).toBeUndefined();
  });

  it("paginates with a key-based cursor, like real KV", async () => {
    const kv = new MemoryKV(2);
    await seed(kv, ["sub/v1/9/1", "sub/v1/9/2", "sub/v1/9/3", "sub/v1/9/4", "sub/v1/9/5"]);
    const names: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await kv.list({ prefix: "sub/v1/9/", cursor });
      names.push(...page.keys.map((key) => key.name));
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor !== undefined);
    expect(names).toEqual(["sub/v1/9/1", "sub/v1/9/2", "sub/v1/9/3", "sub/v1/9/4", "sub/v1/9/5"]);
  });

  it("does not skip when keys are deleted mid-walk", async () => {
    // The behaviour a delete-as-you-go caller depends on. An offset cursor
    // would skip every other key here.
    const kv = new MemoryKV(2);
    await seed(kv, ["sub/v1/9/1", "sub/v1/9/2", "sub/v1/9/3", "sub/v1/9/4"]);
    const first = await kv.list({ prefix: "sub/v1/9/" });
    for (const key of first.keys) await kv.delete(key.name);
    const next = await kv.list({ prefix: "sub/v1/9/", cursor: first.cursor });
    expect(next.keys.map((key) => key.name)).toEqual(["sub/v1/9/3", "sub/v1/9/4"]);
  });

  it("caps the page size at the configured maximum", async () => {
    const kv = new MemoryKV(2);
    await seed(kv, ["sub/v1/9/1", "sub/v1/9/2", "sub/v1/9/3"]);
    expect((await kv.list({ prefix: "sub/v1/9/", limit: 100 })).keys).toHaveLength(2);
  });

  it("expires an entry once its TTL has passed", async () => {
    const kv = new MemoryKV();
    await kv.put("sess/v1/9/1", "v", { expirationTtl: 60 });
    kv.advance(59);
    expect(await kv.get("sess/v1/9/1")).toBe("v");
    kv.advance(2);
    expect(await kv.get("sess/v1/9/1")).toBeNull();
    expect((await kv.list({ prefix: "sess/v1/9/" })).keys).toEqual([]);
  });

  it("rejects a TTL the real binding would reject", async () => {
    const kv = new MemoryKV();
    await expect(kv.put("sess/v1/9/1", "v", { expirationTtl: 59 })).rejects.toThrowError(
      /60 seconds/,
    );
  });

  it("keeps an entry with no TTL", async () => {
    const kv = new MemoryKV();
    await kv.put("sub/v1/9/1", "v");
    kv.advance(10_000_000);
    expect(await kv.get("sub/v1/9/1")).toBe("v");
  });

  it("returns null for an absent key and is silent on deleting one", async () => {
    const kv = new MemoryKV();
    expect(await kv.get("nope")).toBeNull();
    await expect(kv.delete("nope")).resolves.toBeUndefined();
  });

  it("refuses a key in no registered space, so a new prefix cannot slip past the registry", async () => {
    // The types refuse this in production code; this refuses it for a key a
    // test spells as a string, which is how a store with no registered space
    // would first be exercised.
    const kv = new MemoryKV();
    await expect(kv.put("meta/v1/42", "{}")).rejects.toThrowError(/no registered key space/);
    await expect(kv.put("acct/v10/42", "{}")).rejects.toThrowError(/no registered key space/);
    expect(kv.keys()).toEqual([]);
  });

  it("refuses an expiry on content and a credential without one", async () => {
    // TPL-2587: the retention is the space's, not the call site's.
    const kv = new MemoryKV();
    await expect(kv.put("sub/v1/42/a", "{}", { expirationTtl: 3600 })).rejects.toThrowError(
      /must not expire/,
    );
    await expect(kv.put("sess/v1/42/a", "{}")).rejects.toThrowError(/must expire/);
    expect(kv.keys()).toEqual([]);
  });

  it("lets a test plant a record the service would not write, but only in a registered space", async () => {
    const kv = new MemoryKV();
    await kv.plant("sess/v1/42/a", "{}");
    expect(kv.keys()).toEqual(["sess/v1/42/a"]);
    await expect(kv.plant("meta/v1/42", "{}")).rejects.toThrowError(/no registered key space/);
  });
});
