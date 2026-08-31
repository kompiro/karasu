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
 * content nobody can withdraw. Every prefix this package writes has to appear
 * in `purgeAccount`, and `gallery-purge-coverage.test.ts` fails the build if
 * one does not (TPL-2226).
 */
import type { KVNamespaceLike } from "../env.js";
import { logError } from "../log.js";
import { AccountStore, type Account } from "./accounts.js";
import { SessionStore, type Session } from "./sessions.js";
import { SubmissionStore } from "./submissions.js";

/** How `authenticate` is told the time, and where to put the refresh write. */
export interface AuthenticateOptions {
  /** Overridable so tests can walk a session up to its cap. */
  now?: Date;
  /**
   * `ExecutionContext.waitUntil`, when the caller has one.
   *
   * Given it, the refresh leaves the response path: the viewer is already
   * resolved, so making them wait on a write that only moves an expiry is
   * paying latency for nothing. Without it the write is awaited, which is
   * what a caller outside a request (a test, a script) wants.
   */
  waitUntil?: (promise: Promise<unknown>) => void;
}

export interface AccountPurgeResult {
  /** Account records removed: 1, or 0 if there was nothing to remove. */
  accounts: number;
  /** Sessions revoked. */
  sessions: number;
  /** Submissions deleted. */
  submissions: number;
}

export class GalleryStore {
  readonly accounts: AccountStore;
  readonly sessions: SessionStore;
  readonly submissions: SubmissionStore;

  constructor(kv: KVNamespaceLike) {
    this.accounts = new AccountStore(kv);
    this.sessions = new SessionStore(kv);
    this.submissions = new SubmissionStore(kv);
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
    // The refresh cannot fail the request. The viewer is authenticated either
    // way — the read that proved it has already happened — and the worst a
    // dropped write costs is a sign-in sooner than it needed to be. Logged
    // rather than swallowed silently, because a refresh that fails *every*
    // time is a broken binding worth seeing in the logs.
    const refresh = this.sessions.refreshIfStale(session.accountId, sessionId, session, now).then(
      () => undefined,
      (cause: unknown) => {
        logError("karasu-nest could not refresh a session", cause);
      },
    );
    if (options.waitUntil === undefined) await refresh;
    else options.waitUntil(refresh);
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
    const sessions = await this.sessions.purgeAccount(accountId);
    const submissions = await this.submissions.purgeAccount(accountId);
    const accounts = await this.accounts.purgeAccount(accountId);
    return { accounts, sessions, submissions };
  }
}
