import type { ColorThemeKind } from "vscode";
import type { DiagramTheme } from "@karasu-tools/core";

/**
 * Mapping from the VS Code editor color theme to the karasu diagram theme.
 *
 * Kept free of any *runtime* `vscode` import (the imports above are
 * type-only and erased at compile time) so the 4-case mapping can be
 * unit-tested without the extension host, mirroring `message-validation.ts`.
 */

/**
 * Numeric values of `vscode.ColorThemeKind`, mirrored as literals so this
 * module does not load the `vscode` module at runtime. The values are part
 * of VS Code's stable extension API (vscode.d.ts); the `satisfies` clause
 * fails `tsc` if they ever drift from `@types/vscode`.
 */
export const COLOR_THEME_KIND = {
  Light: 1,
  Dark: 2,
  HighContrast: 3,
  HighContrastLight: 4,
} as const satisfies Record<string, ColorThemeKind>;

/**
 * Map the active VS Code editor color theme to a karasu `DiagramTheme` so
 * the rendered SVG matches the editor chrome. Light and high-contrast
 * light themes render the light diagram; everything else renders dark.
 */
export function diagramThemeFromColorTheme(kind: ColorThemeKind): DiagramTheme {
  return kind === COLOR_THEME_KIND.Light || kind === COLOR_THEME_KIND.HighContrastLight
    ? "light"
    : "dark";
}
