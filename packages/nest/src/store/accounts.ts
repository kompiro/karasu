/**
 * The account record: who submitted, and nothing else.
 *
 * The gallery authenticates the **submitter**, not their authority over any
 * repository — a submission is not repository-bound at all (#2587). What the
 * login buys is a handle that can be held responsible and suspended, which is
 * why anonymous submission was rejected: with it there is nobody to answer a
 * withdrawal request and no way to stop abuse.
 *
 *     acct/v1/<account> -> { accountId, login, firstSeenAt, lastSeenAt }
 *
 * **This is the service's first personal data, and it is deliberate.**
 * ADR-2262 declined email notification precisely because it would be that, and
 * everything a privacy policy has to say follows from it. ADR-2578 accepts the
 * line being crossed for the identifier — and no further: there is no email
 * address here, because nothing the gallery stores expires, so nobody ever has
 * to be warned before it does.
 *
 * The login is stored so the console and a submission page can say who
 * submitted something without a GitHub round trip on the read path. It is a
 * cached display name: GitHub lets its owner rename it, so it is refreshed on
 * every sign-in and never used as a key (`gallery-keys.ts` explains why the
 * numeric id is).
 */
import type { KVNamespaceLike } from "../env.js";
import { accountKey, normaliseAccountId } from "./gallery-keys.js";

export interface Account {
  /** GitHub's numeric user id, canonicalised. Stable across renames. */
  accountId: string;
  /** GitHub login at last sign-in. Display only. */
  login: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export class AccountStore {
  constructor(private readonly kv: KVNamespaceLike) {}

  async get(accountId: number | string): Promise<Account | undefined> {
    const raw = await this.kv.get(accountKey(accountId));
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
      typeof record.firstSeenAt !== "string" ||
      typeof record.lastSeenAt !== "string"
    ) {
      return undefined;
    }
    return {
      accountId: record.accountId,
      login: record.login,
      firstSeenAt: record.firstSeenAt,
      lastSeenAt: record.lastSeenAt,
    };
  }

  /**
   * Record a sign-in, creating the account on first sight.
   *
   * `firstSeenAt` is preserved across sign-ins: it is the only thing here that
   * cannot be recovered from GitHub afterwards, so overwriting it would
   * quietly destroy the record's one piece of history.
   *
   * No TTL. An account that expired on its own would take its submissions'
   * owner with it while the submissions stayed — and the submitter would find
   * content of theirs that nobody could withdraw.
   */
  async signIn(accountId: number | string, login: string, at: Date): Promise<Account> {
    const canonical = normaliseAccountId(accountId);
    const now = at.toISOString();
    const existing = await this.get(canonical);
    const account: Account = {
      accountId: canonical,
      login,
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt: now,
    };
    await this.kv.put(accountKey(canonical), JSON.stringify(account));
    return account;
  }

  /**
   * Remove the account record. Part of `GalleryStore.purgeAccount`.
   *
   * A `delete` of the exact key, **not** a prefix sweep. `acct/v1/42` is a
   * prefix of `acct/v1/420`, so sweeping it would delete a stranger's account
   * along with the one that asked to go. The sibling stores can sweep because
   * their prefixes end in `/`, which no account id can extend past.
   */
  async purgeAccount(accountId: number | string): Promise<number> {
    const key = accountKey(accountId);
    const existed = (await this.kv.get(key)) !== null;
    await this.kv.delete(key);
    return existed ? 1 : 0;
  }
}
