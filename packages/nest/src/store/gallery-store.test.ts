/**
 * `GalleryStore.authenticate` as a write path (#2655).
 *
 * Resolving a cookie is also what tells the store the session is in use, so
 * the read that answers "who is asking" now carries a refresh behind it. The
 * cases here are the ones that separate "the session slid" from "the request
 * broke": the refresh is throttled, it settles before the call returns so a
 * deletion later in the same handler still wins, and it cannot turn an
 * authenticated viewer into an anonymous one.
 */
import { describe, expect, it } from "vitest";
import { GalleryStore } from "./gallery-store.js";
import { SESSION_REFRESH_AFTER_SECONDS } from "./sessions.js";
import { MemoryKV } from "../testing/memory-kv.js";
import type { KVNamespaceLike } from "../env.js";

const at = new Date("2026-08-01T00:00:00Z");
const later = (seconds: number): Date => new Date(at.getTime() + seconds * 1000);

/** An account with one session, and the cookie's two halves. */
async function signedIn(kv: MemoryKV): Promise<{ store: GalleryStore; sessionId: string }> {
  const store = new GalleryStore(kv);
  await store.accounts.signIn(42, "kompiro", at);
  const { sessionId } = await store.sessions.issue(42, "kompiro", at);
  return { store, sessionId };
}

describe("GalleryStore.authenticate", () => {
  it("resolves the cookie to the account it names", async () => {
    const { store, sessionId } = await signedIn(new MemoryKV());
    const viewer = await store.authenticate("42", sessionId, { now: at });
    expect(viewer?.account.accountId).toBe("42");
    expect(viewer?.session.login).toBe("kompiro");
  });

  it("refreshes a stale session, and leaves a fresh one alone", async () => {
    const kv = new MemoryKV();
    const { store, sessionId } = await signedIn(kv);
    const writes = kv.puts.length;

    await store.authenticate("42", sessionId, { now: later(60) });
    expect(kv.puts.length).toBe(writes);

    await store.authenticate("42", sessionId, { now: later(SESSION_REFRESH_AFTER_SECONDS + 1) });
    expect(kv.puts.length).toBe(writes + 1);
  });

  it("authenticates even when the refresh write fails", async () => {
    // The viewer is authenticated by the read, which already happened. A
    // dropped refresh costs them an earlier sign-in and nothing else, so it
    // must not be allowed to turn into a 500 or a redirect to the login page.
    const kv = new MemoryKV();
    const { sessionId } = await signedIn(kv);
    const failing: KVNamespaceLike = {
      get: (key) => kv.get(key),
      put: () => Promise.reject(new Error("KV is having a bad day")),
      delete: (key) => kv.delete(key),
      list: (options) => kv.list(options),
    };
    const store = new GalleryStore(failing);
    const viewer = await store.authenticate("42", sessionId, {
      now: later(SESSION_REFRESH_AFTER_SECONDS + 1),
    });
    expect(viewer?.account.accountId).toBe("42");
  });

  it("refuses the session rather than dropping the cap when now is not a time", async () => {
    // Every comparison against `NaN` is false, so an unusable clock reaching
    // the cap check would read as "not past the cap" and the ceiling would
    // quietly stop existing. It has to fail the other way.
    const { store, sessionId } = await signedIn(new MemoryKV());
    expect(
      await store.authenticate("42", sessionId, { now: new Date("nonsense") }),
    ).toBeUndefined();
  });

  it("finishes the refresh before returning, so a later deletion wins", async () => {
    // The refresh must not outlive the call. `consoleDeleteAccount` resolves
    // the viewer and *then* purges, and sign-out revokes the session the
    // request arrived with — a write still in flight past either of those
    // would re-create a session that deletion had removed. Deferring it to
    // `ctx.waitUntil` is what would allow that, so the write is awaited and
    // the record is already settled when `authenticate` returns.
    const kv = new MemoryKV();
    const { store, sessionId } = await signedIn(kv);
    const writes = kv.puts.length;
    await store.authenticate("42", sessionId, { now: later(SESSION_REFRESH_AFTER_SECONDS + 1) });
    expect(kv.puts.length).toBe(writes + 1);

    // And the ordering that matters: purge after authenticate leaves nothing.
    await store.purgeAccount(42);
    expect(kv.keys()).toEqual([]);
  });

  it("does not extend the window of a cookie whose account was deleted", async () => {
    const kv = new MemoryKV();
    const { store, sessionId } = await signedIn(kv);
    await store.accounts.purgeAccount(42);
    const writes = kv.puts.length;
    const viewer = await store.authenticate("42", sessionId, {
      now: later(SESSION_REFRESH_AFTER_SECONDS + 1),
    });
    expect(viewer).toBeUndefined();
    expect(kv.puts.length).toBe(writes);
  });
});
