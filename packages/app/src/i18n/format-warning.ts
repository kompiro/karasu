/**
 * React hook that returns a locale-aware formatter for core `Warning`
 * objects.
 *
 * The pure renderer (`renderWarning`) lives in `@karasu-tools/i18n`; this
 * hook binds it to the app's `useTranslation()` so React consumers re-render
 * on locale switch.
 */

import { useCallback } from "react";
import type { Warning, FormattedWarning } from "@karasu-tools/core";
import { renderWarning } from "@karasu-tools/i18n";
import { useTranslation } from "./index.js";

export function useFormattedWarning(): (w: Warning) => FormattedWarning {
  const { t } = useTranslation();
  return useCallback((w: Warning) => renderWarning(w, t), [t]);
}
