/**
 * `GalleryStore.authenticate` as a write path (#2655).
 *
 * Resolving a cookie is also what tells the store the session is in use, so
 * the read that answers "who is asking" now carries a refresh behind it. The
 * cases here are the ones that separate "the session slid" from "the request
 * broke": the refresh is throttled, it is handed to `waitUntil` when there is
 * one, and it cannot turn an authenticated viewer into an anonymous one.
 */
import { describe, expect, it, vi } from "vitest";
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

  it("hands the refresh to waitUntil rather than the response path", async () => {
    const kv = new MemoryKV();
    const { store, sessionId } = await signedIn(kv);
    const waitUntil = vi.fn<(promise: Promise<unknown>) => void>();
    await store.authenticate("42", sessionId, {
      now: later(SESSION_REFRESH_AFTER_SECONDS + 1),
      waitUntil,
    });
    expect(waitUntil).toHaveBeenCalledTimes(1);
    // Whatever it was given has to be safe to drop: `waitUntil` in a test (and
    // an isolate that gets evicted) never settles it, and an un-caught
    // rejection there would surface as an unhandled rejection.
    await expect(waitUntil.mock.calls[0]?.[0]).resolves.toBeUndefined();
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
