import { describe, it, expect } from "vitest";
import {
  ICON_RULES,
  ICON_THEME_STYLE_SOURCE,
  CLIENT_SUBTYPE_TAGS,
  getIconThemeStyleSheet,
  iconNameForNode,
} from "./icon-theme.js";
import { getBuiltinStyleSheet } from "./default-style.js";
import { resolveStyles } from "../resolver/style-resolver.js";
import type { KrsNode } from "../types/ast.js";
import type { StyleSheet } from "../types/style.js";
import { StyleParser } from "../parser/style-parser.js";

/** Scopes whose rules `iconNameForNode` resolves (the rest return `undefined`). */
const SYSTEM_VIEW_SCOPES = new Set(["logical", "infra", "resource-variant", "client-variant"]);

/** Stable key for an ICON_RULES entry / a parsed selector. */
function ruleKey(kind: string, tag?: string): string {
  return tag ? `${kind}[${tag}]` : kind;
}

describe("ICON_THEME_STYLE_SOURCE (generated from ICON_RULES)", () => {
  it("is a non-empty string", () => {
    expect(typeof ICON_THEME_STYLE_SOURCE).toBe("string");
    expect(ICON_THEME_STYLE_SOURCE.length).toBeGreaterThan(0);
  });

  it("parses without errors", () => {
    expect(() => getIconThemeStyleSheet()).not.toThrow();
  });

  it("emits exactly one CSS rule per ICON_RULES entry", () => {
    expect(getIconThemeStyleSheet().rules.length).toBe(ICON_RULES.length);
  });

  it("every ICON_RULES entry has a matching CSS rule with the expected url() shape", () => {
    // Parity: the generated CSS is a faithful projection of ICON_RULES.
    const byKey = new Map<string, string>();
    for (const rule of getIconThemeStyleSheet().rules) {
      const { nodeType, tags } = rule.selector;
      byKey.set(ruleKey(nodeType ?? "", tags[0]), rule.properties["shape"]);
    }
    for (const r of ICON_RULES) {
      expect(byKey.get(ruleKey(r.kind, r.tag))).toBe(`url("${r.icon}")`);
    }
  });

  it("all rules use url() shape syntax", () => {
    for (const rule of getIconThemeStyleSheet().rules) {
      expect(rule.properties["shape"]).toMatch(/^url\(/);
    }
  });
});

describe("ICON_RULES data sanity", () => {
  it("infra queue / storage use distinct icons from the geometric shapes", () => {
    // Regression guard: infra nodes must not overwrite the geometric
    // queue / cloud shape icons (see #1415-era bugs).
    const icon = (kind: string) => ICON_RULES.find((r) => r.kind === kind && !r.tag)?.icon;
    expect(icon("queue")).toBe("queue-node");
    expect(icon("storage")).toBe("cloud-node");
  });

  it("usecase resolves to a distinct icon from domain", () => {
    const icon = (kind: string) => ICON_RULES.find((r) => r.kind === kind && !r.tag)?.icon;
    expect(icon("usecase")).toBe("usecase");
    expect(icon("usecase")).not.toBe(icon("domain"));
  });

  it("resource tag variants are distinct from the infra node icons", () => {
    const variant = (tag: string) =>
      ICON_RULES.find((r) => r.kind === "resource" && r.tag === tag)?.icon;
    expect(variant("table")).toBe("table");
    expect(variant("queue")).toBe("queue-card");
    expect(variant("storage")).toBe("cloud-card");
  });
});

describe("CLIENT_SUBTYPE_TAGS", () => {
  it("mirrors the client-variant entries of ICON_RULES in declaration order", () => {
    const fromRules = ICON_RULES.filter((r) => r.scope === "client-variant").map((r) => r.tag);
    expect([...CLIENT_SUBTYPE_TAGS]).toEqual(fromRules);
  });
});

describe("iconNameForNode (parity with ICON_RULES)", () => {
  it("resolves every system-view rule to its icon", () => {
    for (const r of ICON_RULES) {
      if (!SYSTEM_VIEW_SCOPES.has(r.scope)) continue;
      expect(iconNameForNode(r.kind, r.tag ? [r.tag] : [])).toBe(r.icon);
    }
  });

  it("returns undefined for org / deploy kinds even though icon-theme has rules for them", () => {
    for (const r of ICON_RULES) {
      if (SYSTEM_VIEW_SCOPES.has(r.scope) || r.tag) continue;
      expect(iconNameForNode(r.kind, [])).toBeUndefined();
    }
  });

  it("uses first-match-wins on tag order for a multi-subtype client", () => {
    // The style resolver draws the same variant (losingVariantTags).
    expect(iconNameForNode("client", ["web", "mobile"])).toBe("client-web");
    expect(iconNameForNode("client", ["mobile", "web"])).toBe("client-mobile");
  });

  it("ignores tags that are not recognised variants", () => {
    expect(iconNameForNode("client", ["legacy"])).toBe("client");
    expect(iconNameForNode("resource", ["internal"])).toBe("resource");
  });

  it("only applies variant tags to their owning kind", () => {
    expect(iconNameForNode("service", ["mobile"])).toBe("service");
    expect(iconNameForNode("service", ["table"])).toBe("service");
  });

  it("returns undefined for kinds without an Icon Mode pictogram", () => {
    expect(iconNameForNode("system", [])).toBeUndefined();
    expect(iconNameForNode("table", [])).toBeUndefined();
    expect(iconNameForNode("deploy-block", [])).toBeUndefined();
  });
});

/**
 * The renderer resolves a node's look through the CSS cascade, from which the
 * style resolver drops the builtin and icon-theme rules that name one of the
 * node's losing variant tags (`losingVariantTags`, #3775); every other surface
 * calls {@link iconNameForNode}. Both have to pick the same variant when a node
 * carries several variant tags, which is where their resolution orders can part
 * (TPL-1415 item 6), and shape mode has to pick it too. Each variant tag alone,
 * every ordered pair of a kind's variant tags, a pair with its first tag
 * repeated, and each kind's variants in full in both orders are generated from
 * ICON_RULES, so a new variant or a new kind with variants is compared without
 * a new case here.
 */
describe("a multi-variant node is drawn by its first variant tag", () => {
  // Every tagged rule on a kind `iconNameForNode` draws, whatever its scope, so a
  // variant added under a new scope is compared too.
  const VARIANT_TAGS = new Map<string, string[]>();
  const ICON_OF = new Map<string, string>();
  for (const r of ICON_RULES) {
    if (!r.tag || iconNameForNode(r.kind, []) === undefined) continue;
    VARIANT_TAGS.set(r.kind, [...(VARIANT_TAGS.get(r.kind) ?? []), r.tag]);
    ICON_OF.set(ruleKey(r.kind, r.tag), r.icon);
  }

  const single: [string, string[]][] = [];
  const multi: [string, string[]][] = [];
  for (const [kind, tags] of VARIANT_TAGS) {
    for (const a of tags) single.push([kind, [a]]);
    for (const a of tags) for (const b of tags) if (a !== b) multi.push([kind, [a, b]]);
    multi.push([kind, [tags[0], tags[1], tags[0]]]);
    multi.push([kind, tags], [kind, [...tags].reverse()]);
  }

  const SHAPE_MODE = [getBuiltinStyleSheet()];
  const ICON_MODE = [getBuiltinStyleSheet(), getIconThemeStyleSheet()];

  function shapeOf(kind: string, tags: string[], sheets: StyleSheet[]) {
    const node = {
      id: "N",
      kind,
      label: "N",
      tags,
      annotations: [],
      edges: [],
      children: [],
      properties: { links: [] },
    } as unknown as KrsNode;
    return resolveStyles([node], sheets).nodes.get("N")?.shape;
  }

  it("has a kind with variants to compare", () => {
    expect(VARIANT_TAGS.size).toBeGreaterThan(0);
  });

  it.each([...single, ...multi])("icon mode agrees with iconNameForNode on %s %j", (kind, tags) => {
    expect(shapeOf(kind, tags, ICON_MODE)).toEqual({ url: iconNameForNode(kind, tags) });
  });

  it.each(multi)("shape mode draws %s %j as its first variant alone", (kind, tags) => {
    expect(shapeOf(kind, tags, SHAPE_MODE)).toEqual(shapeOf(kind, [tags[0]], SHAPE_MODE));
  });

  // #3776: the builtin choice of the first variant must not override an author
  // who names another variant's icon. Author sheets sit between the builtin
  // sheet and the icon theme, as `withDisplayModeSheet` lays them out.
  it.each(multi)("an author's id rule naming a losing variant wins on %s %j", (kind, tags) => {
    const loser = tags.find((t) => t !== tags[0])!;
    const icon = ICON_OF.get(ruleKey(kind, loser));
    const author = StyleParser.parse(`#N { shape: url("${icon}"); }`).value;
    expect(shapeOf(kind, tags, [getBuiltinStyleSheet(), author])).toEqual({ url: icon });
    expect(shapeOf(kind, tags, [getBuiltinStyleSheet(), author, getIconThemeStyleSheet()])).toEqual(
      { url: icon },
    );
  });

  // Author rules on a variant tag are not dropped: they win over the builtin
  // first-tag choice as on a single-variant node, by the ordinary cascade.
  it.each(multi)("an author's rule on a losing variant tag wins on %s %j", (kind, tags) => {
    const loser = tags.find((t) => t !== tags[0])!;
    const author = StyleParser.parse(`${kind}[${loser}] { shape: user; }`).value;
    // Without the author rule the node is not drawn as `user`, so passing here
    // means the author rule reached the node rather than a builtin coincidence.
    expect(shapeOf(kind, tags, SHAPE_MODE)).not.toBe("user");
    expect(shapeOf(kind, tags, [getBuiltinStyleSheet(), author])).toBe("user");
    // In Icon Mode the icon theme sits after the author sheets and wins the
    // tie, as on a single-tag node (#279): the first tag's icon stays.
    expect(shapeOf(kind, tags, [getBuiltinStyleSheet(), author, getIconThemeStyleSheet()])).toEqual(
      { url: iconNameForNode(kind, tags) },
    );
  });

  // The resolver drops a whole shipped rule that names a losing variant tag.
  // That is only safe while such a rule sets nothing but `shape`; a rule that
  // also set a badge or a colour would lose it on a multi-variant node.
  it.each([
    ["dark builtin", getBuiltinStyleSheet("dark")],
    ["light builtin", getBuiltinStyleSheet("light")],
    ["icon theme", getIconThemeStyleSheet()],
  ] as const)("every %s rule naming a variant tag sets only shape", (_name, sheet) => {
    const extra = sheet.rules
      // A rule without a kind (`[table] { … }`) also matches a variant kind's
      // node and is dropped whole, so it counts against any kind's variants.
      .filter((r) =>
        r.selector.tags.some((t) =>
          r.selector.nodeType
            ? ICON_OF.has(ruleKey(r.selector.nodeType, t))
            : [...VARIANT_TAGS.values()].some((variants) => variants.includes(t)),
        ),
      )
      .flatMap((r) => Object.keys(r.properties).filter((p) => p !== "shape"));
    expect(extra).toEqual([]);
  });

  // The resolver tells variant rules apart by the tags in `VARIANT_TAGS`. A
  // shipped rule that styles a variant kind by a tag outside that set would not
  // be dropped when it loses, and the cascade order would decide again.
  it.each(["dark", "light"] as const)(
    "the %s builtin sheet styles a variant kind's shape only by its variant tags",
    (theme) => {
      const stray = getBuiltinStyleSheet(theme)
        .rules.filter((r) => VARIANT_TAGS.has(r.selector.nodeType ?? "") && r.properties["shape"])
        .flatMap((r) => r.selector.tags.map((t) => ruleKey(r.selector.nodeType!, t)))
        .filter((key) => !ICON_OF.has(key));
      expect(stray).toEqual([]);
    },
  );
});
