/**
 * Sessions, stored under the account so signing out everywhere is a sweep.
 *
 *     sess/v1/<account>/<session> -> { accountId, login, issuedAt }
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
import type { KVNamespaceLike } from "../env.js";
import { newSessionId, sessionKey, sessionPrefix, normaliseAccountId } from "./gallery-keys.js";
import { purgeByPrefix } from "./sweep.js";

/**
 * 30 days.
 *
 * Long enough that managing your own submissions does not mean signing in
 * every visit, short enough that a cookie copied off a shared machine stops
 * working without anyone having to notice. Renewed on use, so an active
 * session does not expire under someone mid-edit.
 */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface Session {
  accountId: string;
  login: string;
  issuedAt: string;
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
    const session: Session = { accountId: canonical, login, issuedAt: at.toISOString() };
    await this.kv.put(sessionKey(canonical, sessionId), JSON.stringify(session), {
      expirationTtl: SESSION_TTL_SECONDS,
    });
    return { sessionId, session };
  }

  async get(accountId: number | string, sessionId: string): Promise<Session | undefined> {
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
    return { accountId: record.accountId, login: record.login, issuedAt: record.issuedAt };
  }

  async revoke(accountId: number | string, sessionId: string): Promise<void> {
    await this.kv.delete(sessionKey(accountId, sessionId));
  }

  /** Every session this account holds. Sign-out-everywhere, and part of purge. */
  async purgeAccount(accountId: number | string): Promise<number> {
    return await purgeByPrefix(this.kv, sessionPrefix(accountId));
  }
}
