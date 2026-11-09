/**
 * The gallery's stores as one object, because account deletion has to reach
 * all of them.
 *
 * `AccountStore` and `SessionStore` (and `SubmissionStore`, from #2587) each
 * own one KV prefix and know nothing about the others. Deleting an account is
 * the operation that spans them, and it is the operation the console exists
 * for: without it, "remove everything and close my account" stays the single
 * most tedious request a human has to answer by hand (#2589).
 *
 * So callers get this facade rather than the halves. A caller who deleted the
 * account record and forgot the sessions would leave a live credential naming
 * an account that no longer exists; one who forgot a submission would leave
 * content nobody can withdraw. Every key space this package writes has to
 * appear in `purgeAccount`, and that is now a type rather than a habit: the
 * stores it walks are a `Record` over `GalleryKeySpace`, so registering a
 * space in `gallery-keys.ts` without naming the store that purges it does not
 * compile. `gallery-purge-coverage.test.ts` then checks that the store named
 * really does leave nothing behind (TPL-2226).
 */
import type { KVNamespaceLike } from "../env.js";
import { AccountStore, type Account } from "./accounts.js";
import type { GalleryKeySpace } from "./gallery-keys.js";
import { SessionStore, type Session } from "./sessions.js";
import { SubmissionStore } from "./submissions.js";

/** How `authenticate` is told the time. */
export interface AuthenticateOptions {
  /**
   * The clock the session's two expiries are measured against.
   *
   * Injected rather than read from `Date.now()` inside the store, so a caller
   * can walk a session up to its cap deterministically. Every path that
   * consumes it fails closed on a `Date` that is not a real time, so passing
   * a broken one refuses the session rather than disabling the cap.
   */
  now?: Date;
}

/**
 * How many keys account deletion removed, per key space: `accounts` is 1 or 0,
 * `sessions` the sessions revoked, `submissions` the submissions deleted.
 *
 * Derived from the registry rather than written out, so a new space has a
 * count the moment it exists. A purge that reported zeroes while deleting is
 * indistinguishable from one that deleted nothing, and a space missing from
 * the result is the same report with less to look at (TPL-2226).
 */
export type AccountPurgeResult = Record<GalleryKeySpace, number>;

/** What account deletion needs from a store: remove the account, say how much. */
interface Purgeable {
  purgeAccount(accountId: number | string): Promise<number>;
}

export class GalleryStore {
  readonly accounts: AccountStore;
  readonly sessions: SessionStore;
  readonly submissions: SubmissionStore;
  /**
   * The store that purges each key space, **in purge order**: object literal
   * keys keep their insertion order, and that order is the one
   * `purgeAccount` explains below.
   */
  private readonly purgeable: Readonly<Record<GalleryKeySpace, Purgeable>>;

  constructor(kv: KVNamespaceLike) {
    this.accounts = new AccountStore(kv);
    this.sessions = new SessionStore(kv);
    this.submissions = new SubmissionStore(kv);
    this.purgeable = {
      sessions: this.sessions,
      submissions: this.submissions,
      accounts: this.accounts,
    };
  }

  /**
   * Resolve a session cookie to the account it names.
   *
   * Returns `undefined` for an expired, revoked or forged cookie alike. A
   * caller cannot tell those apart and should not: all three mean "not signed
   * in", and distinguishing them in a response would say whether an account
   * exists.
   *
   * **This is a write path** (#2655). Resolving a cookie is also what tells
   * the store the session is in use, so a stale record is refreshed here —
   * throttled by `SESSION_REFRESH_AFTER_SECONDS`, so an active submitter
   * costs one write a day rather than one per request.
   */
  async authenticate(
    accountId: string,
    sessionId: string,
    options: AuthenticateOptions = {},
  ): Promise<{ session: Session; account: Account } | undefined> {
    const now = options.now ?? new Date();
    let session: Session | undefined;
    try {
      session = await this.sessions.get(accountId, sessionId, now);
    } catch {
      // A cookie whose halves cannot form a key is a forged cookie, not an
      // error to surface — the store throws on a malformed id by design.
      return undefined;
    }
    if (session === undefined) return undefined;
    const account = await this.accounts.get(session.accountId);
    // A session outliving its account record means the account was deleted
    // while this cookie was still in a browser. The deletion wins.
    if (account === undefined) return undefined;
    // Deliberately after the account check, so a purged account's cookie does
    // not get its window extended on the way to being refused.
    //
    // **Awaited, not deferred to `ctx.waitUntil`.** Handlers delete the very
    // records this writes. `SessionStore` persists revocation separately and
    // checks it on both sides of a refresh, so sign-out still wins when it
    // lands between the refresh's last read and its write. Awaiting also keeps
    // account deletion ordered after this request's expiry bump.
    //
    // Deferring bought little in the first place. The throttle means all but
    // roughly one request a day per submitter returns without writing, so the
    // latency this adds is paid once a day and not on the requests that were
    // supposed to be fast.
    //
    // No `try` here: `refreshIfStale` never rejects, which is what keeps a
    // failed write from changing who the viewer is (`sessions.ts` says why).
    await this.sessions.refreshIfStale(sessionId, session, now);
    return { session, account };
  }

  /**
   * Delete everything one account owns.
   *
   * Sessions go **first**. If the process dies partway, an account whose
   * sessions are gone can no longer act, whereas an account record deleted
   * first would leave live cookies pointing at nothing — the same
   * "fail towards inert" direction: a half-finished purge should leave
   * something that cannot act, not something that can.
   */
  async purgeAccount(accountId: number | string): Promise<AccountPurgeResult> {
    const counts: Partial<AccountPurgeResult> = {};
    // Sequential, in `purgeable`'s order, for the reason above.
    for (const space of Object.keys(this.purgeable) as GalleryKeySpace[]) {
      counts[space] = await this.purgeable[space].purgeAccount(accountId);
    }
    // Every key of a `Record<GalleryKeySpace, …>` was visited, so none is missing.
    return counts as AccountPurgeResult;
  }
}
