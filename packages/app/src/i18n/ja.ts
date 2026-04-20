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
  "chat.error.patchFailed": ({ detail }) => `⚠ パッチの適用に失敗しました: ${detail}`,

  // NodeDetailPanel
  "nodeDetail.close": "閉じる",
  "nodeDetail.links.title": "🔗 リンク",
  "nodeDetail.openDeployView": "🚀 Deploy 図で確認 →",
  "nodeDetail.jumpToEditor": "↗ エディタへジャンプ",

  // DiagramTabBar
  "diagramTabBar.deploy.unavailableTitle": "deploy ブロックがありません",

  // ReferencePanel
  "referencePanel.unsupportedMessage": "Tags & Annotations はこのダイアグラムでは未対応です。",

  // Preview toolbar — export controls
  "preview.export.svg.label": "↓ SVG をエクスポート",
  "preview.export.svg.ariaLabel": "SVG をエクスポート",
  "preview.export.options.ariaLabel": "エクスポートのオプション",
  "preview.export.drillDown.label": "ドリルダウン SVG をエクスポート",
  "preview.export.allDiagrams.label": "全図面 SVG をエクスポート",
  "preview.export.drawio.label": "draw.io (mxGraph XML) をエクスポート",
  "preview.export.drawio.title":
    "draw.io (mxGraph XML) にエクスポート — diagrams.net でレイアウトを仕上げるための逃げ道です",
  "preview.export.drawio.failed": ({ detail }) => `⚠ draw.io エクスポートに失敗しました: ${detail}`,

  // Warnings (rendered in the WarningPanel)
  "warning.domainDispersal.message": ({ domainId }) =>
    `domain "${domainId}" が複数の service に分散しています`,
  "warning.domainDispersal.checkCohesion": "ドメインの凝集性を確認してください",
  "warning.unassignedDomain.message": ({ display }) =>
    `domain "${display}" はどの service にも割り当てられていません`,
  "warning.unassignedUsecase.message": ({ usecaseId }) =>
    `usecase "${usecaseId}" はどの domain にも割り当てられていません`,
  "warning.unassignedService.message": ({ display }) =>
    `service "${display}" はどの system にも割り当てられていません`,
  "warning.unassignedDatabase.message": ({ display }) =>
    `database "${display}" はどの system にも割り当てられていません`,
  "warning.unassignedQueue.message": ({ display }) =>
    `queue "${display}" はどの system にも割り当てられていません`,
  "warning.unassignedStorage.message": ({ display }) =>
    `storage "${display}" はどの system にも割り当てられていません`,
  "warning.styleConflict.message": ({ selector }) =>
    `セレクタ "${selector}" が複数のスタイルファイルで定義されています`,
  "warning.styleConflict.sheetLabel": ({ index }) => `スタイルファイル ${index + 1}`,
  "warning.missingRuntime.message": ({ nodeId }) =>
    `デプロイノード "${nodeId}" に runtime が指定されていません`,
  "warning.missingRealizes.message": ({ nodeId }) =>
    `デプロイノード "${nodeId}" に realizes が指定されていません`,
  "warning.invalidOwns.message": ({ teamId, ownedId }) =>
    `team "${teamId}" が "${ownedId}" を owns していますが、その id を持つ service または domain が存在しません`,
  "warning.deprecatedTeamProperty.message": ({ nodeId }) =>
    `"${nodeId}" に team プロパティが直接指定されていますが、org.team.owns 経由で既に割り当て済みです`,
  "warning.deprecatedTeamProperty.assignedBy": ({ ownerTeamId }) =>
    `owns による team 割り当て: "${ownerTeamId}"`,
  "warning.deprecatedTeamProperty.recommendation":
    '"team" プロパティを削除し、org { team { owns } } 側に寄せてください',
  "warning.crossSystemRefUnresolved.message": ({ ref }) =>
    `"${ref}" を解決できませんでした — 未解決の外部ノードとして描画されます`,
  "warning.crossSystemRefImplicitExternal.message": ({ ref, sourceSystemId, sourceNodeId }) =>
    `"${ref}" は ${sourceSystemId}.${sourceNodeId} から参照されていますが、@external として明示されていません`,
  "warning.crossSystemRefImplicitExternal.suppressHint": ({ targetSystemId, sourceSystemId }) =>
    `system ${sourceSystemId} に 'service ${targetSystemId} [external]' を追加するとこの警告を抑制できます`,
  "warning.cyclicDependency.message": ({ path }) => `循環依存を検出しました: ${path}`,
};
