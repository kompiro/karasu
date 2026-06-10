import { describe, it, expect } from "vitest";
import {
  getBuiltinStyleSheet,
  buildBuiltinStyleSource,
  BUILTIN_STYLE_SOURCE,
  BUILTIN_STYLE_SOURCE_LIGHT,
} from "./default-style.js";
import { REFERENCE_DATA } from "./reference-data.js";

describe("BUILTIN_STYLE_SOURCE", () => {
  it("is a non-empty string", () => {
    expect(BUILTIN_STYLE_SOURCE.length).toBeGreaterThan(0);
  });
});

describe("getBuiltinStyleSheet", () => {
  it("parses without errors", () => {
    const sheet = getBuiltinStyleSheet();
    expect(sheet.rules.length).toBeGreaterThan(0);
  });

  it("returns cached instance on second call", () => {
    const a = getBuiltinStyleSheet();
    const b = getBuiltinStyleSheet();
    expect(a).toBe(b);
  });

  it("contains user shape rule", () => {
    const sheet = getBuiltinStyleSheet();
    const userRule = sheet.rules.find(
      (r) => r.selector.nodeType === "user" && r.properties["shape"] === "user",
    );
    expect(userRule).toBeDefined();
  });

  it("contains resource[table] cylinder rule", () => {
    const sheet = getBuiltinStyleSheet();
    const rule = sheet.rules.find(
      (r) =>
        r.selector.nodeType === "resource" &&
        r.selector.tags.includes("table") &&
        r.properties["shape"] === "cylinder",
    );
    expect(rule).toBeDefined();
  });

  it("contains resource[queue] queue rule", () => {
    const sheet = getBuiltinStyleSheet();
    const rule = sheet.rules.find(
      (r) =>
        r.selector.nodeType === "resource" &&
        r.selector.tags.includes("queue") &&
        r.properties["shape"] === "queue",
    );
    expect(rule).toBeDefined();
  });

  it("contains resource[api] hexagon rule", () => {
    const sheet = getBuiltinStyleSheet();
    const rule = sheet.rules.find(
      (r) =>
        r.selector.nodeType === "resource" &&
        r.selector.tags.includes("api") &&
        r.properties["shape"] === "hexagon",
    );
    expect(rule).toBeDefined();
  });

  it("contains resource[storage] cloud rule", () => {
    const sheet = getBuiltinStyleSheet();
    const rule = sheet.rules.find(
      (r) =>
        r.selector.nodeType === "resource" &&
        r.selector.tags.includes("storage") &&
        r.properties["shape"] === "cloud",
    );
    expect(rule).toBeDefined();
  });

  it("contains edge[async] dashed rule", () => {
    const sheet = getBuiltinStyleSheet();
    const rule = sheet.rules.find(
      (r) =>
        r.selector.nodeType === "edge" &&
        r.selector.tags.includes("async") &&
        r.properties["border-style"] === "dashed",
    );
    expect(rule).toBeDefined();
  });

  it("contains annotation rules", () => {
    const sheet = getBuiltinStyleSheet();
    const deprecated = sheet.rules.find((r) => r.selector.annotations.includes("deprecated"));
    const newAnnotation = sheet.rules.find((r) => r.selector.annotations.includes("new"));
    expect(deprecated).toBeDefined();
    expect(newAnnotation).toBeDefined();
  });

  it("contains all deploy node kind rules", () => {
    const sheet = getBuiltinStyleSheet();
    const kinds = ["oci", "lambda", "jar", "war", "function", "assets", "job", "artifact"];
    const foundKinds = sheet.rules
      .filter((r) => r.selector.nodeType && kinds.includes(r.selector.nodeType))
      .map((r) => r.selector.nodeType!);
    for (const kind of kinds) {
      expect(foundKinds).toContain(kind);
    }
  });

  it("contains correct colors for oci deploy kind", () => {
    const sheet = getBuiltinStyleSheet();
    const rule = sheet.rules.find((r) => r.selector.nodeType === "oci");
    expect(rule?.properties["background-color"]).toBe("#1E3A5F");
    expect(rule?.properties["border-color"]).toBe("#3B82F6");
    expect(rule?.properties["badge-label"]).toBe('"oci"');
  });

  it("contains database node kind rule with cylinder shape", () => {
    const sheet = getBuiltinStyleSheet();
    const rule = sheet.rules.find(
      (r) => r.selector.nodeType === "database" && r.properties["shape"] === "cylinder",
    );
    expect(rule).toBeDefined();
  });

  it("contains queue node kind rule with queue shape", () => {
    const sheet = getBuiltinStyleSheet();
    const rule = sheet.rules.find(
      (r) => r.selector.nodeType === "queue" && r.properties["shape"] === "queue",
    );
    expect(rule).toBeDefined();
  });

  it("contains storage node kind rule with cloud shape", () => {
    const sheet = getBuiltinStyleSheet();
    const rule = sheet.rules.find(
      (r) => r.selector.nodeType === "storage" && r.properties["shape"] === "cloud",
    );
    expect(rule).toBeDefined();
  });
});

describe("getBuiltinStyleSheet — light theme (Issue #1479)", () => {
  it("parses the light variant without errors", () => {
    const sheet = getBuiltinStyleSheet("light");
    expect(sheet.rules.length).toBeGreaterThan(0);
  });

  it("defaults to the dark sheet (backward compatible)", () => {
    expect(getBuiltinStyleSheet()).toBe(getBuiltinStyleSheet("dark"));
  });

  it("caches the dark and light variants separately", () => {
    expect(getBuiltinStyleSheet("light")).toBe(getBuiltinStyleSheet("light"));
    expect(getBuiltinStyleSheet("dark")).toBe(getBuiltinStyleSheet("dark"));
    expect(getBuiltinStyleSheet("light")).not.toBe(getBuiltinStyleSheet("dark"));
  });

  it("the light variant uses different node colors than the dark variant", () => {
    expect(BUILTIN_STYLE_SOURCE_LIGHT).not.toBe(BUILTIN_STYLE_SOURCE);
    const dark = getBuiltinStyleSheet("dark");
    const light = getBuiltinStyleSheet("light");
    const darkService = dark.rules.find((r) => r.selector.nodeType === "service");
    const lightService = light.rules.find((r) => r.selector.nodeType === "service");
    expect(darkService?.properties["background-color"]).toBeDefined();
    expect(lightService?.properties["background-color"]).toBeDefined();
    expect(lightService?.properties["background-color"]).not.toBe(
      darkService?.properties["background-color"],
    );
  });

  it("the light annotation badge colors differ from dark (legibility on light cards)", () => {
    const dark = getBuiltinStyleSheet("dark");
    const light = getBuiltinStyleSheet("light");
    const darkDeprecated = dark.rules.find((r) => r.selector.annotations.includes("deprecated"));
    const lightDeprecated = light.rules.find((r) => r.selector.annotations.includes("deprecated"));
    expect(darkDeprecated?.properties["badge-color"]).toBe("#EF4444");
    expect(lightDeprecated?.properties["badge-color"]).toBe("#DC2626");
  });

  it("the light variant keeps the same rule structure (selectors + non-color properties)", () => {
    // The two sheets are parsed from parallel sources kept in lock-step
    // by hand. This guards against silent drift: the only differences
    // allowed between the dark and light sheets are color properties.
    const colorProps = new Set(["background-color", "color", "border-color", "badge-color"]);
    const dark = getBuiltinStyleSheet("dark");
    const light = getBuiltinStyleSheet("light");

    expect(light.rules.length).toBe(dark.rules.length);

    // Selector identity ignoring `loc` — source offsets differ because
    // the two sheets are distinct source strings.
    const selectorKey = (s: (typeof dark.rules)[number]["selector"]) =>
      JSON.stringify({ nodeType: s.nodeType, tags: s.tags, annotations: s.annotations });

    dark.rules.forEach((darkRule, i) => {
      const lightRule = light.rules[i];
      // Same selector, in the same order — a renamed / added / removed
      // selector in one sheet only would surface here.
      expect(selectorKey(lightRule.selector)).toBe(selectorKey(darkRule.selector));
      // Every non-color property must be identical between themes;
      // structural properties (shape, border-width, font-*) drive layout
      // and must not diverge.
      for (const [prop, value] of Object.entries(darkRule.properties)) {
        if (colorProps.has(prop)) continue;
        expect(lightRule.properties[prop]).toBe(value);
      }
      // The light sheet must not introduce non-color properties the dark
      // sheet lacks either.
      for (const prop of Object.keys(lightRule.properties)) {
        if (colorProps.has(prop)) continue;
        expect(darkRule.properties).toHaveProperty(prop);
      }
    });
  });
});

describe("getBuiltinStyleSheet — annotation badge labels (#1508)", () => {
  const annotationRule = (sheet: ReturnType<typeof getBuiltinStyleSheet>, name: string) =>
    sheet.rules.find((r) => r.selector.annotations.includes(name));

  it("default labels match the reference-data en labels (single source, TPL-20260519-02)", () => {
    for (const theme of ["dark", "light"] as const) {
      const sheet = getBuiltinStyleSheet(theme);
      for (const a of REFERENCE_DATA.annotations) {
        const rule = annotationRule(sheet, a.name);
        expect(rule?.properties["badge-label"]).toBe(`"${a.defaultBadge.label.en}"`);
        expect(rule?.properties["badge-icon"]).toBe(`"${a.defaultBadge.icon}"`);
      }
    }
  });

  it("dark badge colors come from reference-data defaultBadge.color", () => {
    const sheet = getBuiltinStyleSheet("dark");
    for (const a of REFERENCE_DATA.annotations) {
      expect(annotationRule(sheet, a.name)?.properties["badge-color"]).toBe(a.defaultBadge.color);
    }
  });

  it("injected labels replace the defaults for all four annotations", () => {
    const sheet = getBuiltinStyleSheet("dark", {
      deprecated: "非推奨",
      new: "新規",
      experimental: "実験的",
      migrationTarget: "移行先",
    });
    expect(annotationRule(sheet, "deprecated")?.properties["badge-label"]).toBe('"非推奨"');
    expect(annotationRule(sheet, "new")?.properties["badge-label"]).toBe('"新規"');
    expect(annotationRule(sheet, "experimental")?.properties["badge-label"]).toBe('"実験的"');
    expect(annotationRule(sheet, "migration_target")?.properties["badge-label"]).toBe('"移行先"');
  });

  it("partially injected labels fall back to en for the omitted keys", () => {
    const sheet = getBuiltinStyleSheet("dark", { deprecated: "非推奨" });
    expect(annotationRule(sheet, "deprecated")?.properties["badge-label"]).toBe('"非推奨"');
    expect(annotationRule(sheet, "experimental")?.properties["badge-label"]).toBe('"Experimental"');
  });

  it("caches per (theme, label set) without cross-contamination", () => {
    const labels = { deprecated: "非推奨" };
    const jaDark = getBuiltinStyleSheet("dark", labels);
    const jaDark2 = getBuiltinStyleSheet("dark", { deprecated: "非推奨" });
    const enDark = getBuiltinStyleSheet("dark");
    const jaLight = getBuiltinStyleSheet("light", labels);
    expect(jaDark).toBe(jaDark2);
    expect(jaDark).not.toBe(enDark);
    expect(jaDark).not.toBe(jaLight);
    // The default sheet is untouched by injected-label requests.
    expect(annotationRule(enDark, "deprecated")?.properties["badge-label"]).toBe('"Deprecated"');
  });

  it("escapes quotes and backslashes in injected labels", () => {
    const sheet = getBuiltinStyleSheet("dark", { deprecated: 'say "no" \\ stop' });
    expect(annotationRule(sheet, "deprecated")?.properties["badge-label"]).toBe(
      '"say "no" \\ stop"',
    );
  });

  it("buildBuiltinStyleSource leaves no placeholder behind", () => {
    for (const theme of ["dark", "light"] as const) {
      expect(buildBuiltinStyleSource(theme)).not.toContain("__ANNOTATION_RULES__");
    }
  });
});
