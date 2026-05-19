import type { InitializeParams } from "vscode-languageserver/node";
import type { Locale } from "@karasu-tools/i18n";

/**
 * Resolve the editor's display language to a karasu `Locale`.
 *
 * The LSP `initialize` request carries the client's locale in
 * `params.locale` — VS Code passes its display language there, e.g.
 * `"ja"`, `"ja-jp"`, `"en-us"`. Anything that is not Japanese falls back
 * to English, matching the tooling-output default (English) from
 * `docs/spec/i18n.md`.
 */
export function resolveLspLocale(params: InitializeParams): Locale {
  const raw = params.locale ?? "";
  return raw.toLowerCase().startsWith("ja") ? "ja" : "en";
}
