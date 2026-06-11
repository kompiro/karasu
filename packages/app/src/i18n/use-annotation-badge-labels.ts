import { useContext, useMemo } from "react";
import type { AnnotationBadgeLabels } from "@karasu-tools/core";
import { LocaleContext, translate } from "./index.js";

/**
 * Returns a memoized AnnotationBadgeLabels object populated from the current
 * locale. Pass this to `compileProject` / the SVG builders so the built-in
 * annotation badges (@deprecated etc.) follow the UI locale.
 *
 * Falls back to English when invoked outside a `<LocaleProvider>` so that
 * hook-level tests can render without a provider wrapper.
 */
export function useAnnotationBadgeLabels(): AnnotationBadgeLabels {
  const ctx = useContext(LocaleContext);
  const locale = ctx?.locale ?? "en";
  return useMemo(
    () => ({
      deprecated: translate(locale, "badge.deprecated"),
      new: translate(locale, "badge.new"),
      experimental: translate(locale, "badge.experimental"),
      migrationTarget: translate(locale, "badge.migrationTarget"),
    }),
    [locale],
  );
}
