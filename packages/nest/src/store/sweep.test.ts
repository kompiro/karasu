/**
 * The two branches that only fire when KV misbehaves.
 *
 * `purgeByPrefix` carries a promise — account deletion removes everything —
 * and two safeguards that exist solely for the ways an eventually-consistent
 * store can fail: a key re-listed before its delete propagates must not be
 * counted twice, and a prefix that never drains must be reported rather than
 * looped on. Neither is reachable from an ordinary purge, so neither is
 * covered by `gallery-purge-coverage.test.ts`.
 *
 * That gap has been found here once before. #2296 shipped the same loop in
 * `krs-cache.ts` with both branches untested, and review caught it: the one
 * path whose entire job is to turn a silent partial purge into a visible
 * failure would have shipped unverified, and an off-by-one in the loop bound
 * or a `throw` quietly downgraded to a `return` would not have failed a single
 * test. `sweep.ts` is that loop extracted for the stores that sweep, so the
 * same gap would now be shared rather than repeated.
 */
import { describe, expect, it } from "vitest";
import { purgeByPrefix } from "./sweep.js";
import { MemoryKV } from "../testing/memory-kv.js";

const seed = async (kv: MemoryKV, keys: readonly string[]): Promise<void> => {
  for (const key of keys) await kv.put(key, "{}");
};

describe("purgeByPrefix", () => {
  it("deletes everything under the prefix and reports how many", async () => {
    const kv = new MemoryKV();
    await seed(kv, ["sub/v1/42/a", "sub/v1/42/b", "sub/v1/42/c"]);
    expect(await purgeByPrefix(kv, "sub/v1/42/")).toBe(3);
    expect((await kv.list({ prefix: "sub/v1/42/" })).keys).toEqual([]);
  });

  it("leaves keys outside the prefix alone", async () => {
    const kv = new MemoryKV();
    await seed(kv, ["sub/v1/42/a", "sub/v1/420/a", "acct/v1/42"]);
    expect(await purgeByPrefix(kv, "sub/v1/42/")).toBe(1);
    expect((await kv.list({ limit: 100 })).keys.map((key) => key.name)).toEqual([
      "acct/v1/42",
      "sub/v1/420/a",
    ]);
  });

  it("counts a re-listed key once", async () => {
    // KV's list is eventually consistent, so a key can come back on a later
    // page before its delete has propagated. Counting it twice would report a
    // purge as larger than it was -- and the number is what the caller shows
    // a submitter who just deleted their account.
    const kv = new MemoryKV();
    await seed(kv, ["sub/v1/42/a"]);
    let replayed = false;
    const original = kv.list.bind(kv);
    kv.list = async (options) => {
      const page = await original(options);
      if (page.keys.length === 0 && !replayed) {
        replayed = true;
        return { keys: [{ name: "sub/v1/42/a" }], list_complete: true };
      }
      return page;
    };
    expect(await purgeByPrefix(kv, "sub/v1/42/")).toBe(1);
  });

  it("fails loudly rather than looping when deletes do not stick", async () => {
    // The one branch whose entire job is to turn a silent partial purge into a
    // visible failure. Reporting success here would tell someone their account
    // was deleted when it was not.
    const kv = new MemoryKV();
    await seed(kv, ["sub/v1/42/a"]);
    kv.delete = () => Promise.resolve();
    await expect(purgeByPrefix(kv, "sub/v1/42/", 3)).rejects.toThrowError(/did not converge/);
  });

  it("names the prefix it gave up on, so the failure is actionable", async () => {
    const kv = new MemoryKV();
    await seed(kv, ["sub/v1/42/a"]);
    kv.delete = () => Promise.resolve();
    await expect(purgeByPrefix(kv, "sub/v1/42/", 2)).rejects.toThrowError(/sub\/v1\/42\//);
  });

  it("returns zero for a prefix with nothing under it", async () => {
    expect(await purgeByPrefix(new MemoryKV(), "sub/v1/42/")).toBe(0);
  });
});
