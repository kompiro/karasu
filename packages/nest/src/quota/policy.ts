/**
 * How much free generation an installation gets, and why that number.
 *
 * ADR-1990 decision 3 chose service-paid inference with a strict free-tier
 * quota and left the level open until #2226 measured what a reverse costs.
 * That measurement (`docs/design/2226-nest-cost-model.md`) puts the
 * structural ceiling at roughly $3.60 per reverse: output is capped at 84k
 * tokens across three passes, and a pass that hits its limit throws rather
 * than truncating.
 *
 * At that price, a $50-100 monthly budget buys 14-27 reverses. Three per
 * installation per month sits inside it for ten installations ($108 at the
 * ceiling, closer to $65 at the typical price) while being enough to try the
 * thing on more than one repository.
 *
 * The numbers are deliberately in one place, named, with the arithmetic that
 * produced them. A quota constant with no derivation gets raised by whoever
 * next finds it inconvenient.
 */

/** Reverses one installation may start per calendar month, free. */
export const MONTHLY_REVERSES = 3;

/**
 * Generations the whole deployment will run at once.
 *
 * One. Parallelism does not make any individual reverse finish sooner — each
 * is minutes of sequential model calls — so all it buys is a faster rate of
 * spend. The commit-derived Workflow instance id (#2288) already prevents the
 * same commit running twice; this bounds different repositories.
 */
export const MAX_CONCURRENT_RUNS = 1;

/**
 * How long a caller is asked to wait when the deployment is busy.
 *
 * Below the measured 12-19 minutes on purpose: a caller who retries at 5
 * minutes and is refused again has learnt something (it is still busy) at the
 * cost of one cheap request, which beats being told to come back in twenty
 * and finding the slot went to someone else.
 */
export const BUSY_RETRY_AFTER_SECONDS = 5 * 60;

/** Where a refused caller is pointed. Refusing without this is a dead end. */
export const LOCAL_REVERSE_GUIDE =
  "https://github.com/kompiro/karasu/blob/main/docs/guide/reverse-engineering-with-ai.md";

/** The calendar month a moment falls in, as `YYYY-MM`. UTC, so it is stable. */
export function quotaPeriod(at: Date): string {
  return at.toISOString().slice(0, 7);
}

export type QuotaOutcome =
  | { allowed: true; used: number; limit: number }
  | { allowed: false; reason: "exhausted"; used: number; limit: number; resetsAt: string }
  | { allowed: false; reason: "busy"; retryAfterSeconds: number };

/** First instant of the month after the one `at` falls in, ISO-8601. */
export function nextPeriodStart(at: Date): string {
  const year = at.getUTCFullYear();
  const month = at.getUTCMonth();
  return new Date(Date.UTC(month === 11 ? year + 1 : year, (month + 1) % 12, 1)).toISOString();
}
