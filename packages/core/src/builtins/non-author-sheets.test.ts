import { describe, it, expect } from "vitest";
import { compile, type CompileOptions } from "../compile/compile.js";
import { Parser } from "../parser/parser.js";
import { analyze } from "../resolver/warnings.js";
import type { StyleSheet } from "../types/style.js";
import type { DiagramTheme } from "../renderer/palette.js";
import { NON_AUTHOR_SHEET_IDS } from "./non-author-sheets.js";
import { BUILTIN_SHEET_ID, getBuiltinStyleSheet } from "./default-style.js";
import { ICON_THEME_SHEET_ID, getIconThemeStyleSheet } from "./icon-theme.js";

// A sheet karasu ships must never draw a warning: its author is karasu, so the
// reader of the warning has nothing to edit (TPL-2175 item 6).
//
// The table is keyed by sheet id and checked against `NON_AUTHOR_SHEET_IDS`
// in both directions, so a new shipped sheet fails here until it says how it
// is produced and how the compile pipeline puts it in play. Each sheet is then
// checked twice:
//
// - where the pipeline really puts it. The builtin sheet sits first, the icon
//   theme is appended after the author sheets for resolution only. A check
//   that exempts shipped sheets by position (`sheets.slice(systemSheetCount)`)
//   rather than by `sheetId` would flag a sheet that is appended, not
//   prepended.
// - in the author's position, through `analyze()`. A new style-side
//   deprecation that the shipped sheet itself trips is caught here whether or
//   not an exemption would hide it in the pipeline; such a sheet has to be
//   migrated with the rule that deprecates its spelling. Value-level
//   validation is left out on purpose: shipped sheets are not held to the
//   author schema (#3141), and the builtin writes unitless lengths.

const THEMES: DiagramTheme[] = ["dark", "light"];

interface ShippedSheet {
  /** The parsed sheet as the pipeline holds it, one per variant. */
  sheets: () => StyleSheet[];
  /** Compile options under which the pipeline puts the sheet in play. */
  inPlay: CompileOptions[];
}

const SHIPPED: Record<string, ShippedSheet> = {
  [BUILTIN_SHEET_ID]: {
    sheets: () => THEMES.map((t) => getBuiltinStyleSheet(t)),
    inPlay: THEMES.map((theme) => ({ theme })),
  },
  [ICON_THEME_SHEET_ID]: {
    sheets: () => [getIconThemeStyleSheet()],
    inPlay: THEMES.map((theme) => ({ theme, displayMode: "icon" as const })),
  },
};

// Every kind a shipped rule can select, with no finding of its own.
const MODEL = `
system Shop {
  label "Shop"
  user Buyer [human] { label "Buyer" }
  client App [web] { label "App" }
  service Web { label "Web" }
  service Api @deprecated { label "Api" }
  service Stripe [external] { label "Stripe" }
  database ShopDB {
    label "Shop DB"
    table Orders { label "Orders" }
  }
  queue Events {
    label "Events"
    queue OrderPlaced { label "Order placed" }
  }
  Buyer -> App "uses"
  App -> Web "calls"
  Web -> Api "calls"
  Api -> ShopDB "writes"
  Api --> Events "publishes"
  Api -> Stripe "charges"
}
`;

const DIAGRAMS = ["system", "deploy", "org"] as const;

describe("shipped style sheets draw no warnings (TPL-2175)", () => {
  it("lists exactly the sheets NON_AUTHOR_SHEET_IDS names", () => {
    expect(Object.keys(SHIPPED).sort()).toEqual([...NON_AUTHOR_SHEET_IDS].sort());
  });

  it.each(Object.entries(SHIPPED))("%s: every variant carries its sheet id", (id, s) => {
    for (const sheet of s.sheets()) {
      expect(sheet.rules.length).toBeGreaterThan(0);
      expect(new Set(sheet.rules.map((r) => r.sheetId))).toEqual(new Set([id]));
    }
  });

  const file = Parser.parse(MODEL);

  it("the model has no finding of its own, so any warning below is a sheet's", () => {
    expect(file.diagnostics).toEqual([]);
    expect(analyze(file.value, [], 0)).toEqual([]);
  });

  it.each(Object.entries(SHIPPED))("%s: silent where the pipeline puts it", (_id, s) => {
    for (const options of s.inPlay) {
      for (const diagramType of DIAGRAMS) {
        const result = compile(MODEL, { ...options, diagramType });
        expect(result.warnings).toEqual([]);
      }
    }
  });

  it.each(Object.entries(SHIPPED))("%s: silent in the author's position", (_id, s) => {
    for (const sheet of s.sheets()) {
      expect(analyze(file.value, [getBuiltinStyleSheet(), sheet], 1)).toEqual([]);
    }
  });
});
