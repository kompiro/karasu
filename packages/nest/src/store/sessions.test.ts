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

/** Put a sign-out exactly between a refresh's last read and write. */
class RefreshRaceKV extends MemoryKV {
  beforeSessionPut?: () => Promise<void>;

  override async put(
    key: string,
    value: string,
    options?: { expirationTtl?: number; metadata?: unknown },
  ): Promise<void> {
    const hook = this.beforeSessionPut;
    if (hook !== undefined && !key.endsWith("/revoked")) {
      this.beforeSessionPut = undefined;
      await hook();
    }
    await super.put(key, value, options);
  }
}

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

/**
 * Walk a session forward the way a returning submitter does: use it, refresh
 * it, repeat. Nothing here can jump straight to day 80 — the record would have
 * expired in KV on day 30, and `refreshIfStale` refuses to write a key that is
 * no longer there rather than resurrecting it.
 */
async function useUntil(
  h: ReturnType<typeof harness>,
  sessionId: string,
  totalDays: number,
): Promise<void> {
  for (let elapsed = 0; elapsed < totalDays; elapsed += 20) {
    h.advance(20 * DAY);
    await h.store.refreshIfStale(sessionId, await live(h, sessionId), h.at());
  }
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
    expect(await h.store.refreshIfStale(sessionId, await live(h, sessionId), h.at())).toBe(true);
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
      expect(await h.store.refreshIfStale(sessionId, session, h.at())).toBe(false);
    }
    expect(h.kv.puts.length).toBe(writes);
    // And once past the threshold it does write — so the assertion above is
    // about the throttle, not about a refresh that never happens at all.
    h.advance(SESSION_REFRESH_AFTER_SECONDS);
    expect(await h.store.refreshIfStale(sessionId, await live(h, sessionId), h.at())).toBe(true);
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
    const { sessionId } = await h.store.issue(42, "kompiro", h.at());
    // Day 80 of a 90-day cap, reached by using the session all the way there.
    await useUntil(h, sessionId, 80);
    // Ten days of cap left, so ten days is what the last refresh granted —
    // not the thirty the idle window would otherwise have handed out.
    expect(h.kv.puts.at(-1)?.options?.expirationTtl).toBe(10 * DAY);
  });

  it("stops refreshing once the cap leaves less room than KV accepts", async () => {
    const h = harness();
    const { sessionId } = await h.store.issue(42, "kompiro", h.at());
    await useUntil(h, sessionId, 80);
    const session = await live(h, sessionId);
    // Thirty seconds of cap left. KV rejects a TTL below a minute, and there
    // is nothing to buy anyway: the next read refuses this session.
    h.advance(10 * DAY - 30);
    const writes = h.kv.puts.length;
    expect(await h.store.refreshIfStale(sessionId, session, h.at())).toBe(false);
    expect(h.kv.puts.length).toBe(writes);
    // And a moment later the cap does the refusing, on read.
    h.advance(31);
    expect(await h.store.get(42, sessionId, h.at())).toBeUndefined();
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
    expect(await h.store.refreshIfStale(sessionId, await live(h, sessionId), h.at())).toBe(true);
  });

  it("does not bring back a session that was revoked mid-flight", async () => {
    // `put` creates a key as readily as it updates one, so a refresh computed
    // before a sign-out and written after it would hand back the credential
    // the sign-out destroyed — with a fresh window on it.
    const h = harness();
    const { session, sessionId } = await h.store.issue(42, "kompiro", h.at());
    h.advance(2 * DAY);
    await h.store.revoke(42, sessionId);
    const writes = h.kv.puts.length;
    expect(await h.store.refreshIfStale(sessionId, session, h.at())).toBe(false);
    expect(h.kv.puts.length).toBe(writes);
    expect(await h.store.get(42, sessionId, h.at())).toBeUndefined();
  });

  it("keeps a revoked session inert if a stale refresh writes it back", async () => {
    const kv = new RefreshRaceKV();
    const store = new SessionStore(kv);
    const { session, sessionId } = await store.issue(42, "kompiro", start);
    const now = new Date(start.getTime() + 2 * DAY * 1000);
    kv.advance(2 * DAY);

    // The refresh has already re-read the live record. Sign-out now persists
    // revocation and deletes it; only then does the stale put land.
    kv.beforeSessionPut = () => store.revoke(42, sessionId);
    expect(await store.refreshIfStale(sessionId, session, now)).toBe(false);
    expect(kv.keys()).toEqual([`sess/v1/42/${sessionId}/revoked`]);
    expect(await store.get(42, sessionId, now)).toBeUndefined();
  });

  it("does not bring back a session the account purge swept", async () => {
    const h = harness();
    const { session, sessionId } = await h.store.issue(42, "kompiro", h.at());
    h.advance(2 * DAY);
    await h.store.purgeAccount(42);
    expect(await h.store.refreshIfStale(sessionId, session, h.at())).toBe(false);
    expect(h.kv.keys()).toEqual([]);
  });

  it("purges revocation markers with the account's sessions", async () => {
    const h = harness();
    const { sessionId } = await h.store.issue(42, "kompiro", h.at());
    await h.store.revoke(42, sessionId);
    expect(h.kv.keys()).toEqual([`sess/v1/42/${sessionId}/revoked`]);
    expect(await h.store.purgeAccount(42)).toBe(1);
    expect(h.kv.keys()).toEqual([]);
  });

  it("does not allocate revocation state for a session that never existed", async () => {
    const h = harness();
    await h.store.revoke(42, "a".repeat(32));
    expect(h.kv.keys()).toEqual([]);
  });

  it("cannot be kept alive forever by being used", async () => {
    // The behavioural twin of the lint guard, and it changed for the same
    // reason (#2655). It used to assert that reading a session never rewrote
    // it, because a credential that renews on use never ends while it is
    // being used — the thing the fixed window existed to stop. Sliding is now
    // deliberate, so what has to be checked is the thing that still stops it:
    // the cap. Kept as behaviour rather than left to the lint guard, because a
    // comment can go on claiming a ceiling after the code stopped enforcing one.
    const h = harness();
    const { sessionId } = await h.store.issue(42, "kompiro", h.at());

    // Used continuously, right up to the cap — never idle, always refreshed.
    await useUntil(h, sessionId, 80);
    expect(await h.store.get(42, sessionId, h.at())).toBeDefined();

    // And it ends anyway. No amount of use moves this.
    h.advance(10 * DAY);
    expect(await h.store.get(42, sessionId, h.at())).toBeUndefined();
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
