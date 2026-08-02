/**
 * `GET /admin/metrics` — the numbers #2226 exists to produce.
 *
 * Aggregates only. No owner, no repo, no per-installation breakdown: the
 * question ADR-1990 decision 3 left open is "can a solo maintainer pay for
 * this, and at what quota", and that is answered by totals. A per-repo report
 * would answer a question nobody asked while turning this endpoint into a
 * disclosure of who has the App installed — including the private
 * repositories, whose existence the generate route deliberately refuses to
 * confirm.
 *
 * Auth is a bearer token in a secret, compared in constant time. Not because
 * token counts are sensitive, but because an unauthenticated endpoint that
 * enumerates KV is a free way to make the service pay for reads.
 */
import { requireBinding } from "../env.js";
import { error, json } from "../http.js";
import { costUsd, isPricedModel, PRICING_AS_OF } from "../meter/cost.js";
import { ReadCounter } from "../meter/reads.js";
import { MetricsStore } from "../meter/record.js";
import type { RouteContext } from "../router.js";

/**
 * Compare two secrets without leaking where they diverge, or how long the
 * real one is.
 *
 * Both sides are hashed first, so the comparison always runs over 32 bytes
 * whatever was presented. An XOR-accumulate over the raw strings would be
 * constant-time in *content* but not in *length*: its loop bound is
 * `max(presented, expected)`, so response time flattens out at exactly the
 * secret's length. Not a practical attack over a network, but the cheap fix
 * removes the need to argue about it.
 */
async function secretsMatch(presented: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(presented)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return diff === 0;
}

function bearerFrom(request: Request): string | undefined {
  const header = request.headers.get("Authorization");
  if (header === null) return undefined;
  // Case-insensitive and whitespace-tolerant: RFC 7235 makes the scheme token
  // case-insensitive, and `bearer  <token>` failing as "wrong token" is a
  // debugging session nobody needs to have.
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1];
}

export async function metricsReport(context: RouteContext): Promise<Response> {
  const { request, env } = context;
  const expected = requireBinding(env, "METRICS_TOKEN");
  const presented = bearerFrom(request);
  if (presented === undefined || !(await secretsMatch(presented, expected))) {
    // One answer for "no token" and "wrong token", for the same reason the
    // webhook gives one answer for "unsigned" and "mis-signed".
    return error(401, "unauthorized", "This endpoint requires a bearer token.");
  }

  const kv = requireBinding(env, "KRS_CACHE");
  const totals = await new MetricsStore(kv).summarise();
  const reads = await new ReadCounter(kv).totalReads();

  // Cost is summed per model and only for models with a price on record. A
  // single number that silently omits an unpriced model would be read as the
  // whole bill.
  let costUsdTotal = 0;
  const unpriced: string[] = [];
  for (const [model, usage] of Object.entries(totals.byModel)) {
    if (!isPricedModel(model)) {
      unpriced.push(model);
      continue;
    }
    costUsdTotal += costUsd(model, usage);
  }

  const perRun = (value: number): number =>
    totals.runs === 0 ? 0 : Math.round((value / totals.runs) * 100) / 100;

  return json({
    pricingAsOf: PRICING_AS_OF,
    runs: totals.runs,
    /** Attempts that produced nothing. Counted in `runs`: they were billed. */
    failedRuns: totals.failedRuns,
    reads,
    /**
     * The read count is a lower bound, sometimes a very loose one -- KV serves
     * the counter's read from a per-colo cache, so bursts collapse. Labelled
     * rather than left for a reader to assume precision. See `meter/reads.ts`.
     */
    readsAreLowerBound: true,
    /** The ratio the quota argument turns on: readers bought per generation. */
    readsPerRun: perRun(reads),
    tokens: {
      input: totals.inputTokens,
      output: totals.outputTokens,
      inputPerRun: perRun(totals.inputTokens),
      outputPerRun: perRun(totals.outputTokens),
    },
    duration: {
      p50Ms: totals.durationP50Ms,
      p95Ms: totals.durationP95Ms,
      meanMs: perRun(totals.durationMs),
    },
    input: {
      files: totals.files,
      bytesRead: totals.bytesRead,
      redactions: totals.redactions,
      filesPerRun: perRun(totals.files),
    },
    /** Set when a total is incomplete, so no figure here reads as final. */
    ...(totals.truncated || totals.skipped > 0
      ? { incomplete: { truncated: totals.truncated, skippedRecords: totals.skipped } }
      : {}),
    cost: {
      totalUsd: Math.round(costUsdTotal * 10_000) / 10_000,
      perRunUsd: totals.runs === 0 ? 0 : Math.round((costUsdTotal / totals.runs) * 10_000) / 10_000,
      byModel: totals.byModel,
      ...(unpriced.length === 0 ? {} : { unpricedModels: unpriced }),
    },
  });
}
