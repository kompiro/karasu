/**
 * React hook that returns a locale-aware formatter for core `Diagnostic`
 * objects.
 *
 * The pure renderer (`renderDiagnostic`) lives in `@karasu-tools/i18n`; this
 * hook binds it to the app's `useTranslation()` so React consumers re-render
 * on locale switch.
 */

import { useCallback } from "react";
import type { Diagnostic } from "@karasu-tools/core";
import { renderDiagnostic } from "@karasu-tools/i18n";
import { useTranslation } from "./index.js";

export function useFormattedDiagnostic(): (d: Diagnostic) => string {
  const { t } = useTranslation();
  return useCallback((d: Diagnostic) => renderDiagnostic(d, t), [t]);
}
