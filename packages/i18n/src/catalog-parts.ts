import { firstRunEn, firstRunJa, type FirstRunTranslations } from "./first-run.js";
import { permalinkEn, permalinkJa, type PermalinkTranslations } from "./permalink.js";
import { vscodeEn, vscodeJa, type VscodeTranslations } from "./vscode.js";

/**
 * The catalog sections kept outside `types.ts` / `en.ts` / `ja.ts` so those
 * files stay inside their line budget. Each catalog spreads its side at one
 * place, so the key order of `en` and `ja` still matches (catalog.test.ts).
 */
export type PartTranslations = FirstRunTranslations & VscodeTranslations & PermalinkTranslations;

export const partsEn: PartTranslations = { ...firstRunEn, ...vscodeEn, ...permalinkEn };

export const partsJa: Partial<PartTranslations> = { ...firstRunJa, ...vscodeJa, ...permalinkJa };
