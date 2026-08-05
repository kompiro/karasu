/**
 * The ledger that makes the quota real.
 *
 * Two counters, both in KV, both under prefixes the purge sweeps (TPL-2226):
 *
 * - `quota/<installation prefix>/<YYYY-MM>` — reverses started this month
 * - `busy/<installation prefix>/<instance id>` — one key per run in flight
 *
 * **Neither is exact, and they are inexact in different ways.** Say so
 * plainly, because the reason there is no Durable Object here is that the
 * imprecision is affordable, and that argument only survives if the
 * imprecision is described honestly.
 *
 * The monthly counter is a read-modify-write, so a genuine race can lose an
 * increment. That gives someone one extra reverse, costing about $3.60. It is
 * the counter that actually bounds spend, and it errs by at most one per
 * race.
 *
 * The in-flight counter is not a counter at all: it is one key per run, and
 * `inFlight` counts the live ones. It can only ever read **low** — a
 * `list` is eventually consistent, a slot whose metadata did not survive is
 * not counted, and the route's check-then-create window admits a second
 * caller. So concurrency is a *soft* bound: it smooths the rate of spend, and
 * the monthly quota is what makes the bill finite. An earlier version of this
 * comment claimed the opposite (that it overcounts, and therefore fails
 * safe); it does not, and a design that leaned on that would be leaning on
 * nothing.
 *
 * Slots also need a floor. A run that dies without releasing — an evicted
 * isolate, a platform cancellation — would otherwise hold its slot until
 * something notices. Each slot carries an expiry, and expired slots are
 * ignored.
 */
import type { KVNamespaceLike } from "../env.js";
import { installationPrefix } from "../store/keys.js";
import { quotaPeriod } from "./policy.js";

/** Kept a year and a bit, so a month can be compared with the same month. */
const QUOTA_TTL_SECONDS = 400 * 24 * 60 * 60;

/**
 * How long a slot is held before it is presumed abandoned.
 *
 * Generously above the measured 12-19 minutes, so a slow run is never evicted
 * from under itself, and far below the day a stuck slot would otherwise block
 * (`RunStatusStore.STALE_AFTER_MS` uses the same reasoning for the same
 * reason).
 */
const SLOT_TTL_SECONDS = 90 * 60;

const MAX_PAGES = 50;

function quotaKey(installationId: number | string, period: string): string {
  // `installationPrefix` ends in a separator and folds `042` onto `42`
  // (TPL-2284), so two spellings of one installation cannot buy two quotas.
  return `quota/${installationPrefix(installationId)}${period}`;
}

/**
 * One key per in-flight run, so an abandoned one expires by itself.
 *
 * Under the installation prefix rather than a flat `busy/v1/runs/` namespace,
 * so that uninstalling sweeps it with everything else (TPL-2226). The
 * instance id already begins with the installation id, but a prefix a purge
 * can scan is not the same thing as a substring.
 */
function slotKey(installationId: number | string, instanceId: string): string {
  return `busy/${installationPrefix(installationId)}${instanceId}`;
}

export class QuotaLedger {
  constructor(private readonly kv: KVNamespaceLike) {}

  /** Reverses this installation has started in the month containing `at`. */
  async used(installationId: number | string, at: Date): Promise<number> {
    const raw = await this.kv.get(quotaKey(installationId, quotaPeriod(at)));
    if (raw === null) return 0;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  /**
   * Charge one reverse to this installation.
   *
   * Called when a run is *dispatched*, not when it succeeds. A failed attempt
   * cost real money (the passes it completed were billed), so not charging
   * for it would let a repository that reliably fails burn the budget without
   * ever touching its quota.
   */
  async charge(installationId: number | string, at: Date): Promise<number> {
    const period = quotaPeriod(at);
    const next = (await this.used(installationId, at)) + 1;
    await this.kv.put(quotaKey(installationId, period), next.toString(), {
      expirationTtl: QUOTA_TTL_SECONDS,
      metadata: { n: next },
    });
    return next;
  }

  /**
   * The next attempt number for one commit, which only ever goes up.
   *
   * The instance id needs a discriminator with two properties that pull in
   * opposite directions: two callers racing the same dispatch must compute the
   * *same* id (so the platform rejects the loser instead of starting a second
   * billed run), while a retry after a failure must compute a *different* one
   * (so it is not rejected as a duplicate of the attempt that failed).
   *
   * The monthly charge count looked like it satisfied both, and it does not:
   * `refund` moves it backwards, so the next dispatch reuses a number, and the
   * platform answers `(instance.already_exists)`. Clearing the counter by hand
   * -- which an operator will do -- has the same effect. This counter is never
   * refunded and never reset, so a number is never handed out twice.
   *
   * Under the `quota/` prefix on purpose: it is already swept by
   * `purgeInstallation`, so no new key space escapes the purge (TPL-2226).
   */
  async nextAttempt(installationId: number | string, sha: string): Promise<number> {
    const key = `quota/${installationPrefix(installationId)}seq/${sha.slice(0, 12)}`;
    const raw = await this.kv.get(key);
    const parsed = raw === null ? 0 : Number.parseInt(raw, 10);
    const next = (Number.isFinite(parsed) && parsed > 0 ? parsed : 0) + 1;
    await this.kv.put(key, next.toString(), { expirationTtl: QUOTA_TTL_SECONDS });
    return next;
  }

  /**
   * Give a charge back.
   *
   * Only for a dispatch that never happened — the Workflow refused to start,
   * so nothing was billed. Not for a run that failed: that one was paid for.
   */
  async refund(installationId: number | string, at: Date): Promise<void> {
    const current = await this.used(installationId, at);
    if (current === 0) return;
    await this.kv.put(quotaKey(installationId, quotaPeriod(at)), (current - 1).toString(), {
      expirationTtl: QUOTA_TTL_SECONDS,
      metadata: { n: current - 1 },
    });
  }

  /**
   * Live slots across the whole deployment, ignoring any whose holder is
   * presumed dead.
   *
   * Reads low under doubt; see the note at the top of this file.
   */
  async inFlight(nowMs: number): Promise<number> {
    let live = 0;
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const listed = await this.kv.list({ prefix: "busy/", limit: 1000, cursor });
      for (const key of listed.keys) {
        // From metadata: one `get` per slot would be a subrequest per slot,
        // and this runs on the accept path of every generation request.
        const meta = key.metadata;
        const expiresAt =
          typeof meta === "object" && meta !== null
            ? (meta as { expiresAt?: unknown }).expiresAt
            : undefined;
        if (typeof expiresAt === "number" && expiresAt > nowMs) live += 1;
      }
      if (listed.list_complete || listed.cursor === undefined) break;
      cursor = listed.cursor;
    }
    return live;
  }

  /**
   * Take a slot. Keyed on the instance id, so a duplicate take is idempotent
   * rather than a second slot — and so the run that owns the id is the one
   * that can give it back.
   */
  async takeSlot(
    installationId: number | string,
    instanceId: string,
    nowMs: number,
    /** `owner/repo`, so a repo leaving an installation can drop its slots. */
    repo?: string,
  ): Promise<void> {
    await this.kv.put(slotKey(installationId, instanceId), "1", {
      expirationTtl: SLOT_TTL_SECONDS,
      metadata: {
        expiresAt: nowMs + SLOT_TTL_SECONDS * 1000,
        ...(repo === undefined ? {} : { repo }),
      },
    });
  }

  /**
   * Drop every slot belonging to one repo.
   *
   * For a repo leaving an installation: the slot key names it, and the run it
   * belongs to is about to lose its access anyway. The instance id begins
   * with the installation id and carries the commit, not the repo name, so
   * this matches on the recorded owner and repo instead — which means it has
   * to read them from the value rather than the key.
   */
  async releaseRepoSlots(ref: {
    installationId: number | string;
    owner: string;
    repo: string;
  }): Promise<number> {
    const prefix = `busy/${installationPrefix(ref.installationId)}`;
    const wanted = `${ref.owner}/${ref.repo}`;
    let deleted = 0;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const listed = await this.kv.list({ prefix, limit: 1000 });
      const matching = listed.keys.filter((key) => {
        const meta = key.metadata;
        return (
          typeof meta === "object" && meta !== null && (meta as { repo?: unknown }).repo === wanted
        );
      });
      if (matching.length === 0) return deleted;
      for (const key of matching) {
        await this.kv.delete(key.name);
        deleted += 1;
      }
    }
    throw new Error(`slot release did not converge for prefix ${prefix}`);
  }

  /** Give a slot back. Safe to call for a slot that is already gone. */
  async releaseSlot(installationId: number | string, instanceId: string): Promise<void> {
    await this.kv.delete(slotKey(installationId, instanceId));
  }

  /**
   * Delete an installation's quota counters.
   *
   * Uninstalling clears the ledger along with everything else (ADR-1990
   * decision 6, TPL-2226). This does mean a reinstall gets a fresh month --
   * accepted: the alternative is retaining a record of an organisation's
   * usage after they asked the service to forget them, to defend against an
   * abuse that costs the abuser more effort than three reverses are worth.
   */
  async purgeInstallation(installationId: number | string): Promise<number> {
    // Both prefixes. A slot expires within 90 minutes on its own, but "it
    // goes away eventually" is not what decision 6 promises, and the key
    // carries the owner and repo names.
    return (
      (await this.purgePrefix(`quota/${installationPrefix(installationId)}`)) +
      (await this.purgePrefix(`busy/${installationPrefix(installationId)}`))
    );
  }

  private async purgePrefix(prefix: string): Promise<number> {
    const seen = new Set<string>();
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const listed = await this.kv.list({ prefix, limit: 1000 });
      const fresh = listed.keys.filter((key) => !seen.has(key.name));
      if (fresh.length === 0) return seen.size;
      for (const key of fresh) {
        await this.kv.delete(key.name);
        seen.add(key.name);
      }
    }
    throw new Error(`quota purge did not converge for prefix ${prefix}`);
  }
}
