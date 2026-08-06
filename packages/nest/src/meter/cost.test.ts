import { describe, expect, it } from "vitest";
import { costUsd, isPricedModel, PRICING_AS_OF, toCents, UnknownModelError } from "./cost.js";

describe("costUsd", () => {
  it("prices input and output at their separate rates", () => {
    // Opus 5: $5/1M in, $25/1M out. A single blended rate would understate
    // this pipeline badly, which is output-heavy by design.
    expect(costUsd("claude-opus-5", { inputTokens: 1_000_000, outputTokens: 0 })).toBe(5);
    expect(costUsd("claude-opus-5", { inputTokens: 0, outputTokens: 1_000_000 })).toBe(25);
  });

  it("prices a run at the spike's measured scale", () => {
    // #1991 measured roughly 0.3-0.5M output tokens for an 85-file repo. The
    // quota argument in #1994 starts from this number, so it is pinned here
    // rather than left to be recomputed by hand.
    const cost = costUsd("claude-opus-5", { inputTokens: 400_000, outputTokens: 400_000 });
    expect(Math.round(cost * 100) / 100).toBe(12);
  });

  it("refuses a model it has no price for, rather than guessing", () => {
    // A guessed price feeds a quota decision. An error is recoverable; a
    // plausible wrong number is not.
    expect(() => costUsd("claude-imaginary-9", { inputTokens: 1, outputTokens: 1 })).toThrowError(
      UnknownModelError,
    );
    expect(isPricedModel("claude-imaginary-9")).toBe(false);
    expect(isPricedModel("claude-opus-5")).toBe(true);
  });

  it("dates its prices, so a report is reproducible", () => {
    expect(PRICING_AS_OF).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("toCents", () => {
  it("rounds up, so an estimate never lands under the bill", () => {
    expect([toCents(0.011), toCents(0.01), toCents(0)]).toEqual([2, 1, 0]);
  });
});
