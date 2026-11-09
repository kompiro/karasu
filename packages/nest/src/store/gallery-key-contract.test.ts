/**
 * The type contract the registry of key spaces rests on, held so it cannot go
 * quietly vacuous.
 *
 * `GALLERY_KEY_SPACES` (`gallery-keys.ts`) closes the set of key spaces by
 * making `KVNamespaceLike` (`env.ts`) accept only the keys its builders
 * produce, with the options each space's retention allows. Those are types,
 * and a type that has been widened by accident (the brand dropped, a
 * parameter loosened to `string`, an options tuple made optional) still
 * compiles everything it used to. It just stops refusing anything, and every
 * guard that relies on it passes on the strength of nothing (TPL-3589).
 *
 * So each refusal is written down here as a `@ts-expect-error`. If the type
 * stops refusing it, the directive is unused and `pnpm typecheck` fails. The
 * same calls also run against `MemoryKV`, which refuses them at runtime: the
 * second layer, for anything a test writes as a plain string.
 */
import { describe, expect, it } from "vitest";
import type { KVNamespaceLike } from "../env.js";
import { MemoryKV } from "../testing/memory-kv.js";
import {
  accountKey,
  newSessionId,
  sessionKey,
  type GalleryKeySpace,
  type KeySpaceDefinition,
} from "./gallery-keys.js";
import type { AccountPurgeResult } from "./gallery-store.js";

/** `true` only when `A` and `B` are the same type. */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

describe("the KV binding's type", () => {
  it("refuses a key no builder produced, in a registered space or not", async () => {
    const kv: KVNamespaceLike = new MemoryKV();
    const id = 42;
    // @ts-expect-error -- a key spelled by hand is a string, not a GalleryKey
    const unregistered = kv.put(`meta/v1/${id}`, "{}");
    await expect(unregistered).rejects.toThrow(/no registered key space/);
    // @ts-expect-error -- the registered prefix does not make it a key
    await kv.get(`acct/v1/${id}`);
    // @ts-expect-error -- nor for a delete
    await kv.delete(`acct/v1/${id}`);
    // @ts-expect-error -- nor for a prefix to list
    await kv.list({ prefix: `sub/v1/${id}/` });
  });

  it("demands a TTL on a credential and refuses one on content", async () => {
    const kv: KVNamespaceLike = new MemoryKV();
    const session = sessionKey(42, newSessionId());
    // @ts-expect-error -- a credential written without an expiry
    const forever = kv.put(session, "{}");
    await expect(forever).rejects.toThrow(/must expire/);
    // @ts-expect-error -- content written with one
    const expiring = kv.put(accountKey(42), "{}", { expirationTtl: 3600 });
    await expect(expiring).rejects.toThrow(/must not expire/);

    await kv.put(session, "{}", { expirationTtl: 3600 });
    await kv.put(accountKey(42), "{}");
  });

  it("refuses a key space whose prefix has no version", () => {
    // @ts-expect-error -- an unversioned layout cannot be swept by prefix later
    const unversioned: KeySpaceDefinition = { prefix: "meta", retention: "content" };
    expect(unversioned.retention).toBe("content");
  });

  it("gives the purge result a count for exactly the registered spaces", () => {
    const exact: Equal<keyof AccountPurgeResult, GalleryKeySpace> = true;
    // And the set is not empty, or the equality above would hold for nothing.
    const accounts: GalleryKeySpace = "accounts";
    expect([exact, accounts]).toEqual([true, "accounts"]);
  });
});
