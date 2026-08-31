import { describe, expect, it } from "vitest";
import {
  SESSION_ABSOLUTE_TTL_SECONDS,
  SESSION_IDLE_TTL_SECONDS,
  SESSION_REFRESH_AFTER_SECONDS,
  SessionStore,
  type Session,
} from "./sessions.js";
import { MemoryKV } from "../testing/memory-kv.js";

const DAY = 24 * 60 * 60;
const start = new Date("2026-08-01T00:00:00Z");

/**
 * A store whose two clocks move together.
 *
 * There are two, and a test that advanced one of them would be asserting on a
 * state the service cannot be in: `MemoryKV` expires against its own fake
 * clock, while the absolute cap is measured against the `Date` the caller
 * passes to `get`. Both are moved from one place here.
 *
 * `now` is also passed explicitly everywhere rather than left to default.
 * A fixture date frozen in the past would drift towards the cap as real time
 * passed and start failing this suite on a date nobody chose.
 */
function harness(): {
  kv: MemoryKV;
  store: SessionStore;
  at: () => Date;
  advance: (seconds: number) => void;
} {
  const kv = new MemoryKV();
  let now = start;
  return {
    kv,
    store: new SessionStore(kv),
    at: () => now,
    advance(seconds) {
      kv.advance(seconds);
      now = new Date(now.getTime() + seconds * 1000);
    },
  };
}

/** Read a session that the test needs to still be there, without a `!`. */
async function live(h: ReturnType<typeof harness>, sessionId: string): Promise<Session> {
  const session = await h.store.get(42, sessionId, h.at());
  if (session === undefined) throw new Error("the session should still be readable here");
  return session;
}

describe("SessionStore", () => {
  it("issues a session the cookie's two halves can find again", async () => {
    const h = harness();
    const { sessionId } = await h.store.issue(42, "kompiro", h.at());
    expect(await h.store.get(42, sessionId, h.at())).toEqual({
      accountId: "42",
      login: "kompiro",
      issuedAt: start.toISOString(),
      refreshedAt: start.toISOString(),
    });
  });

  it("expires when nobody uses it, unlike everything else the gallery stores", async () => {
    // A credential is the one thing here that should stop working on its own.
    const h = harness();
    const { sessionId } = await h.store.issue(42, "kompiro", h.at());
    expect(h.kv.puts.at(-1)?.options?.expirationTtl).toBe(SESSION_IDLE_TTL_SECONDS);
    h.advance(SESSION_IDLE_TTL_SECONDS + 1);
    expect(await h.store.get(42, sessionId, h.at())).toBeUndefined();
  });

  it("slides while it is in use, so it does not expire 30 days after issue", async () => {
    const h = harness();
    const { sessionId } = await h.store.issue(42, "kompiro", h.at());
    h.advance(20 * DAY);
    expect(await h.store.refreshIfStale(42, sessionId, await live(h, sessionId), h.at())).toBe(
      true,
    );
    // Day 40. Past the window measured from issue, inside the one measured
    // from that use — this is exactly where the old behaviour signed a
    // submitter out mid-task.
    h.advance(20 * DAY);
    expect(await h.store.get(42, sessionId, h.at())).toBeDefined();
  });

  it("does not write again inside the refresh threshold", async () => {
    // The reason the original decision went the other way: renewing on every
    // read is a KV write per authenticated request. Asserted on the store,
    // because that is where the cost would land.
    const h = harness();
    const { sessionId } = await h.store.issue(42, "kompiro", h.at());
    const writes = h.kv.puts.length;
    for (let i = 0; i < 5; i += 1) {
      h.advance(SESSION_REFRESH_AFTER_SECONDS / 10);
      const session = await live(h, sessionId);
      expect(await h.store.refreshIfStale(42, sessionId, session, h.at())).toBe(false);
    }
    expect(h.kv.puts.length).toBe(writes);
    // And once past the threshold it does write — so the assertion above is
    // about the throttle, not about a refresh that never happens at all.
    h.advance(SESSION_REFRESH_AFTER_SECONDS);
    expect(await h.store.refreshIfStale(42, sessionId, await live(h, sessionId), h.at())).toBe(
      true,
    );
    expect(h.kv.puts.length).toBe(writes + 1);
  });

  it("refuses a session past the absolute cap however recently it was used", async () => {
    const h = harness();
    const { sessionId } = await h.store.issue(42, "kompiro", h.at());
    // Written straight into KV with no expiry, and with a `refreshedAt` from
    // a moment ago. KV's one expiry is spent on the idle window, so a record
    // can outlive the cap without KV knowing — `get` is the only thing
    // between that and a credential that never dies.
    h.advance(SESSION_ABSOLUTE_TTL_SECONDS + DAY);
    await h.kv.put(
      `sess/v1/42/${sessionId}`,
      JSON.stringify({
        accountId: "42",
        login: "kompiro",
        issuedAt: start.toISOString(),
        refreshedAt: h.at().toISOString(),
      }),
    );
    expect(await h.store.get(42, sessionId, h.at())).toBeUndefined();
  });

  it("never refreshes into a window that outlives the cap", async () => {
    const h = harness();
    const { session, sessionId } = await h.store.issue(42, "kompiro", h.at());
    h.advance(SESSION_ABSOLUTE_TTL_SECONDS - 10 * DAY);
    const writes = h.kv.puts.length;
    expect(await h.store.refreshIfStale(42, sessionId, session, h.at())).toBe(true);
    // Ten days of cap left, so ten days is what the record gets — not the
    // thirty the idle window would otherwise have handed out.
    expect(h.kv.puts.at(-1)?.options?.expirationTtl).toBe(10 * DAY);
    expect(h.kv.puts.length).toBe(writes + 1);
  });

  it("stops refreshing once the cap leaves less room than KV accepts", async () => {
    const h = harness();
    const { session, sessionId } = await h.store.issue(42, "kompiro", h.at());
    // Thirty seconds of cap left. KV rejects a TTL below a minute, and there
    // is nothing to buy anyway: the next read refuses this session.
    h.advance(SESSION_ABSOLUTE_TTL_SECONDS - 30);
    const writes = h.kv.puts.length;
    expect(await h.store.refreshIfStale(42, sessionId, session, h.at())).toBe(false);
    expect(h.kv.puts.length).toBe(writes);
  });

  it("reads a record written before refreshedAt existed, treating issuedAt as it", async () => {
    const h = harness();
    const { sessionId } = await h.store.issue(42, "kompiro", h.at());
    // The shape #2655 found in the store. There is no migration, so these
    // records have to keep authenticating on their own terms.
    await h.kv.put(
      `sess/v1/42/${sessionId}`,
      JSON.stringify({ accountId: "42", login: "kompiro", issuedAt: start.toISOString() }),
      { expirationTtl: SESSION_IDLE_TTL_SECONDS },
    );
    expect(await h.store.get(42, sessionId, h.at())).toEqual({
      accountId: "42",
      login: "kompiro",
      issuedAt: start.toISOString(),
      refreshedAt: start.toISOString(),
    });
    // And it slides from there like any other, rather than being stuck.
    h.advance(2 * DAY);
    expect(await h.store.refreshIfStale(42, sessionId, await live(h, sessionId), h.at())).toBe(
      true,
    );
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
    const h = harness();
    const { sessionId } = await h.store.issue(42, "kompiro", h.at());
    expect(await h.store.get(43, sessionId, h.at())).toBeUndefined();
  });

  it("refuses a record whose account disagrees with the key it was read from", async () => {
    const h = harness();
    const { sessionId } = await h.store.issue(42, "kompiro", h.at());
    await h.kv.put(
      `sess/v1/42/${sessionId}`,
      JSON.stringify({
        accountId: "43",
        login: "kompiro",
        issuedAt: start.toISOString(),
        refreshedAt: start.toISOString(),
      }),
    );
    expect(await h.store.get(42, sessionId, h.at())).toBeUndefined();
  });

  it("refuses a record whose issuedAt cannot be read as a time", async () => {
    // The cap is measured from `issuedAt`. A value that will not parse leaves
    // it unmeasurable, and an unbounded credential is the thing the cap
    // exists to prevent — so this fails closed like the mismatch above.
    const h = harness();
    const { sessionId } = await h.store.issue(42, "kompiro", h.at());
    await h.kv.put(
      `sess/v1/42/${sessionId}`,
      JSON.stringify({ accountId: "42", login: "kompiro", issuedAt: "not a date" }),
    );
    expect(await h.store.get(42, sessionId, h.at())).toBeUndefined();
  });

  it("revokes one session without touching the others", async () => {
    const h = harness();
    const a = await h.store.issue(42, "kompiro", h.at());
    const b = await h.store.issue(42, "kompiro", h.at());
    await h.store.revoke(42, a.sessionId);
    expect(await h.store.get(42, a.sessionId, h.at())).toBeUndefined();
    expect(await h.store.get(42, b.sessionId, h.at())).toBeDefined();
  });

  it("revokes every session an account holds, and only that account's", async () => {
    const h = harness();
    const mine = await h.store.issue(42, "kompiro", h.at());
    await h.store.issue(42, "kompiro", h.at());
    const theirs = await h.store.issue(420, "someone-else", h.at());
    expect(await h.store.purgeAccount(42)).toBe(2);
    expect(await h.store.get(42, mine.sessionId, h.at())).toBeUndefined();
    expect(await h.store.get(420, theirs.sessionId, h.at())).toBeDefined();
  });
});
