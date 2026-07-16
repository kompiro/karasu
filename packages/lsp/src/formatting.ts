import { format, FormatError, tidyStyleSheet } from "@karasu-tools/core";

/**
 * Route document text to the right formatter: `.krs` uses the source
 * formatter, `.krs.style` uses the Tidy passes from `@karasu-tools/core`.
 * Both are exposed through the same LSP document-formatting request so
 * VS Code sees a single provider (avoiding the "configure default
 * formatter" dialog when more than one is registered).
 *
 * Returns the formatted text, or `null` when there is no edit to apply —
 * either the source cannot be formatted (`FormatError`, e.g. parse errors)
 * or it is already in canonical form.
 */
export function formatSource(src: string, isStyle: boolean): string | null {
  let formatted: string;
  if (isStyle) {
    formatted = tidyStyleSheet(src).output;
  } else {
    try {
      formatted = format(src);
    } catch (e) {
      if (e instanceof FormatError) return null;
      throw e;
    }
  }

  return formatted === src ? null : formatted;
}
