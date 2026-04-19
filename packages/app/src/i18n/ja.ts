import type { Translations } from "./types.js";

/**
 * Japanese translation map.
 *
 * Typed as `Partial<Translations>` — missing keys fall through to the
 * English value at render time. Keeping it partial lets translators
 * land keys incrementally instead of needing every key translated
 * before anything can ship.
 */
export const ja: Partial<Translations> = {
  "languageSelector.label": "言語",
  "languageSelector.english": "英語",
  "languageSelector.japanese": "日本語",
};
