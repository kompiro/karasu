/**
 * The width-budget search stays a pure function of the model, measured on
 * **every view of every example** (TPL-2593).
 *
 * The search re-runs a placement per candidate budget and keeps one result, so
 * anything a run reads besides the model and the constants (the clock,
 * randomness, the viewport, what an earlier render or an earlier candidate left
 * behind) turns the same input into a different drawing. `aspect-search.test.ts`
 * holds this on the helper with synthetic placements; this file holds it on
 * the real placements, through every path that reaches `searchWidthBudget`
 * (`layout()` and `layoutDeploy()` today, and any caller added later) and
 * every view the all-views bundle draws, in every Group-by mode. A new example,
 * view or caller is covered the day the corpus reaches it (ADR-3038 D4).
 *
 * - **No outside input.** The corpus is drawn twice: the second pass in the
 *   reverse order, with the clock, `performance.now`, `Math.random` and the
 *   viewport globals all moved, and with a primer drawn before each entry.
 *   Every SVG must come out byte-identical. A run that reads any of them, or
 *   keeps something from the previous render, draws differently in one of the
 *   passes. The primer is there because nearly every example keeps the floor
 *   budget, so the corpus alone leaves little behind that differs; the primer
 *   is a view the search widens (asserted in the test).
 * - **Trials leave nothing behind.** `searchWidthBudget` is wrapped: after it
 *   returns, every candidate it tried is placed again and must equal the run it
 *   produced the first time. A trial that mutates the input or a shared map
 *   makes the replay differ.
 */
import { isDeepStrictEqual } from "node:util";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Parser } from "../parser/parser.js";
import { searchWidthBudget } from "./aspect-search.js";
import {
  GROUP_BY_MODES,
  loadExampleCorpus,
  renderEveryView,
  type ExampleEntry,
} from "./fixtures/example-corpus.js";

const replays = { searches: 0, trials: 0, widened: 0 };
const impure: string[] = [];
vi.mock("./aspect-search.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./aspect-search.js")>();
  const wrapped: typeof mod.searchWidthBudget = (place, size, opts) => {
    // Each run is copied as it is made: a later candidate that mutates a map
    // or array the kept run shares would otherwise change the copy it is
    // compared against along with it, and the replay would match.
    const tried: { budget: number; run: ReturnType<typeof place>; snapshot: unknown }[] = [];
    const found = mod.searchWidthBudget(
      (budget) => {
        const run = place(budget);
        tried.push({ budget, run, snapshot: structuredClone(run) });
        return run;
      },
      size,
      opts,
    );
    replays.searches++;
    if (found.budget !== opts.floor) replays.widened++;
    for (const { budget, run, snapshot } of tried) {
      replays.trials++;
      if (!isDeepStrictEqual(run, snapshot)) {
        impure.push(`budget ${budget} of ${tried.length}: changed after it was made`);
      } else if (!isDeepStrictEqual(place(budget), snapshot)) {
        impure.push(`budget ${budget} of ${tried.length}: places differently again`);
      }
    }
    return found;
  };
  return { ...mod, searchWidthBudget: wrapped };
});

/** Globals a placement could read the viewport from, were one ever to. */
const VIEWPORT = ["innerWidth", "innerHeight", "devicePixelRatio"] as const;

/**
 * Forty cards too wide for three to share the floor's row: the search moves
 * this view off the floor (the shape `layout.test.ts` pins for #2593).
 */
const PRIMER: ExampleEntry = {
  name: "primer",
  krsFile: Parser.parse(
    `system Sys {\n${Array.from(
      { length: 40 },
      (_s, i) =>
        `  service S${i} {\n    label "Service number ${i}"\n    description "A deliberately long description so the card measures wide enough to crowd the fixed row budget"\n  }`,
    ).join("\n")}\n}`,
  ).value,
  styleSheets: [],
};

function drawAll(
  entries: readonly ExampleEntry[],
  outside: { now: number; random: number; viewport: number; primer?: boolean },
): Map<string, string> {
  vi.useFakeTimers({ toFake: ["Date", "performance"], now: outside.now });
  vi.spyOn(Math, "random").mockReturnValue(outside.random);
  for (const key of VIEWPORT) {
    Object.defineProperty(globalThis, key, { value: outside.viewport, configurable: true });
  }
  const svgs = new Map<string, string>();
  for (const entry of entries) {
    if (outside.primer) renderEveryView(PRIMER, "none");
    for (const mode of GROUP_BY_MODES) {
      svgs.set(`${entry.name} [${mode}]`, renderEveryView(entry, mode));
    }
  }
  return svgs;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const key of VIEWPORT) Reflect.deleteProperty(globalThis, key);
});

let entries: ExampleEntry[] = [];
// Resolves every example once; 120 s leaves the same CI headroom as the tests.
beforeAll(async () => {
  entries = await loadExampleCorpus();
}, 120_000);

// Each test walks every view of every example. Under coverage instrumentation
// on a CI runner that outlasts vitest's 5 s default, hence the explicit budget.
describe(
  "the width-budget search over every view of every example (TPL-2593)",
  { timeout: 60_000 },
  () => {
    it("draws the same SVG with the clock, randomness, viewport and render order moved", () => {
      const first = drawAll(entries, { now: 0, random: 0.25, viewport: 800 });
      vi.useRealTimers();
      vi.restoreAllMocks();
      const second = drawAll([...entries].reverse(), {
        now: 9_000_000_000_000,
        random: 0.75,
        viewport: 3000,
        primer: true,
      });
      const differing = [...first].filter(([key, svg]) => second.get(key) !== svg).map(([k]) => k);
      expect(first.size).toBeGreaterThan(200);
      // The primer moves the search off the floor, so it leaves a different
      // result behind than the examples, nearly all of which keep the floor.
      const widened = replays.widened;
      renderEveryView(PRIMER, "none");
      expect(replays.widened).toBeGreaterThan(widened);
      expect(differing).toEqual([]);
    });

    it("every candidate a search tried places the same again afterwards", () => {
      // The search runs during the draws above as well; these counts and the
      // list cover all of them.
      drawAll(entries, { now: 0, random: 0.5, viewport: 1200 });
      expect(replays.searches).toBeGreaterThan(1000);
      // Some views try more than one budget, so a trial that dirties shared
      // state for the next one has a next one to dirty.
      expect(replays.trials).toBeGreaterThan(replays.searches);
      expect(impure).toEqual([]);
    });

    it("rejects a placement that reuses one mutable result (negative control)", () => {
      // One object returned for every budget: each trial overwrites the run an
      // earlier trial returned. The replay alone would match (it overwrites the
      // object again); the copy taken when the run was made does not.
      const run = { width: 0, height: 900 };
      const before = impure.length;
      searchWidthBudget(
        (budget) => {
          run.width = budget;
          return run;
        },
        (r) => ({ width: r.width, height: r.height }),
        { floor: 1200 },
      );
      const caught = impure.splice(before);
      expect(caught.length).toBeGreaterThan(0);
    });
  },
);
