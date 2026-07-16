import { describe, expect, it } from "vitest";
import { COLOR_THEME_KIND, diagramThemeFromColorTheme } from "./theme-mapping.js";

// Fences the ColorThemeKind → DiagramTheme mapping behind the VS Code
// preview's theme-follow behavior (AT-1479, VS Code section). The mirrored
// COLOR_THEME_KIND constant is pinned to vscode.d.ts by a `satisfies` clause
// in theme-mapping.ts, so these tests exercise the real numeric values.

describe("diagramThemeFromColorTheme", () => {
  it("maps light and high-contrast-light editor themes to the light diagram", () => {
    expect(diagramThemeFromColorTheme(COLOR_THEME_KIND.Light)).toBe("light");
    expect(diagramThemeFromColorTheme(COLOR_THEME_KIND.HighContrastLight)).toBe("light");
  });

  it("maps dark and high-contrast editor themes to the dark diagram", () => {
    expect(diagramThemeFromColorTheme(COLOR_THEME_KIND.Dark)).toBe("dark");
    expect(diagramThemeFromColorTheme(COLOR_THEME_KIND.HighContrast)).toBe("dark");
  });

  it("covers every ColorThemeKind value exactly once", () => {
    // All four documented enum values (vscode.d.ts: Light=1, Dark=2,
    // HighContrast=3, HighContrastLight=4) resolve to a diagram theme.
    const kinds = Object.values(COLOR_THEME_KIND);
    expect(kinds).toEqual([1, 2, 3, 4]);
    const themes = kinds.map((k) => diagramThemeFromColorTheme(k));
    expect(themes).toEqual(["light", "dark", "dark", "light"]);
  });
});
