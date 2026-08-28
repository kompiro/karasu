/**
 * Account deletion is a promise, so it gets a machine check rather than a
 * habit.
 *
 * The console exists to take routine withdrawal requests off a human's queue
 * (#2589), and the heaviest of those is "remove everything and close my
 * account". If a new feature adds a KV prefix and forgets the purge, the
 * button keeps reporting success while leaving keys behind that name someone
 * who asked to be gone — silently, because the code goes on working and only
 * the promise breaks.
 *
 * That is exactly what happened once already on the generation side: `reads/`
 * was added in #2226 and not swept, in a change whose own comment explained
 * why metrics had to be. So the check here is behavioural rather than
 * structural: write something under every prefix the gallery uses, purge, and
 * assert the store is empty.
 *
 * `SEEDERS` is deliberately a short list a reviewer can read. A prefix nobody
 * adds here is the failure this file cannot catch by itself; a prefix added
 * here without wiring the purge is the failure it catches immediately.
 *
 * See TPL-2226. The generation-side twin is `nest-purge-coverage.test.ts`,
 * which #2590 removes along with the service it guards.
 */
import { describe, expect, it } from "vitest";
import { AccountStore } from "./accounts.js";
import { GalleryStore } from "./gallery-store.js";
import { SessionStore } from "./sessions.js";
import { MemoryKV } from "../testing/memory-kv.js";

const ACCOUNT = 42;
const at = new Date("2026-08-02T00:00:00Z");

/** One writer per KV prefix the gallery uses. */
const SEEDERS: { prefix: string; seed: (kv: MemoryKV, accountId: number) => Promise<void> }[] = [
  {
    prefix: "acct/",
    seed: async (kv, accountId) => {
      await new AccountStore(kv).signIn(accountId, "kompiro", at);
    },
  },
  {
    prefix: "sess/",
    seed: async (kv, accountId) => {
      await new SessionStore(kv).issue(accountId, "kompiro", at);
    },
  },
];

async function seedEverything(kv: MemoryKV, accountId: number): Promise<void> {
  for (const { seed } of SEEDERS) await seed(kv, accountId);
}

const remaining = async (kv: MemoryKV): Promise<string[]> =>
  (await kv.list({ limit: 1000 })).keys.map((key) => key.name);

describe("account purge coverage", () => {
  it("leaves nothing behind when an account is deleted", async () => {
    const kv = new MemoryKV();
    await seedEverything(kv, ACCOUNT);
    expect((await remaining(kv)).length).toBe(SEEDERS.length);

    await new GalleryStore(kv).purgeAccount(ACCOUNT);
    expect(await remaining(kv)).toEqual([]);
  });

  it("covers every prefix the gallery writes, so a new one is noticed", async () => {
    // The ledger above is what a reviewer reads; this asserts the seeded keys
    // really do span the prefixes it claims, so a seeder that stopped writing
    // does not silently reduce the check to nothing.
    const kv = new MemoryKV();
    await seedEverything(kv, ACCOUNT);
    const keys = await remaining(kv);
    for (const { prefix } of SEEDERS) {
      expect(keys.some((key) => key.startsWith(prefix))).toBe(true);
    }
  });

  it("counts what it deleted in every category", async () => {
    // A purge reporting zeroes while deleting things is indistinguishable
    // from one that deleted nothing.
    const kv = new MemoryKV();
    await seedEverything(kv, ACCOUNT);
    expect(await new GalleryStore(kv).purgeAccount(ACCOUNT)).toEqual({
      accounts: 1,
      sessions: 1,
    });
  });

  it("touches nothing belonging to an account whose id merely extends it", async () => {
    // `acct/v1/42` is a textual prefix of `acct/v1/420`. Getting this wrong
    // deletes a stranger's account on someone else's request.
    const kv = new MemoryKV();
    await seedEverything(kv, ACCOUNT);
    await seedEverything(kv, 420);

    await new GalleryStore(kv).purgeAccount(ACCOUNT);
    const left = await remaining(kv);
    expect(left.length).toBe(SEEDERS.length);
    expect(left.every((key) => key.includes("420"))).toBe(true);
  });
});

describe("GalleryStore.authenticate", () => {
  it("resolves a live session to its account", async () => {
    const kv = new MemoryKV();
    const store = new GalleryStore(kv);
    await store.accounts.signIn(ACCOUNT, "kompiro", at);
    const { sessionId } = await store.sessions.issue(ACCOUNT, "kompiro", at);
    expect((await store.authenticate("42", sessionId))?.account.login).toBe("kompiro");
  });

  it("reads a deleted account's surviving cookie as not signed in", async () => {
    // Sessions go first in the purge, so this state is what a lost write looks
    // like rather than something deletion produces. The deletion still wins.
    const kv = new MemoryKV();
    const store = new GalleryStore(kv);
    await store.accounts.signIn(ACCOUNT, "kompiro", at);
    const { sessionId } = await store.sessions.issue(ACCOUNT, "kompiro", at);
    await store.accounts.purgeAccount(ACCOUNT);
    expect(await store.authenticate("42", sessionId)).toBeUndefined();
  });

  it("reads a forged cookie as not signed in rather than as an error", async () => {
    // Expired, revoked and forged all mean the same thing to a caller.
    // Telling them apart in a response would say whether an account exists.
    const store = new GalleryStore(new MemoryKV());
    expect(await store.authenticate("42", "not-a-session-id")).toBeUndefined();
    expect(await store.authenticate("nonsense", "x".repeat(32))).toBeUndefined();
  });
});
