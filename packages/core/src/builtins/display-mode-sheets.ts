import type { DisplayMode } from "../renderer/layout-types.js";
import type { StyleSheet } from "../types/style.js";
import { getIconThemeStyleSheet } from "./icon-theme.js";

/**
 * The sheet each display mode lays over the model's sheets, or `undefined` for
 * a mode that draws from the model's sheets alone.
 *
 * A `Record` over {@link DisplayMode}, so a new mode fails typecheck until it
 * says whether it brings a sheet. `displaymode-meta.test.ts` reads this table:
 * every rule of every mode sheet is fought by an author sheet at the rule's own
 * selector on every public entry point, and the mode has to win (TPL-1001).
 */
export const DISPLAY_MODE_SHEETS: Readonly<Record<DisplayMode, (() => StyleSheet) | undefined>> = {
  shape: undefined,
  icon: getIconThemeStyleSheet,
};

/**
 * The sheets to resolve styles with in `displayMode`: `sheets` with the mode's
 * sheet appended, so the mode wins every tie of specificity with the builtin
 * and the author sheets (Icon Mode is immune to an author's `shape`, #279).
 *
 * The one place a mode sheet joins the cascade. Analysis and value validation
 * take `sheets` without it, so a mode raises no style-conflict or value warning
 * of its own.
 */
export function withDisplayModeSheet(
  sheets: StyleSheet[],
  displayMode: DisplayMode | undefined,
): StyleSheet[] {
  const modeSheet = displayMode === undefined ? undefined : DISPLAY_MODE_SHEETS[displayMode]?.();
  return modeSheet ? [...sheets, modeSheet] : sheets;
}
