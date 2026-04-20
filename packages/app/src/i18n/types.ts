/**
 * Translations — the single source of truth for all translatable strings
 * in the karasu app.
 *
 * Each key maps to one of:
 *   - `string`                              : a static phrase (no interpolation)
 *   - `(params: {...}) => string`           : a phrase with typed interpolation
 *
 * Per `docs/design/i18n-support.md`, the locale files (`en.ts`, `ja.ts`)
 * implement this map. The `en.ts` file must be complete (this is what the
 * TypeScript type enforces). The `ja.ts` file may be partial; any key
 * missing in `ja.ts` falls through to the English value at render time.
 *
 * Keys are added incrementally as each app subsystem is translated in the
 * rollout phases documented in `docs/design/i18n-support.md`.
 * Phase A (this file's initial version) seeds the map with the strings
 * needed by the language selector itself, so Phase C1 (toolbar + selector)
 * can consume them immediately.
 */

export type Translations = {
  "languageSelector.label": string;
  "languageSelector.english": string;
  "languageSelector.japanese": string;

  // Settings pane (Phase C2)
  "settings.ai.title": string;
  "settings.security.heading": string;
  "settings.security.bodyBrowser": string;
  "settings.security.bodyXss": string;
  "settings.security.linkLabel": string;
  "settings.apiKey.label": string;
  "settings.persist.label": string;
  "settings.persist.hint": string;
  "settings.save.saved": string;
  "settings.save.label": string;
  "settings.clear.label": string;

  // Project selector (Phase C3)
  "projectSelector.namePlaceholder": string;
  "projectSelector.new.title": string;
  "projectSelector.new.button": string;
  "projectSelector.rename.title": string;
  "projectSelector.rename.button": string;
  "projectSelector.delete.title": string;
  "projectSelector.delete.button": string;
  "projectSelector.delete.confirm": (params: { name: string }) => string;
  "projectSelector.export.title": string;
  "projectSelector.export.button": string;
  "projectSelector.import.title": string;
  "projectSelector.import.button": string;
  "projectSelector.ok": string;
  "projectSelector.cancel": string;

  // Chat pane (Phase C4)
  "chat.newSession.button": string;
  "chat.startInterview.button": string;
  "chat.startReview.button": string;
  "chat.emptyState.hint": string;
  "chat.message.userRole": string;
  "chat.retry.button": string;
  "chat.openSettings.button": string;
  "chat.loading": string;
  "chat.input.placeholderPending": string;
  "chat.input.placeholderDefault": string;
  "chat.input.ariaLabel": string;
  "chat.send.button": string;
  "chat.patch.apply.button": string;
  "chat.patch.reject.button": string;
  "chat.apiKeySetup.message": string;
  "chat.apiKeySetup.goToSettings": string;

  // Chat error messages (Phase C5/C6) — surfaced in the chat log when an
  // Anthropic API call or patch application fails
  "chat.error.auth": string;
  "chat.error.rateLimit": string;
  "chat.error.server": string;
  "chat.error.patchFailed": (params: { detail: string }) => string;

  // NodeDetailPanel (Phase C5)
  "nodeDetail.close": string;
  "nodeDetail.links.title": string;
  "nodeDetail.openDeployView": string;
  "nodeDetail.jumpToEditor": string;

  // DiagramTabBar (Phase C5)
  "diagramTabBar.deploy.unavailableTitle": string;

  // ReferencePanel (Phase C5)
  "referencePanel.unsupportedMessage": string;
};

/**
 * Params accepted by a translation key, inferred from the value type.
 * `never` for string-valued keys (they take no params).
 */
export type TranslationParams<K extends keyof Translations> = Translations[K] extends (
  params: infer P,
) => string
  ? P
  : never;
