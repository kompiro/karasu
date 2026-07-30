import { describe, it, expect } from "vitest";
import { groupByAxis, type GroupByMode } from "./preview-context.js";

describe("groupByAxis — the shared selector-to-core axis conversion (#2033)", () => {
  // Type-level exhaustiveness: adding a mode to GroupByMode fails typecheck on
  // this `satisfies`, forcing the fence to cover the new value. The regression
  // was a per-surface hardcode (`=== "team" ? "team" : undefined`) that only
  // forwarded the first axis and silently dropped "boundary" from the export
  // surfaces (TPL-219).
  const MODES = { none: 0, team: 0, boundary: 0 } satisfies Record<GroupByMode, unknown>;
  const allModes = Object.keys(MODES) as GroupByMode[];

  it('maps "none" to undefined and passes every other mode through unchanged', () => {
    for (const mode of allModes) {
      // Value transparency: the expectation is the mode itself, not an
      // enumerated mapping — a new axis value passes with no edit here.
      expect(groupByAxis(mode)).toBe(mode === "none" ? undefined : mode);
    }
  });
});
