/**
 * Locale resolution + resolved label strings for the preview webview's
 * detail panel.
 *
 * The webview `<script>` is string-built in the extension host and evaluated
 * later inside the webview's sandboxed browser context, so it cannot call
 * into `@karasu-tools/i18n` the way the app's React `NodeDetailPanel` does
 * (via `useTranslation`). Instead the host resolves the active locale from
 * `vscode.env.language` here, pre-computes every user-facing panel label,
 * and hands the resolved strings to `buildPreviewHtml` (which stays
 * i18n-agnostic — it only interpolates already-computed strings, mirroring
 * the `theme-mapping.ts` / `message-validation.ts` split).
 *
 * The keys mirror the app `NodeDetailPanel`'s `t("nodeDetail.*")` calls
 * one-for-one, so the webview shows byte-identical labels to the app under
 * any locale (Issue #2074). Property-row labels (runtime / type / image /
 * schedule / realizes) are intentionally NOT here: they come from the
 * shared `@karasu-tools/core` NODE_DETAIL_PROPERTY_FIELDS spec, which the
 * app also renders without translating — parity there is already exact.
 */

import { bindTranslate, type Locale } from "@karasu-tools/i18n";

/**
 * Resolved, locale-specific label strings the detail-panel `<script>`
 * interpolates. Injected as a JSON object into the webview so the
 * client-side `showDetailPanel` reads `PANEL_LABELS.<key>` instead of a
 * hardcoded English word.
 */
export interface PreviewPanelLabels {
  /** Close button `aria-label`. */
  close: string;
  /** "🔗 Links" section title. */
  linksTitle: string;
  /** "📦 Storage resources" section title (client kind). */
  resourcesTitle: string;
  /** "🔐 Capabilities" section title (client kind). */
  capabilitiesTitle: string;
  /** "🕒 Migration intent" section title. */
  migrationTitle: string;
  /** "until" row prefix inside the migration section. */
  migrationUntil: string;
  /** "from" row prefix inside the migration section. */
  migrationFrom: string;
  /** "🚀 View in Deploy diagram →" cross-diagram nav button. */
  openDeployView: string;
  /** "↗ Jump to editor" button. */
  jumpToEditor: string;
}

/**
 * Resolve VS Code's display language to a karasu `Locale`. `vscode.env.language`
 * is a BCP-47-ish tag ("en", "en-US", "ja", "ja-jp", …); anything that is not
 * Japanese falls back to English, matching `resolveLspLocale` and the
 * tooling-output default from `docs/spec/i18n.md`.
 */
export function resolveWebviewLocale(vscodeLanguage: string): Locale {
  return vscodeLanguage.toLowerCase().startsWith("ja") ? "ja" : "en";
}

/** Pre-compute every detail-panel label for `locale`. */
export function buildPreviewPanelLabels(locale: Locale): PreviewPanelLabels {
  const t = bindTranslate(locale);
  return {
    close: t("nodeDetail.close"),
    linksTitle: t("nodeDetail.links.title"),
    resourcesTitle: t("nodeDetail.resources.title"),
    capabilitiesTitle: t("nodeDetail.capabilities.title"),
    migrationTitle: t("nodeDetail.migration.title"),
    migrationUntil: t("nodeDetail.migration.until"),
    migrationFrom: t("nodeDetail.migration.from"),
    openDeployView: t("nodeDetail.openDeployView"),
    jumpToEditor: t("nodeDetail.jumpToEditor"),
  };
}
