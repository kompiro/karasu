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
    // Matches applyVariantFirstMatch in resolver/style-resolver.ts.
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
 * The renderer resolves a node's icon through the CSS cascade (plus the
 * variant first-match post-step in `resolver/style-resolver.ts`, which covers
 * every kind in `VARIANT_ICONS_BY_KIND`); every other surface
 * calls {@link iconNameForNode}. Both have to pick the same icon when a node
 * carries several variant tags, which is where their resolution orders can part
 * (TPL-1415 item 6). Each variant tag alone, every ordered pair of a kind's
 * variant tags, and each kind's variants in full in both orders are generated
 * from ICON_RULES, so a new
 * variant or a new kind with variants is compared without a new case here.
 */
describe("iconNameForNode agrees with the cascade on multi-variant nodes", () => {
  // Every tagged rule on a kind `iconNameForNode` draws, whatever its scope, so a
  // variant added under a new scope is compared too.
  const VARIANT_TAGS = new Map<string, string[]>();
  for (const r of ICON_RULES) {
    if (!r.tag || iconNameForNode(r.kind, []) === undefined) continue;
    VARIANT_TAGS.set(r.kind, [...(VARIANT_TAGS.get(r.kind) ?? []), r.tag]);
  }

  const single: [string, string[]][] = [];
  const multi: [string, string[]][] = [];
  for (const [kind, tags] of VARIANT_TAGS) {
    for (const a of tags) single.push([kind, [a]]);
    for (const a of tags) for (const b of tags) if (a !== b) multi.push([kind, [a, b]]);
    multi.push([kind, tags], [kind, [...tags].reverse()]);
  }

  /**
   * Kinds whose multi-variant nodes the renderer still resolves by cascade
   * order (last-declared variant) while `iconNameForNode` takes the first tag.
   * A known gap, not an agreement: shape mode resolves the same node by cascade
   * order too, and making only icon mode follow the tags would split the two
   * modes (see `FIRST_MATCH_VARIANT_KINDS` in the resolver). Each entry is
   * checked to still disagree, so closing the gap fails until it is removed.
   */
  const CASCADE_ORDER_KINDS: Record<string, string> = {
    resource: "shape mode's keyword variants would disagree with a first-tag icon",
  };

  function iconShapeOf(kind: string, tags: string[]) {
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
    const styles = resolveStyles([node], [getBuiltinStyleSheet(), getIconThemeStyleSheet()]);
    return styles.nodes.get("N")?.shape;
  }

  it("has a kind with variants to compare", () => {
    expect(VARIANT_TAGS.size).toBeGreaterThan(0);
  });

  it.each([...single, ...multi.filter(([kind]) => !(kind in CASCADE_ORDER_KINDS))])(
    "%s %j",
    (kind, tags) => {
      expect(iconShapeOf(kind, tags)).toEqual({ url: iconNameForNode(kind, tags) });
    },
  );

  it.each(Object.keys(CASCADE_ORDER_KINDS))("%s still needs its exemption", (kind) => {
    const disagreeing = multi.filter(
      ([k, tags]) =>
        k === kind &&
        JSON.stringify(iconShapeOf(k, tags)) !== JSON.stringify({ url: iconNameForNode(k, tags) }),
    );
    expect(disagreeing, `${kind} agrees now; drop it from CASCADE_ORDER_KINDS`).not.toEqual([]);
  });
});
