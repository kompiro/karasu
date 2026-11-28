// Guard for TPL-1944 checklist item 6: the builtin `edge[inferred]` rule sets
// only `color`, so a guessed relation keeps the line style its `[sync]` /
// `[async]` tag gives it.
//
// The closed set is every builtin theme (`BUILTIN_THEMES`, held to the whole
// `DiagramTheme` union) × every rule of that theme's parsed sheet whose
// selector carries the `inferred` tag, so a comma list or a compound selector
// that mentions `inferred` is checked too. The rule is kept specific to
// `inferred`: `edge[delivers]` legitimately sets `border-style`.

import { describe, expect, it } from "vitest";
import { getBuiltinStyleSheet } from "./default-style.js";
import type { DiagramTheme } from "../renderer/palette.js";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;

const BUILTIN_THEMES = ["dark", "light"] as const satisfies readonly DiagramTheme[];
const _themesContract: Equal<(typeof BUILTIN_THEMES)[number], DiagramTheme> = true;
void _themesContract;

describe.each(BUILTIN_THEMES)("builtin edge[inferred] rule (%s theme)", (theme) => {
  const inferredRules = getBuiltinStyleSheet(theme).rules.filter(
    // A bare `[inferred]` selector (no type) reaches edges too.
    (r) =>
      (r.selector.nodeType === "edge" || r.selector.nodeType === undefined) &&
      r.selector.tags.includes("inferred"),
  );

  it("is present", () => {
    expect(inferredRules.length).toBeGreaterThan(0);
  });

  it("declares only color, leaving the [sync] / [async] line style alone", () => {
    const offenders = inferredRules
      .filter((rule) => Object.keys(rule.properties).join() !== "color")
      .map(
        (rule) =>
          `${JSON.stringify(rule.selector)} sets ${Object.keys(rule.properties).join(", ")}`,
      );
    expect(offenders).toEqual([]);
  });
});
