/**
 * The decision: may this installation start a reverse right now?
 *
 * Separate from both the ledger and the route so the policy can be read in
 * one screen and tested without a Request. The order of the two checks is
 * deliberate — quota first, then capacity — because "you have used your three
 * for the month" is a stable answer a caller can act on, while "come back in
 * five minutes" is not. Telling someone to wait and then refusing them on
 * quota would waste both their wait and our KV reads.
 */
import type { QuotaLedger } from "./ledger.js";
import {
  BUSY_RETRY_AFTER_SECONDS,
  MAX_CONCURRENT_RUNS,
  MONTHLY_REVERSES,
  nextPeriodStart,
  type QuotaOutcome,
} from "./policy.js";

export interface GateOptions {
  /** Overrides for tests and for a future paid tier. */
  monthlyReverses?: number;
  maxConcurrentRuns?: number;
}

export async function checkQuota(
  ledger: QuotaLedger,
  installationId: number | string,
  at: Date,
  options: GateOptions = {},
): Promise<QuotaOutcome> {
  const limit = options.monthlyReverses ?? MONTHLY_REVERSES;
  const concurrency = options.maxConcurrentRuns ?? MAX_CONCURRENT_RUNS;

  const used = await ledger.used(installationId, at);
  if (used >= limit) {
    return {
      allowed: false,
      reason: "exhausted",
      used,
      limit,
      resetsAt: nextPeriodStart(at),
    };
  }

  const running = await ledger.inFlight(at.getTime());
  if (running >= concurrency) {
    return { allowed: false, reason: "busy", retryAfterSeconds: BUSY_RETRY_AFTER_SECONDS };
  }

  return { allowed: true, used, limit };
}
