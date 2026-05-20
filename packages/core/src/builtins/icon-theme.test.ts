import { describe, it, expect } from "vitest";
import {
  ICON_RULES,
  ICON_THEME_STYLE_SOURCE,
  CLIENT_SUBTYPE_TAGS,
  getIconThemeStyleSheet,
  iconNameForNode,
} from "./icon-theme.js";

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
    // Matches applyClientSubtypeFirstMatch in resolver/style-resolver.ts.
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
