import type { Translations } from "./types.js";

/**
 * English translation map.
 *
 * Must be COMPLETE — the `Translations` type is the source of truth,
 * and the English map is the fallback for any key missing in other
 * locale maps. TypeScript will error if a new key is added to
 * `Translations` without a corresponding entry here.
 */
export const en: Translations = {
  "languageSelector.label": "Language",
  "languageSelector.english": "English",
  "languageSelector.japanese": "Japanese",

  // Settings pane
  "settings.ai.title": "⚙ AI settings",
  "settings.security.heading": "⚠ About security",
  "settings.security.bodyBrowser":
    "This tool uses your Claude API key directly in the browser. The key is stored only in this browser and is never sent to any external server.",
  "settings.security.bodyXss":
    "However, the key could leak if this page is compromised by an XSS attack. We recommend issuing a karasu-specific restricted key from the Anthropic console.",
  "settings.security.linkLabel": "→ Manage keys on console.anthropic.com",
  "settings.apiKey.label": "Claude API key",
  "settings.persist.label": "Persist across sessions (save to localStorage)",
  "settings.persist.hint": "When off, the API key is cleared when the tab closes (recommended).",
  "settings.save.saved": "✓ Saved",
  "settings.save.label": "💾 Save",
  "settings.clear.label": "🗑 Clear",

  // Project selector
  "projectSelector.namePlaceholder": "Project name",
  "projectSelector.new.title": "New project",
  "projectSelector.new.button": "+ New",
  "projectSelector.rename.title": "Rename project",
  "projectSelector.rename.button": "✎ Rename",
  "projectSelector.delete.title": "Delete project",
  "projectSelector.delete.button": "✕ Delete",
  "projectSelector.delete.confirm": ({ name }) => `Delete "${name}"?`,
  "projectSelector.export.title": "Export as ZIP",
  "projectSelector.export.button": "↓ Export",
  "projectSelector.import.title": "Import from ZIP",
  "projectSelector.import.button": "↑ Import",
  "projectSelector.ok": "OK",
  "projectSelector.cancel": "Cancel",

  // Chat pane
  "chat.newSession.button": "↺ New Session",
  "chat.startInterview.button": "▶ Start Interview",
  "chat.startReview.button": "🔍 Start Review",
  "chat.emptyState.hint": 'Or type freely (e.g. "Review this model")',
  "chat.message.userRole": "You",
  "chat.retry.button": "↺ Retry",
  "chat.openSettings.button": "⚙ Open Settings",
  "chat.loading": "AI is thinking…",
  "chat.input.placeholderPending": "Please review the patch before sending",
  "chat.input.placeholderDefault": "Type a message… (Cmd+Enter or Ctrl+Enter to send)",
  "chat.input.ariaLabel": "Chat message input",
  "chat.send.button": "↑ Send",
  "chat.patch.apply.button": "✓ Apply",
  "chat.patch.reject.button": "✕ Reject",
  "chat.apiKeySetup.message": "A Claude API key is required to use AI features.",
  "chat.apiKeySetup.goToSettings": "⚙ Configure in Settings",

  // Chat error messages
  "chat.error.auth": "⚠ The API key is invalid. Please set a valid key in Settings.",
  "chat.error.rateLimit": "⚠ Rate limit reached. Please wait a moment and retry.",
  "chat.error.server": "⚠ Anthropic server error. Please wait a moment and retry.",

  // NodeDetailPanel
  "nodeDetail.close": "Close",
  "nodeDetail.links.title": "🔗 Links",
  "nodeDetail.openDeployView": "🚀 View in Deploy diagram →",
  "nodeDetail.jumpToEditor": "↗ Jump to editor",

  // DiagramTabBar
  "diagramTabBar.deploy.unavailableTitle": "No deploy block defined",

  // ReferencePanel
  "referencePanel.unsupportedMessage": "Tags & Annotations are not available for this diagram.",
};
