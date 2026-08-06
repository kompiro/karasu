import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BOUNDED_CONTEXT_DIRECTIVE } from "../../packages/nest/src/reverse/prompts.js";

/**
 * ADR-2077 fixes prose, not an interface. Spike #1991 measured that the
 * bounded-context directive moves a repository from `domain-F1 0.40` to an
 * exact match with the human decomposition, and that *summarising* it — losing
 * the three split conditions — regresses toward the unguided result. So the
 * text karasu-nest sends has to stay the text the ADR records.
 *
 * `prompts.test.ts` pins the individual load-bearing phrases, which catches a
 * paraphrase that drops a concept. This catches the other kind: one that keeps
 * every concept and rewords the sentence.
 *
 * It lives under `scripts/` rather than in the package because `packages/nest`
 * is a Workers package whose tsconfig has `types: []` — it must not be able to
 * reach Node built-ins, not even in a test.
 */
const ADR = fileURLToPath(
  new URL("../../docs/adr/2077-reverse-bc-granularity.md", import.meta.url),
);

/** The indented `> ` quote block inside ADR-2077's decision 1. */
function quotedDirective(): string {
  return readFileSync(ADR, "utf8")
    .split("\n")
    .filter((line) => line.startsWith("   > "))
    .map((line) => line.slice(5))
    .join("\n");
}

const collapse = (text: string): string => text.replace(/\s+/g, " ").trim();

describe("the reverse pipeline's bounded-context directive", () => {
  it("is reproduced from ADR-2077's quote block word for word", () => {
    expect(collapse(quotedDirective())).toContain(collapse(BOUNDED_CONTEXT_DIRECTIVE));
  });

  it("reads the quote block it claims to (guarding the extraction itself)", () => {
    // If the ADR's formatting changes so the filter matches nothing, the
    // assertion above would pass vacuously against an empty string.
    expect(collapse(quotedDirective())).toContain("bounded-context granularity");
  });
});
