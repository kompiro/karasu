import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * ADR-2077 fixes prose, not an interface. Spike #1991 measured that the
 * bounded-context directive moves a repository from `domain-F1 0.40` to an
 * exact match with the human decomposition, and that *summarising* it — losing
 * the three split conditions — regresses toward the unguided result. So
 * whatever karasu tells a model about decomposition has to keep saying what
 * the ADR decided.
 *
 * **This guard moved when its subject did.** It used to compare
 * `BOUNDED_CONTEXT_DIRECTIVE` in `packages/nest` against ADR-2077's quote block
 * word for word, because a prompt fragment either is the recorded text or is
 * not. #2590 retired server-side generation, so the only consumer left is the
 * local `reverse-architecture` skill — which states the rule in its own words
 * on purpose, being instructions to an agent that has context rather than a
 * fragment spliced into a prompt.
 *
 * So the check is now by concept rather than by wording: the three seam
 * conditions and the fold-up rule are what the spike measured as load-bearing,
 * and a rewrite that keeps the heading while dropping one of them is exactly
 * the regression that was measured. Both sides are asserted, so neither the
 * ADR nor the skill can quietly lose one alone.
 *
 * It lives under `scripts/` rather than in a package because it reads two
 * files that belong to no package.
 */
const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const ADR = "../../docs/adr/2077-reverse-bc-granularity.md";
const SKILL = "../../.claude/skills/reverse-architecture/SKILL.md";

/** The indented `> ` quote block inside ADR-2077's decision 1. */
function quotedDirective(): string {
  return read(ADR)
    .split("\n")
    .filter((line) => line.startsWith("   > "))
    .map((line) => line.slice(5))
    .join("\n");
}

const collapse = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * What spike #1991 measured as load-bearing, as a pattern for each side.
 *
 * The ADR writes them compactly inside one quoted paragraph; the skill expands
 * each into a bullet. Matching on the distinguishing word of each condition is
 * what lets one guard cover both registers without pinning either to the
 * other's phrasing.
 */
const CONDITIONS: { what: string; adr: RegExp; skill: RegExp }[] = [
  {
    what: "decompose at bounded-context granularity, not per-aggregate",
    adr: /bounded-context granularity[\s\S]*not per-aggregate/,
    skill: /bounded-context granularity, not aggregate granularity/,
  },
  {
    what: "fold aggregates up into their owning context",
    adr: /aggregates as \*\*usecases \+ entities WITHIN\*\* a domain/,
    skill: /Fold aggregates up into their owning context/,
  },
  {
    what: "the schema seam",
    adr: /disjoint schema/,
    skill: /schema seam/,
  },
  {
    what: "the coupling seam",
    adr: /weak coupling/,
    skill: /coupling seam/,
  },
  {
    what: "the ubiquitous-language seam",
    adr: /separate ubiquitous language/,
    skill: /language\* seam/,
  },
];

describe("the reverse skill's bounded-context directive", () => {
  const adr = collapse(quotedDirective());
  const skill = collapse(read(SKILL));

  it("reads the quote block it claims to (guarding the extraction itself)", () => {
    // If the ADR's formatting changes so the filter matches nothing, every
    // assertion below would pass or fail for the wrong reason.
    expect(adr).toContain("bounded-context granularity");
  });

  it.each(CONDITIONS)("keeps $what on both sides", ({ adr: inAdr, skill: inSkill }) => {
    expect(adr).toMatch(inAdr);
    expect(skill).toMatch(inSkill);
  });

  it("still names the spike the measurement came from", () => {
    // The instruction is only defensible because it was measured. A rewrite
    // that keeps the rule but drops the evidence invites the next person to
    // "simplify" it back to the unguided phrasing.
    expect(skill).toContain("#1991");
  });
});
