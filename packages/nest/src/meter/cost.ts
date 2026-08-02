/**
 * What one reverse costs, in dollars.
 *
 * ADR-1990 decision 3 chose service-paid inference with a strict free-tier
 * quota, and deliberately left the quota level open until a real measurement
 * existed (#2226). This module is the arithmetic half of that measurement: it
 * turns token counts into money so a quota can be argued about in the unit
 * that actually constrains it — a solo maintainer's card.
 *
 * Prices are per million tokens, in USD, and they are a **dated snapshot**.
 * They are not fetched: a cost report that silently changes its answer when a
 * price changes is worse than one that is visibly stale, because nobody can
 * reproduce last month's number. `PRICING_AS_OF` is part of every report.
 */

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** The date the prices below were read from Anthropic's pricing page. */
export const PRICING_AS_OF = "2026-06-24";

interface ModelPricing {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
}

/**
 * Only the models this service can actually be pointed at.
 *
 * Deliberately not a copy of the whole price list. An entry here is a claim
 * that the service has been run on that model; an unknown model is an error
 * rather than a guess, because a guessed price feeds a quota decision.
 */
const PRICING: Record<string, ModelPricing> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export class UnknownModelError extends Error {
  constructor(model: string) {
    super(`no price on record for model ${model} (as of ${PRICING_AS_OF})`);
    this.name = "UnknownModelError";
  }
}

/** Cost of one call, in USD. */
export function costUsd(model: string, usage: TokenUsage): number {
  const price = PRICING[model];
  if (price === undefined) throw new UnknownModelError(model);
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}

/** Whether a report can be produced for this model at all. */
export function isPricedModel(model: string): boolean {
  return model in PRICING;
}

/**
 * Round to whole cents *upwards*.
 *
 * Ceiling rather than nearest because every use of this is a spend estimate,
 * and an estimate that rounds down accumulates into a bill larger than the
 * report said.
 */
export function toCents(usd: number): number {
  return Math.ceil(usd * 100);
}
