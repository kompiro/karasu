import type { Translations } from "./types.js";

/**
 * English translation map.
 *
 * Must be COMPLETE — the `Translations` type is the source of truth,
 * and the English map is the fallback for any key missing in other
 * locale maps. TypeScript will error if a new key is added to
 * `Translations` without a corresponding entry here.
 */
export const en: Translations = {
  "languageSelector.label": "Language",
  "languageSelector.english": "English",
  "languageSelector.japanese": "Japanese",
};
