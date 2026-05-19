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
  translate,
  type Locale,
  type TranslateFn,
} from "@karasu-tools/i18n";

/**
 * Resolve the CLI's output locale from POSIX locale environment variables.
 * `LC_ALL` overrides `LANG`; anything that is not Japanese falls back to
 * English — the tooling-output default from `docs/spec/i18n.md`.
 */
export function resolveCliLocale(env: NodeJS.ProcessEnv = process.env): Locale {
  const raw = env.LC_ALL || env.LANG || "";
  return raw.toLowerCase().startsWith("ja") ? "ja" : "en";
}

// The CLI process locale is fixed for the lifetime of the run.
const locale = resolveCliLocale();
const t = ((key: Parameters<TranslateFn>[0], params?: unknown) =>
  translate(locale, key, params)) as TranslateFn;

/** Render a core `Diagnostic` to a localized one-line message. */
export function formatDiagnostic(d: Diagnostic): string {
  return renderDiagnostic(d, t);
}

/** Render a core `Warning` to a localized `message` + `details`. */
export function formatWarning(w: Warning): FormattedWarning {
  return renderWarning(w, t);
}
