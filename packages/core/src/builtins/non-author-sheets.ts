import { BUILTIN_SHEET_ID } from "./default-style.js";
import { ICON_THEME_SHEET_ID } from "./icon-theme.js";

/**
 * Sheets karasu ships rather than the author writing them. Their `StyleRule.sheetId`
 * is a sentinel, never a `.krs.style` path.
 *
 * Imported from where each sheet is parsed rather than spelled out again here:
 * a third copy of the strings would let a rename at the producer silently
 * re-open the leak this set exists to close, with nothing failing to say so.
 *
 * Read by the resolver (team frames take author rules only) and by the cascade
 * (only author declarations are checked against the schema, #3141). Decided by
 * the rule's `sheetId`, not by a sheet's position: the icon theme is appended
 * after the author sheets.
 */
export const NON_AUTHOR_SHEET_IDS: ReadonlySet<string> = new Set([
  BUILTIN_SHEET_ID,
  ICON_THEME_SHEET_ID,
]);
