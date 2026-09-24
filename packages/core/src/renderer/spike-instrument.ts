/**
 * SPIKE INSTRUMENTATION — spike/width-budget-ladder, Issue #2761 option 3.
 * NOT FOR MERGE. This module exists only so the width-budget ladder can be
 * reconfigured and counted from a harness; nothing in the product reads it
 * except the two counter increments in `aspect-search.ts` / `layout.ts`.
 */

export interface LadderConfig {
  /** Number of candidate budgets, floor included (product default: 12). */
  steps: number;
  /** How far above the floor the ladder reaches (product default: 6). */
  maxMultiple: number;
  /**
   * Stop after this many consecutive candidates fail to improve the incumbent
   * (`null` = today's rule: evaluate every candidate unless `exhausted`).
   */
  patience: number | null;
}

export const ladder: LadderConfig = { steps: 12, maxMultiple: 6, patience: null };

export const counters = {
  /** `searchWidthBudget` calls. */
  searches: 0,
  /** Candidate placements run by the search. */
  candidates: 0,
  /** Channel-reservation re-placements (`layout()` second pass). */
  replacements: 0,
  /** Wall time inside the first (floor) candidate placement of each search. */
  firstCandidateMs: 0,
  /** Wall time inside every candidate placement after the first. */
  extraCandidateMs: 0,
  /** Searches that ran more than one candidate. */
  searchesBeyondFirst: 0,
};

/** Winning canvas of the most recent `layout()` call. */
export const lastLayout = { width: 0, height: 0, budget: 0 };

export function resetCounters(): void {
  counters.searches = 0;
  counters.candidates = 0;
  counters.replacements = 0;
  counters.firstCandidateMs = 0;
  counters.extraCandidateMs = 0;
  counters.searchesBeyondFirst = 0;
}

export function configureLadder(config: Partial<LadderConfig>): void {
  Object.assign(ladder, config);
}

/**
 * `KARASU_SPIKE_LADDER=steps=8,maxMultiple=6,patience=2` — so `pnpm
 * bench:render` can be pointed at a configuration without editing it.
 */
function fromEnv(): void {
  const raw = process.env.KARASU_SPIKE_LADDER;
  if (!raw) return;
  for (const part of raw.split(",")) {
    const [key, value] = part.split("=");
    if (key === "steps") ladder.steps = Number(value);
    else if (key === "maxMultiple") ladder.maxMultiple = Number(value);
    else if (key === "patience") ladder.patience = value === "off" ? null : Number(value);
    else throw new Error(`KARASU_SPIKE_LADDER: unknown key ${key}`);
  }
}
fromEnv();

/**
 * SPIKE (#2761 option 4): one entry per candidate placement the search ran,
 * `[searchId, budget, width, height, exhausted]`. A harness uses it to count
 * how many candidates produced a canvas identical to the one before them —
 * the ceiling on what a "skip candidates that cannot change the placement"
 * rule could save.
 */
export const candidateTrace: number[][] = [];
export const traceState = { on: false, searchId: 0 };

/**
 * SPIKE (#2761 option 5): the bounding box of the placed cards and containers
 * of the most recent `layoutInner` run, taken **before** the routing chain.
 * Edges only ever push the canvas outward, so this is a lower bound on the
 * canvas that run will end up with — the quantity a "this candidate cannot
 * win, skip its routing" prune would test.
 */
export const preRouting = { width: 0, height: 0 };
