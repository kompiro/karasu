import type { Translations } from "./types.js";

/**
 * Japanese translation map.
 *
 * Typed as `Partial<Translations>` — missing keys fall through to the
 * English value at render time. Keeping it partial lets translators
 * land keys incrementally instead of needing every key translated
 * before anything can ship.
 */
export const ja: Partial<Translations> = {
  "languageSelector.label": "言語",
  "languageSelector.english": "英語",
  "languageSelector.japanese": "日本語",

  // Settings pane
  "settings.ai.title": "⚙ AI 設定",
  "settings.security.heading": "⚠ セキュリティについて",
  "settings.security.bodyBrowser":
    "このツールは Claude API キーをブラウザ上で直接使用します。API キーはこのブラウザ内にのみ保存され、外部サーバーには送信されません。",
  "settings.security.bodyXss":
    "ただし、XSS 攻撃を受けた場合にキーが漏洩するリスクがあります。Anthropic コンソールで karasu 専用の制限付きキーを発行することを推奨します。",
  "settings.security.linkLabel": "→ console.anthropic.com でキーを管理",
  "settings.apiKey.label": "Claude API キー",
  "settings.persist.label": "セッションをまたいで保存する（localStorage に保存）",
  "settings.persist.hint": "オフの場合、タブを閉じると API キーは削除されます（推奨）。",
  "settings.save.saved": "✓ 保存しました",
  "settings.save.label": "💾 保存する",
  "settings.clear.label": "🗑 削除する",

  // Project selector
  "projectSelector.namePlaceholder": "プロジェクト名",
  "projectSelector.new.title": "新規プロジェクト",
  "projectSelector.new.button": "+ 新規",
  "projectSelector.rename.title": "プロジェクトをリネーム",
  "projectSelector.rename.button": "✎ リネーム",
  "projectSelector.delete.title": "プロジェクトを削除",
  "projectSelector.delete.button": "✕ 削除",
  "projectSelector.delete.confirm": ({ name }) => `"${name}" を削除しますか?`,
  "projectSelector.export.title": "ZIPとしてエクスポート",
  "projectSelector.export.button": "↓ エクスポート",
  "projectSelector.import.title": "ZIPからインポート",
  "projectSelector.import.button": "↑ インポート",
  "projectSelector.ok": "OK",
  "projectSelector.cancel": "キャンセル",

  // Chat pane
  "chat.newSession.button": "↺ 新しい会話",
  "chat.startInterview.button": "▶ インタビュー開始",
  "chat.startReview.button": "🔍 レビュー開始",
  "chat.emptyState.hint": "または自由に入力してください（例: 「このモデルをレビューして」）",
  "chat.message.userRole": "あなた",
  "chat.retry.button": "↺ 再試行",
  "chat.openSettings.button": "⚙ Settings を開く",
  "chat.loading": "AI が考えています…",
  "chat.input.placeholderPending": "パッチを確認してから送信してください",
  "chat.input.placeholderDefault": "メッセージを入力…（Cmd+Enter または Ctrl+Enter で送信）",
  "chat.input.ariaLabel": "チャットメッセージ入力",
  "chat.send.button": "↑ 送信",
  "chat.patch.apply.button": "✓ 適用",
  "chat.patch.reject.button": "✕ 却下",
  "chat.apiKeySetup.message": "AI 機能を使うには Claude API キーが必要です。",
  "chat.apiKeySetup.goToSettings": "⚙ Settings で設定する",

  // Chat error messages
  "chat.error.auth": "⚠ APIキーが無効です。Settings で正しいキーを設定してください。",
  "chat.error.rateLimit": "⚠ リクエスト制限に達しました。しばらく待ってから再試行してください。",
  "chat.error.server": "⚠ Anthropic サーバーエラーです。しばらく待ってから再試行してください。",

  // NodeDetailPanel
  "nodeDetail.close": "閉じる",
  "nodeDetail.links.title": "🔗 リンク",
  "nodeDetail.openDeployView": "🚀 Deploy 図で確認 →",
  "nodeDetail.jumpToEditor": "↗ エディタへジャンプ",

  // DiagramTabBar
  "diagramTabBar.deploy.unavailableTitle": "deploy ブロックがありません",

  // ReferencePanel
  "referencePanel.unsupportedMessage": "Tags & Annotations はこのダイアグラムでは未対応です。",
};
