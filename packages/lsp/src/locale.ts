import type { InitializeParams } from "vscode-languageserver/node";
import { resolveLocaleTag, type Locale } from "@karasu-tools/i18n";

/**
 * Resolve the editor's display language to a karasu `Locale`.
 *
 * The LSP `initialize` request carries the client's locale in
 * `params.locale` — VS Code passes its display language there, e.g.
 * `"ja"`, `"ja-jp"`, `"en-us"`. Normalizing that tag is `resolveLocaleTag`'s
 * job, shared with the app / cli / vscode consumers; this function only knows
 * where the LSP keeps its raw tag.
 */
export function resolveLspLocale(params: InitializeParams): Locale {
  return resolveLocaleTag(params.locale);
}
