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
import { AccountStore, type Account } from "./accounts.js";
import { SessionStore, type Session } from "./sessions.js";

export interface AccountPurgeResult {
  /** Account records removed: 1, or 0 if there was nothing to remove. */
  accounts: number;
  /** Sessions revoked. */
  sessions: number;
}

export class GalleryStore {
  readonly accounts: AccountStore;
  readonly sessions: SessionStore;

  constructor(kv: KVNamespaceLike) {
    this.accounts = new AccountStore(kv);
    this.sessions = new SessionStore(kv);
  }

  /**
   * Resolve a session cookie to the account it names.
   *
   * Returns `undefined` for an expired, revoked or forged cookie alike. A
   * caller cannot tell those apart and should not: all three mean "not signed
   * in", and distinguishing them in a response would say whether an account
   * exists.
   */
  async authenticate(
    accountId: string,
    sessionId: string,
  ): Promise<{ session: Session; account: Account } | undefined> {
    let session: Session | undefined;
    try {
      session = await this.sessions.get(accountId, sessionId);
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
    return { session, account };
  }

  /**
   * Delete everything one account owns.
   *
   * Sessions go **first**. If the process dies partway, an account whose
   * sessions are gone can no longer act, whereas an account record deleted
   * first would leave live cookies pointing at nothing — the same
   * "fail towards inert" ordering `NestStore.purgeInstallation` uses for its
   * pointer.
   */
  async purgeAccount(accountId: number | string): Promise<AccountPurgeResult> {
    const sessions = await this.sessions.purgeAccount(accountId);
    const accounts = await this.accounts.purgeAccount(accountId);
    return { accounts, sessions };
  }
}
