import { describe, expect, it } from "vitest";
import { SESSION_TTL_SECONDS, SessionStore } from "./sessions.js";
import { MemoryKV } from "../testing/memory-kv.js";

const at = new Date("2026-08-01T00:00:00Z");

describe("SessionStore", () => {
  it("issues a session the cookie's two halves can find again", async () => {
    const store = new SessionStore(new MemoryKV());
    const { sessionId } = await store.issue(42, "kompiro", at);
    expect(await store.get(42, sessionId)).toEqual({
      accountId: "42",
      login: "kompiro",
      issuedAt: at.toISOString(),
    });
  });

  it("expires, unlike everything else the gallery stores", async () => {
    // A credential is the one thing here that should stop working on its own.
    const kv = new MemoryKV();
    const store = new SessionStore(kv);
    const { sessionId } = await store.issue(42, "kompiro", at);
    expect(kv.puts.at(-1)?.options?.expirationTtl).toBe(SESSION_TTL_SECONDS);
    kv.advance(SESSION_TTL_SECONDS + 1);
    expect(await store.get(42, sessionId)).toBeUndefined();
  });

  it("is not extended by being used", async () => {
    // Reading a session must not rewrite it. A credential that renews on use
    // never ends while it is being used, which is the thing the fixed window
    // exists to stop, and `docs/policy/nest-privacy.md` states that window to
    // submitters. The lint guard checks the documents; this checks the
    // behaviour they describe, because a comment can go on saying "not
    // renewed" after the code stopped meaning it.
    const kv = new MemoryKV();
    const store = new SessionStore(kv);
    const { sessionId } = await store.issue(42, "kompiro", at);
    const writes = kv.puts.length;

    kv.advance(SESSION_TTL_SECONDS / 2);
    expect(await store.get(42, sessionId)).toBeDefined();
    expect(kv.puts.length).toBe(writes);

    // Still measured from issue, not from that read.
    kv.advance(SESSION_TTL_SECONDS / 2 + 1);
    expect(await store.get(42, sessionId)).toBeUndefined();
  });

  it("will not hand one account's session to another", async () => {
    const store = new SessionStore(new MemoryKV());
    const { sessionId } = await store.issue(42, "kompiro", at);
    expect(await store.get(43, sessionId)).toBeUndefined();
  });

  it("refuses a record whose account disagrees with the key it was read from", async () => {
    const kv = new MemoryKV();
    const store = new SessionStore(kv);
    const { sessionId } = await store.issue(42, "kompiro", at);
    await kv.put(
      `sess/v1/42/${sessionId}`,
      JSON.stringify({ accountId: "43", login: "kompiro", issuedAt: at.toISOString() }),
    );
    expect(await store.get(42, sessionId)).toBeUndefined();
  });

  it("revokes one session without touching the others", async () => {
    const store = new SessionStore(new MemoryKV());
    const a = await store.issue(42, "kompiro", at);
    const b = await store.issue(42, "kompiro", at);
    await store.revoke(42, a.sessionId);
    expect(await store.get(42, a.sessionId)).toBeUndefined();
    expect(await store.get(42, b.sessionId)).toBeDefined();
  });

  it("revokes every session an account holds, and only that account's", async () => {
    const store = new SessionStore(new MemoryKV());
    const mine = await store.issue(42, "kompiro", at);
    await store.issue(42, "kompiro", at);
    const theirs = await store.issue(420, "someone-else", at);
    expect(await store.purgeAccount(42)).toBe(2);
    expect(await store.get(42, mine.sessionId)).toBeUndefined();
    expect(await store.get(420, theirs.sessionId)).toBeDefined();
  });
});
