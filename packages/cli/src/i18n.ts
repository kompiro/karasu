/**
 * CLI-side i18n: resolve the output locale from the environment and bind
 * the shared `@karasu-tools/i18n` renderers to it.
 *
 * `formatDiagnostic` / `formatWarning` are drop-in replacements for the
 * (now removed) core compat bridges of the same name — call sites only
 * change their import path.
 */

import type { Diagnostic, Warning, FormattedWarning } from "@karasu-tools/core";
import {
  renderDiagnostic,
  renderWarning,
  bindTranslate,
  resolveLocaleTag,
  type Locale,
} from "@karasu-tools/i18n";

/**
 * Resolve the CLI's output locale from POSIX locale environment variables.
 *
 * Follows the POSIX precedence for the *message catalog* locale:
 * `LC_ALL` > `LC_MESSAGES` > `LANG`. `LC_ALL` is the blanket override, while
 * `LC_MESSAGES` is what a user sets to keep English number / date formatting
 * (`LANG=en_US.UTF-8`) alongside Japanese program messages, so it must win
 * over `LANG`. Normalizing the resulting tag is `resolveLocaleTag`'s job,
 * shared with the app / lsp / vscode consumers.
 *
 * GNU's `LANGUAGE` is deliberately not read: it sits outside POSIX, holds a
 * colon-separated fallback *list* rather than one tag, and must be ignored
 * when the resolved message locale is `C` / `POSIX` — none of which this
 * single-tag chain expresses. Supporting it is its own change.
 */
export function resolveCliLocale(env: NodeJS.ProcessEnv = process.env): Locale {
  return resolveLocaleTag(env.LC_ALL || env.LC_MESSAGES || env.LANG);
}

// The CLI process locale is fixed for the lifetime of the run.
const locale = resolveCliLocale();
const t = bindTranslate(locale);

/** Render a core `Diagnostic` to a localized one-line message. */
export function formatDiagnostic(d: Diagnostic): string {
  return renderDiagnostic(d, t);
}

/** Render a core `Warning` to a localized `message` + `details`. */
export function formatWarning(w: Warning): FormattedWarning {
  return renderWarning(w, t);
}
