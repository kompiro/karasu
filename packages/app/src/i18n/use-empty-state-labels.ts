import { useContext, useMemo } from "react";
import type { EmptyStateLabels } from "@karasu-tools/core";
import { LocaleContext, translate } from "./index.js";

/**
 * Returns a memoized EmptyStateLabels object populated from the current
 * locale. Pass this to `compileProject` so core renderers can embed the
 * translated text directly into the generated SVGs.
 *
 * Falls back to English when invoked outside a `<LocaleProvider>` so that
 * hook-level tests can render without a provider wrapper.
 */
export function useEmptyStateLabels(): EmptyStateLabels {
  const ctx = useContext(LocaleContext);
  const locale = ctx?.locale ?? "en";
  return useMemo(
    () => ({
      deployTitle: translate(locale, "emptyState.deploy.title"),
      deployHint: translate(locale, "emptyState.deploy.hint"),
      orgNoTeams: translate(locale, "emptyState.org.noTeams"),
      systemNoNodes: translate(locale, "emptyState.system.noNodes"),
      orgPlaceholder: translate(locale, "emptyState.org.placeholder"),
    }),
    [locale],
  );
}
