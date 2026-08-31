/**
 * Sessions, stored under the account so signing out everywhere is a sweep.
 *
 *     sess/v1/<account>/<session> -> { accountId, login, issuedAt, refreshedAt }
 *
 * The account comes first for the same reason it does everywhere else in the
 * gallery: account deletion must reach every key the account produced, and a
 * session keyed only by its own id would need a second index to be found from
 * the account — a fourth prefix, and one more thing for the purge to know
 * about (TPL-2226).
 *
 * That the cookie therefore has to carry both halves is not a cost. A session
 * id alone would have to be looked up somewhere before we knew whose it was;
 * carrying the account means the key is computable from the cookie and the
 * lookup is a single `get`.
 *
 * Sessions **do** expire, unlike everything else the gallery stores. The
 * reason submissions do not — content its author manages must not vanish on
 * its own — does not apply to a credential, where a bounded lifetime is the
 * point.
 */
import { KV_MINIMUM_TTL_SECONDS, type KVNamespaceLike } from "../env.js";
import { newSessionId, sessionKey, sessionPrefix, normaliseAccountId } from "./gallery-keys.js";
import { purgeByPrefix } from "./sweep.js";

/**
 * 30 days, measured from the last use rather than from issue.
 *
 * Long enough that managing your own submissions does not mean signing in
 * every visit, short enough that a cookie copied off a shared machine stops
 * working without anyone having to notice.
 *
 * **Renewed on use, up to an absolute cap.** This window used to be fixed at
 * issue, and the comment here recorded two objections to sliding it: a KV
 * write on every authenticated request is a lot of writing, and a credential
 * that renews itself indefinitely is the one a ceiling exists to stop. Both
 * objections were real. Neither ruled out sliding expiry — they ruled out the
 * naive form of it, which is what that comment was written against, and the
 * two constants below are the answer to them (#2655).
 */
export const SESSION_IDLE_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * 90 days from `issuedAt`, and nothing moves it.
 *
 * This is the objection about indefinite renewal, kept. Sliding buys "do not
 * sign me out while I am working"; the cap keeps "a credential that renews
 * itself forever" out. A submitter who never stops using the gallery still
 * signs in once a quarter.
 *
 * **KV cannot enforce this.** A key carries one expiry, and that one is spent
 * on the idle window above — so the cap is checked on read, in `get`, against
 * `issuedAt`. A session past it reads as absent.
 *
 * It is also the cookie's `Max-Age` (`auth/session.ts`): the cookie should
 * state the longest its value could possibly be useful, and the store decides
 * everything shorter.
 */
export const SESSION_ABSOLUTE_TTL_SECONDS = 90 * 24 * 60 * 60;

/**
 * How stale a record must be before a refresh is worth a write.
 *
 * This is the objection about write amplification, answered. Refreshing on
 * every read would put a KV write on every authenticated request; refreshing
 * only once the record is a day old costs an active daily user about one write
 * per day instead. The idle window is 30 days, so spending up to a day of it
 * un-renewed changes nothing a submitter can observe.
 *
 * "About", because the throttle is decided from a KV read and KV reads are not
 * read-after-write consistent. For up to a minute after a refresh lands, other
 * requests can still see the record it replaced and write their own. The bound
 * that matters holds either way — a burst of requests inside one minute a day,
 * not a write per request forever — but this is a throttle, not a lock.
 */
export const SESSION_REFRESH_AFTER_SECONDS = 24 * 60 * 60;

export interface Session {
  accountId: string;
  login: string;
  issuedAt: string;
  /**
   * When the sliding window last restarted.
   *
   * Records written before #2655 have no such field. They are read with
   * `issuedAt` as the initial value, which keeps every one of them valid: at
   * worst a session that had been idle is treated as slightly fresher than it
   * was, and the cap — measured from `issuedAt`, which those records do have —
   * is unaffected either way.
   */
  refreshedAt: string;
}

/**
 * Milliseconds since an ISO timestamp, or `undefined` if it cannot be worked
 * out.
 *
 * Both inputs are checked, not just the stored one. An `Invalid Date` reaching
 * this would make the subtraction `NaN`, and every comparison against `NaN` is
 * `false` — so a caller testing `age >= cap` would read "not past the cap" and
 * the ceiling would quietly stop existing. Returning `undefined` makes callers
 * handle it, and all of them fail closed.
 */
function elapsedSince(iso: string, now: Date): number | undefined {
  const elapsed = now.getTime() - Date.parse(iso);
  return Number.isNaN(elapsed) ? undefined : elapsed;
}

export class SessionStore {
  constructor(private readonly kv: KVNamespaceLike) {}

  /** Issue a session and return the id the cookie carries. */
  async issue(
    accountId: number | string,
    login: string,
    at: Date,
  ): Promise<{ sessionId: string; session: Session }> {
    const canonical = normaliseAccountId(accountId);
    const sessionId = newSessionId();
    const issuedAt = at.toISOString();
    const session: Session = { accountId: canonical, login, issuedAt, refreshedAt: issuedAt };
    await this.kv.put(sessionKey(canonical, sessionId), JSON.stringify(session), {
      expirationTtl: SESSION_IDLE_TTL_SECONDS,
    });
    return { sessionId, session };
  }

  /**
   * Read a session, refusing one that is past the absolute cap.
   *
   * KV has already refused anything past the idle window — its expiry does
   * that. The cap is the second expiry, and it is enforced here because a key
   * only carries one.
   */
  async get(
    accountId: number | string,
    sessionId: string,
    now: Date = new Date(),
  ): Promise<Session | undefined> {
    const raw = await this.kv.get(sessionKey(accountId, sessionId));
    if (raw === null) return undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return undefined;
    }
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const record = parsed as Record<string, unknown>;
    if (
      typeof record.accountId !== "string" ||
      typeof record.login !== "string" ||
      typeof record.issuedAt !== "string"
    ) {
      return undefined;
    }
    // The key already scoped the read to one account, so a record naming a
    // different one is corruption rather than someone else's session. Refuse
    // it instead of trusting the value over the key.
    if (record.accountId !== normaliseAccountId(accountId)) return undefined;
    // Written before #2655, or written since. Either way the window starts
    // from a timestamp the record has.
    const refreshedAt = typeof record.refreshedAt === "string" ? record.refreshedAt : undefined;
    const age = elapsedSince(record.issuedAt, now);
    // An `issuedAt` that will not parse leaves the cap unmeasurable, and a
    // credential whose ceiling cannot be checked is refused rather than
    // trusted — the same direction as the account mismatch above.
    if (age === undefined || age >= SESSION_ABSOLUTE_TTL_SECONDS * 1000) return undefined;
    return {
      accountId: record.accountId,
      login: record.login,
      issuedAt: record.issuedAt,
      refreshedAt: refreshedAt ?? record.issuedAt,
    };
  }

  /**
   * Restart the idle window, but only if the record is stale enough to be
   * worth a write. Returns whether one happened.
   *
   * Callers treat a `false` and a throw alike: the session is valid either
   * way, and the worst a dropped refresh costs is an earlier sign-in.
   *
   * The key is derived from `session.accountId` rather than taken as its own
   * argument, so there is no way to pass a session and a key that disagree —
   * which would write one session's record over another's and reset the
   * overwritten one's cap to the wrong issue time.
   */
  async refreshIfStale(
    sessionId: string,
    session: Session,
    now: Date = new Date(),
  ): Promise<boolean> {
    const sinceRefresh = elapsedSince(session.refreshedAt, now);
    if (sinceRefresh === undefined || sinceRefresh < SESSION_REFRESH_AFTER_SECONDS * 1000) {
      return false;
    }
    const age = elapsedSince(session.issuedAt, now);
    if (age === undefined) return false;
    // Never past the cap: the new window is whatever is left of the absolute
    // lifetime when that is the shorter of the two. This is belt-and-braces —
    // `get` is what actually enforces the cap — but it means KV drops the
    // record on its own rather than leaving one that only reads as absent.
    const remaining = SESSION_ABSOLUTE_TTL_SECONDS - age / 1000;
    const ttl = Math.floor(Math.min(SESSION_IDLE_TTL_SECONDS, remaining));
    // Close enough to the cap that the write KV would accept is shorter than
    // its own floor. Refreshing is pointless here anyway: the session is about
    // to be refused on read.
    if (ttl < KV_MINIMUM_TTL_SECONDS) return false;
    const key = sessionKey(session.accountId, sessionId);
    // Re-read before writing, because **a refresh must never bring a session
    // back**. `put` creates a key as readily as it updates one, so a blind
    // write here would undo a `revoke` or a `purgeAccount` that happened in
    // between and hand back a credential sign-out had destroyed — with a fresh
    // 30-day window on it.
    //
    // KV has no compare-and-set, so this narrows the window to the put itself
    // rather than closing it. The other half of the answer is that callers do
    // not defer this write past their own deletions: `GalleryStore` awaits it.
    if ((await this.kv.get(key)) === null) return false;
    const refreshed: Session = { ...session, refreshedAt: now.toISOString() };
    await this.kv.put(key, JSON.stringify(refreshed), { expirationTtl: ttl });
    return true;
  }

  async revoke(accountId: number | string, sessionId: string): Promise<void> {
    await this.kv.delete(sessionKey(accountId, sessionId));
  }

  /** Every session this account holds. Sign-out-everywhere, and part of purge. */
  async purgeAccount(accountId: number | string): Promise<number> {
    return await purgeByPrefix(this.kv, sessionPrefix(accountId));
  }
}
