import { describe, it, expect } from "vitest";
import { flattenSheetsInCascadeOrder, mergeInCascadeOrder } from "./cascade.js";
import type { StyleRule, StyleSheet } from "../types/style.js";

const ZERO_RANGE = {
  start: { line: 0, column: 0, offset: 0 },
  end: { line: 0, column: 0, offset: 0 },
};

function makeRule(
  properties: Record<string, string>,
  specificity: number,
  sourceIndex: number,
  sheetId = "<test>",
): StyleRule {
  return {
    selector: { tags: [], annotations: [], facets: [], loc: ZERO_RANGE },
    properties,
    specificity,
    sourceIndex,
    loc: ZERO_RANGE,
    declarationLocs: {},
    sheetId,
  };
}

function makeSheet(sheetId: string, rules: StyleRule[]): StyleSheet {
  return { sheetId, rules };
}

describe("flattenSheetsInCascadeOrder", () => {
  it("renumbers sourceIndex across sheets so a later sheet sorts last (Issue #2445)", () => {
    // Each sheet's parser numbers from 0, so the raw indices collide: the user
    // rule below is 0 in its own sheet while the builtin rule it overrides is 7.
    const builtin = makeSheet("builtin", [
      makeRule({ "background-color": "#111111" }, 1, 7, "builtin"),
    ]);
    const user = makeSheet("user", [makeRule({ "background-color": "#222222" }, 1, 0, "user")]);

    const flattened = flattenSheetsInCascadeOrder([builtin, user]);

    expect(flattened.map((r) => r.sourceIndex)).toEqual([0, 1]);
    expect(flattened[1].sheetId).toBe("user");
  });

  it("does not mutate the input sheets", () => {
    // The builtin sheet is a cached singleton shared by every compile, so
    // renumbering in place would leak across renders.
    const rule = makeRule({ color: "#FFFFFF" }, 1, 7);
    const sheet = makeSheet("builtin", [rule]);

    flattenSheetsInCascadeOrder([sheet, makeSheet("user", [makeRule({}, 1, 0)])]);

    expect(rule.sourceIndex).toBe(7);
    expect(sheet.rules[0]).toBe(rule);
  });
});

describe("mergeInCascadeOrder", () => {
  it("lets the later declaration win a specificity tie", () => {
    const merged = mergeInCascadeOrder([
      makeRule({ "background-color": "#111111" }, 1, 0),
      makeRule({ "background-color": "#222222" }, 1, 1),
    ]);
    expect(merged["background-color"]).toBe("#222222");
  });

  it("lets higher specificity win regardless of declaration order", () => {
    const merged = mergeInCascadeOrder([
      makeRule({ "background-color": "#333333" }, 10, 0),
      makeRule({ "background-color": "#111111" }, 1, 5),
    ]);
    expect(merged["background-color"]).toBe("#333333");
  });

  it("merges per property so a rule setting only `shape` keeps an earlier color (Issue #1001)", () => {
    const merged = mergeInCascadeOrder([
      makeRule({ "background-color": "#111111" }, 1, 0),
      makeRule({ shape: 'url("service")' }, 1, 1),
    ]);
    expect(merged).toEqual({ "background-color": "#111111", shape: 'url("service")' });
  });

  it("does not reorder the caller's array", () => {
    const rules = [makeRule({}, 1, 5), makeRule({}, 1, 1)];
    mergeInCascadeOrder(rules);
    expect(rules.map((r) => r.sourceIndex)).toEqual([5, 1]);
  });
});
