/**
 * CLI-side i18n: resolve the output locale from the environment and bind
 * the shared `@karasu-tools/i18n` renderers to it.
 *
 * A line for a catalog diagnostic is built with `diagnosticParts` /
 * `warningParts`, which add the code's ID. `formatDiagnostic` returns the bare
 * message, for the serve endpoint's 422 body only.
 */

import { diagnosticIdOf } from "@karasu-tools/core";
import type {
  Diagnostic,
  DiagnosticCode,
  Warning,
  WarningKind,
  FormattedWarning,
} from "@karasu-tools/core";
import {
  renderDiagnostic,
  renderWarning,
  bindTranslate,
  resolveLocaleTag,
  type Locale,
} from "@karasu-tools/i18n";

/**
 * The environment variables the CLI reads its locale from, strongest first.
 * One tuple so the resolver, its tests (which walk every link) and the
 * `docs/spec/i18n.md` check all read the same chain.
 */
export const CLI_LOCALE_ENV_CHAIN = ["LC_ALL", "LC_MESSAGES", "LANG"] as const;

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
  // An empty value is unset, not a tag: `LC_ALL=` is how a shell cancels an
  // inherited override, so the chain moves on to the next variable (TPL-2536).
  const name = CLI_LOCALE_ENV_CHAIN.find((v) => env[v]);
  return resolveLocaleTag(name === undefined ? undefined : env[name]);
}

// The CLI process locale is fixed for the lifetime of the run.
const locale = resolveCliLocale();
const t = bindTranslate(locale);

/** Render a core `Diagnostic` to a localized one-line message. */
export function formatDiagnostic(d: Diagnostic): string {
  return renderDiagnostic(d, t);
}

/** Render a core `Warning` to a localized `message` + `details`. */
function formatWarning(w: Warning): FormattedWarning {
  return renderWarning(w, t);
}

/**
 * What a line needs to show one catalog diagnostic: the severity word tagged
 * with the code's ID, and the localized message.
 */
export interface DiagnosticParts extends FormattedWarning {
  /** `word` followed by the ID: `Warning` → `Warning[KRS041]` (#3654). */
  tag: string;
}

function tagged(word: string, code: DiagnosticCode | WarningKind): string {
  return `${word}[${diagnosticIdOf(code)}]`;
}

/**
 * Every line the CLI prints for a catalog diagnostic goes through this or
 * {@link warningParts}, so no command shows a diagnostic without its ID
 * (TPL-1417, TPL-3654). `word` is the command's own spelling of the severity
 * (`Error`, or `error` for `lint-style`); only the ID is added to it.
 */
export function diagnosticParts(word: string, d: Diagnostic): DiagnosticParts {
  return { tag: tagged(word, d.code), message: formatDiagnostic(d), details: [] };
}

/** {@link diagnosticParts} for a resolver `Warning`. */
export function warningParts(word: string, w: Warning): DiagnosticParts {
  return { tag: tagged(word, w.kind), ...formatWarning(w) };
}
