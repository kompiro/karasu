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
 * `SEEDERS` is deliberately a short list a reviewer can read, and it is no
 * longer one that can fall behind. It is typed as a `Record` over the
 * registered key spaces (`GALLERY_KEY_SPACES` in `gallery-keys.ts`), and the
 * stores cannot write a key outside them, so a new space does not compile
 * until it has a seeder here, and from then on every case below runs it
 * through `GalleryStore.purgeAccount`. A space registered without wiring the
 * purge is caught by the compiler in `gallery-store.ts`; one whose purge
 * leaves something behind is caught here.
 *
 * See TPL-2226. The generation-side twin is `nest-purge-coverage.test.ts`,
 * which #2590 removes along with the service it guards.
 */
import { describe, expect, it } from "vitest";
import { AccountStore } from "./accounts.js";
import { GALLERY_KEY_SPACES, type GalleryKeySpace } from "./gallery-keys.js";
import { GalleryStore } from "./gallery-store.js";
import { SessionStore } from "./sessions.js";
import { SubmissionStore } from "./submissions.js";
import { MemoryKV } from "../testing/memory-kv.js";

const ACCOUNT = 42;
const at = new Date("2026-08-02T00:00:00Z");

type Seeder = (kv: MemoryKV, accountId: number) => Promise<void>;

/** One writer per registered key space, through the store that owns it. */
const SEEDERS: Record<GalleryKeySpace, Seeder> = {
  accounts: async (kv, accountId) => {
    await new AccountStore(kv).signIn(accountId, "kompiro", at);
  },
  sessions: async (kv, accountId) => {
    await new SessionStore(kv).issue(accountId, "kompiro", at);
  },
  submissions: async (kv, accountId) => {
    await new SubmissionStore(kv).create(accountId, { title: "Shop", krs: "system Shop {}\n" }, at);
  },
};

const SPACES = Object.keys(GALLERY_KEY_SPACES) as GalleryKeySpace[];

async function seedEverything(kv: MemoryKV, accountId: number): Promise<void> {
  for (const space of SPACES) await SEEDERS[space](kv, accountId);
}

const remaining = async (kv: MemoryKV): Promise<string[]> =>
  (await kv.list({ limit: 1000 })).keys.map((key) => key.name);

describe("account purge coverage", () => {
  it("leaves nothing behind when an account is deleted", async () => {
    const kv = new MemoryKV();
    await seedEverything(kv, ACCOUNT);
    expect((await remaining(kv)).length).toBe(SPACES.length);

    await new GalleryStore(kv).purgeAccount(ACCOUNT);
    expect(await remaining(kv)).toEqual([]);
  });

  it("can run again on a purged account, and reports nothing the second time", async () => {
    // A purge interrupted halfway is retried by running it again, so a
    // second run has to be harmless: no throw, and zero in every space.
    const kv = new MemoryKV();
    await seedEverything(kv, ACCOUNT);
    const store = new GalleryStore(kv);
    await store.purgeAccount(ACCOUNT);
    expect(await store.purgeAccount(ACCOUNT)).toEqual(
      Object.fromEntries(SPACES.map((space) => [space, 0])),
    );
  });

  it("covers every prefix the gallery writes, so a new one is noticed", async () => {
    // The type makes a seeder exist for every space; this makes each one
    // actually write into the space it is filed under, so a seeder that wrote
    // somewhere else (or stopped writing) cannot reduce the check to
    // nothing while the ledger still looks complete.
    for (const space of SPACES) {
      const kv = new MemoryKV();
      await SEEDERS[space](kv, ACCOUNT);
      const keys = await remaining(kv);
      expect(keys.length).toBeGreaterThan(0);
      expect(keys.every((key) => key.startsWith(`${GALLERY_KEY_SPACES[space].prefix}/`))).toBe(
        true,
      );
    }
  });

  it("counts what it deleted in every category", async () => {
    // A purge reporting zeroes while deleting things is indistinguishable
    // from one that deleted nothing. Each seeder writes one record, so every
    // registered space has to report exactly one. Built from the registry,
    // so a new space is expected in the result without anyone adding it here.
    const kv = new MemoryKV();
    await seedEverything(kv, ACCOUNT);
    expect(await new GalleryStore(kv).purgeAccount(ACCOUNT)).toEqual(
      Object.fromEntries(SPACES.map((space) => [space, 1])),
    );
  });

  it("touches nothing belonging to an account whose id merely extends it", async () => {
    // `acct/v1/42` is a textual prefix of `acct/v1/420`. Getting this wrong
    // deletes a stranger's account on someone else's request.
    const kv = new MemoryKV();
    await seedEverything(kv, ACCOUNT);
    await seedEverything(kv, 420);

    await new GalleryStore(kv).purgeAccount(ACCOUNT);
    const left = await remaining(kv);
    expect(left.length).toBe(SPACES.length);
    expect(left.every((key) => key.includes("420"))).toBe(true);
  });
});

describe("GalleryStore.authenticate", () => {
  it("resolves a live session to its account", async () => {
    const kv = new MemoryKV();
    const store = new GalleryStore(kv);
    await store.accounts.signIn(ACCOUNT, "kompiro", at);
    const { sessionId } = await store.sessions.issue(ACCOUNT, "kompiro", new Date());
    expect((await store.authenticate("42", sessionId))?.account.login).toBe("kompiro");
  });

  it("reads a deleted account's surviving cookie as not signed in", async () => {
    // Sessions go first in the purge, so this state is what a lost write looks
    // like rather than something deletion produces. The deletion still wins.
    const kv = new MemoryKV();
    const store = new GalleryStore(kv);
    await store.accounts.signIn(ACCOUNT, "kompiro", at);
    const { sessionId } = await store.sessions.issue(ACCOUNT, "kompiro", new Date());
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
