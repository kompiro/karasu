import type { Translations } from "./types.js";
import { formatRange } from "./format.js";

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

  // Theme selector
  "theme.label": "テーマ",
  "theme.system": "システム",
  "theme.light": "ライト",
  "theme.dark": "ダーク",

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
  "settings.persist.hint":
    "オフの場合、タブを閉じると API キーは削除されます（推奨）。オンにするとセッションを跨いでこのページ上のスクリプトからキーが読める状態が続くため、万一 XSS が成立した場合の露出期間が大幅に長くなります。",
  "settings.save.saved": "✓ 保存しました",
  "settings.save.label": "💾 保存する",
  "settings.clear.label": "🗑 削除する",

  // ProjectMode bootstrap error screen (#1530)
  "projectInit.error.title": "プロジェクトの読み込みに失敗しました。",
  "projectInit.error.hint":
    "ブラウザのストレージ (OPFS) が使用できない場合に発生することがあります（プライベートブラウジング、ストレージ容量超過など）。ブラウザの設定を確認して再読み込みしてください。",

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
  "projectSelector.translate.title": "インフラ設定を .krs に変換",
  "projectSelector.translate.button": "⇄ 変換",
  "projectSelector.ok": "OK",
  "projectSelector.cancel": "キャンセル",
  "project.error.create": ({ detail }) => `⚠ プロジェクトの作成に失敗しました: ${detail}`,
  "project.error.rename": ({ detail }) => `⚠ プロジェクト名の変更に失敗しました: ${detail}`,
  "project.error.delete": ({ detail }) => `⚠ プロジェクトの削除に失敗しました: ${detail}`,
  "project.error.export": ({ detail }) => `⚠ プロジェクトのエクスポートに失敗しました: ${detail}`,
  "project.error.import": ({ detail }) => `⚠ インポートに失敗しました: ${detail}`,
  "project.error.openExample": ({ detail }) => `⚠ example を開けませんでした: ${detail}`,
  "project.error.snapshot": ({ detail }) => `⚠ スナップショットの取得に失敗しました: ${detail}`,
  "project.error.dismiss": "✕ 閉じる",

  // Translate dialog
  "translateDialog.title": "⇄ インフラ設定を .krs に変換",
  "translateDialog.description":
    "Docker Compose・Kubernetes・OpenAPI・DB スキーマのファイルを .krs の足場に変換します。",
  "translateDialog.format.label": "入力フォーマット",
  "translateDialog.format.compose": "Docker Compose",
  "translateDialog.format.k8s": "Kubernetes マニフェスト",
  "translateDialog.format.openapi": "OpenAPI spec",
  "translateDialog.format.db": "DB スキーマ (SQL)",
  "translateDialog.format.wrangler": "Cloudflare wrangler.toml",
  "translateDialog.loadHint": "下に貼り付けるか、ファイルを読み込んでください:",
  "translateDialog.loadFile": "📂 ファイルを読み込む…",
  "translateDialog.loadFile.aria": "ファイルを読み込む",
  "translateDialog.sourceContent": "変換元の内容",
  "translateDialog.advanced": "詳細オプション",
  "translateDialog.sourceName.label": "ソース名 (deploy / service / database 名の導出に使用)",
  "translateDialog.sourceName.aria": "ソース名",
  "translateDialog.service.label": "サービス名 (info.title を上書き)",
  "translateDialog.service.aria": "サービス名",
  "translateDialog.database": "データベース名",
  "translateDialog.granularity.label": "粒度",
  "translateDialog.granularity.resourceDefault": "resource (デフォルト)",
  "translateDialog.granularity.operation": "operation",
  "translateDialog.granularity.aggregateDefault": "aggregate (デフォルト)",
  "translateDialog.granularity.table": "table",
  "translateDialog.emitBindings": "usecase → resource バインディングを出力",
  "translateDialog.emitCrudDecoration": "操作を <verb>:<crud> で装飾",
  "translateDialog.system.label": "system ブロックでラップ (任意)",
  "translateDialog.system.aria": "システム名",
  "translateDialog.mapFile.label": "karasu.map.yaml の内容 (任意 — realizes を解決)",
  "translateDialog.mapFile.aria": "karasu.map.yaml の内容",
  "translateDialog.result": "生成された .krs",
  "translateDialog.close": "閉じる",
  "translateDialog.download": "↓ .krs をダウンロード",
  "translateDialog.copy": "⧉ .krs をコピー",
  "translateDialog.translate": "⇄ 変換",
  "translateDialog.copyFailed":
    "クリップボードにコピーできませんでした。テキストを選択して手動でコピーしてください。",
  "translateDialog.loadFailed": "選択したファイルを読み込めませんでした。",

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
  "nodeDetail.annotationDiff.title": "⇄ アノテーション差分",
  "nodeDetail.resources.title": "📦 ストレージリソース",
  "nodeDetail.capabilities.title": "🔐 ケイパビリティ",
  "nodeDetail.migration.title": "🕒 移行 intent",
  "nodeDetail.migration.until": "until",
  "nodeDetail.migration.from": "from",

  // Empty-state placeholders (rendered inside SVG by core renderers)
  "emptyState.deploy.title": "deploy ブロックが定義されていません",
  "emptyState.deploy.hint": ".krs ファイルに deploy ブロックを追加してください",
  "emptyState.deploy.jobBand": "定期実行ジョブ",
  "emptyState.deploy.unclassified": "未分類",
  "emptyState.org.noTeams": "team が定義されていません",
  "emptyState.system.noNodes": "表示するノードがありません",
  "emptyState.org.placeholder": "org 図がありません",
  "emptyState.system.noDiagram": "図がありません",

  // Built-in annotation badge labels (must match reference-data ja labels)
  "badge.deprecated": "非推奨",
  "badge.new": "NEW",
  "badge.experimental": "実験的",
  "badge.migrationTarget": "移行先",

  // ReferencePanel
  "referencePanel.unsupportedMessage": "Tags & Annotations はこのダイアグラムでは未対応です。",
  "referencePanel.builtin.description":
    "組み込みのデフォルトテーマ — すべてのダイアグラム種別に適用される（カスケード優先度は最低）",
  "referencePanel.samples.description": "system + deploy + organization をまとめたサンプル",
  "referencePanel.copy.label": "コピー",
  "referencePanel.copy.copied": "コピーしました！",

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

  // グループ化（system view のチーム別グルーピング、#1858）
  "preview.facets.label": "ファセット",
  "preview.facets.active": ({ count }) => `◎ ファセット (${count})`,
  "preview.groupBy.label": "グループ化",
  "preview.groupBy.none": "なし",
  "preview.groupBy.team": "チーム",
  "preview.groupBy.boundary": "境界",
  "preview.groupBy.collapseAll": "すべて畳む",
  "preview.groupBy.expandAll": "すべて展開",
  "preview.expansion.overloadHint": "多くのコンテナを展開中 — Collapse all で俯瞰に戻れます",

  // 共有（inline URL 共有、karasu-nest）
  "preview.share.label": "🔗 Share",
  "preview.share.ariaLabel": "この図を共有",
  "preview.share.dialog.title": "この図を共有",
  "preview.share.dialog.description":
    "リンクを知っている人は誰でもこの図を閲覧できます（内容は URL 自体に埋め込まれます）。共有方法に合わせてリンクを選んでください。",
  "preview.share.dialog.privateLabel": "プライベートリンク",
  "preview.share.dialog.privateHint":
    "サーバーには送信されません。ただし Slack や X などのリンクプレビューには図が表示されません。",
  "preview.share.dialog.privateUrlAriaLabel": "プライベート共有 URL",
  "preview.share.dialog.unfurlLabel": "プレビュー付きリンク",
  "preview.share.dialog.unfurlHint":
    "Slack や X などでこの図がプレビュー表示されます。共有内容はサーバーに送信されます（ログに残る場合があります）。",
  "preview.share.dialog.unfurlUrlAriaLabel": "プレビュー付き共有 URL",
  "preview.share.dialog.oversizeWarning":
    "このプロジェクトは大きすぎてプレビュー付きリンクを作成できません。プライベートリンクは利用できます。",
  "preview.share.dialog.includeTargetLabel": "現在の表示位置にリンクする",
  "preview.share.dialog.includeTargetHint":
    "モデル全体ではなく、今いる位置までドリルした状態（フォーカス中の要素はハイライト）でリンクを開きます。",
  "preview.share.dialog.generating": "リンクを生成中…",
  "preview.share.dialog.copy": "⧉ コピー",
  "preview.share.dialog.copied": "✓ クリップボードにコピーしました",
  "preview.share.dialog.close": "閉じる",
  "preview.share.restoreFailed":
    "この共有リンクを復元できませんでした。代わりに新しいプロジェクトを開きます。",

  // ドキュメントリンクのドロップダウン（アプリ内 Reference + 外部ドキュメントサイト）
  "preview.docs.label": "📖 Docs",
  "preview.docs.ariaLabel": "ドキュメントリンク",
  "preview.docs.reference.label": "↗ Reference",
  "preview.docs.site.label": "↗ ドキュメントサイト",
  "preview.docs.site.ariaLabel": "ドキュメントサイトを新しいタブで開く",

  // Warnings (rendered in the WarningPanel)
  "warning.domainDispersal.message": ({ domainId }) =>
    `domain "${domainId}" は複数の service の配下に登場します`,
  "warning.domainDispersal.checkCohesion":
    "DDD では同じドメインが複数 service にまたがる状態を凝集性のシグナルとみなすことがあります",
  "warning.sharedInfraFanIn.message": ({ infraKind, infraId, count }) =>
    `${infraKind} "${infraId}" は ${count} 個の service から参照されています`,
  "warning.sharedInfraFanIn.checkDatabasePerService":
    "マイクロサービスの Database-per-Service は共有された store を smell とみなすことがあります",
  "warning.crossDomainStoreAccess.message": ({
    accessingDomain,
    infraKind,
    infraId,
    tableId,
    mode,
    ownerCount,
  }) => {
    const verb = mode === "write" ? "書き込み" : mode === "readwrite" ? "読み書き" : "読み取り";
    const owner = ownerCount > 1 ? `他の ${ownerCount} ドメイン` : "別ドメイン";
    return `domain "${accessingDomain}" が${owner}所有の ${infraKind} leaf "${infraId}.${tableId}" を${verb}しています`;
  },
  "warning.crossDomainStoreAccess.checkBoundary":
    "他ドメインの store に踏み込むことを境界の smell とみなす流派があります（shared kernel や移行期には正当なこともあります）",
  "warning.unassignedDomain.message": ({ display }) =>
    `domain "${display}" はどの service にも割り当てられていません`,
  "warning.unassignedUsecase.message": ({ usecaseId }) =>
    `usecase "${usecaseId}" はどの domain にも割り当てられていません`,
  "warning.unassignedResource.message": ({ resourceId }) =>
    `resource "${resourceId}" はどの database にも entity にも解決されていません`,
  "warning.entityAnchorCollision.message": ({ id }) =>
    `entity anchor id "${id}" が複数の domain / entity に使われています。#krs-entity-${id} の deep-link が曖昧になります`,
  "warning.unassignedService.message": ({ display }) =>
    `service "${display}" はどの system にも割り当てられていません`,
  "warning.unassignedClient.message": ({ display }) =>
    `client "${display}" はどの system にも割り当てられていません`,
  "warning.unresolvedHandles.message": ({ nodeKind, nodeId, domainId }) =>
    `${nodeKind} "${nodeId}" の handles "${domainId}" を expose する送信先エッジが見つかりません`,
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
  "warning.unresolvedRealizes.message": ({ deployNodeId, target }) =>
    `デプロイノード "${deployNodeId}" の realizes "${target}" を解決できる service / domain が見つかりません`,
  "warning.invalidOwns.message": ({ teamId, ownedId }) =>
    `team "${teamId}" が "${ownedId}" を owns していますが、その id を持つ service または domain が存在しません`,
  "warning.crossSystemRefUnresolved.message": ({ ref }) =>
    `"${ref}" を解決できませんでした — 未解決の外部ノードとして描画されます`,
  "warning.unresolvedEdgeEndpoint.message": ({ from, to, unresolvedId }) =>
    `エッジ "${from} → ${to}" が未定義のノード "${unresolvedId}" を参照しています。このエッジは描画されません（解決できた側のノードは保持されます）`,
  "warning.edgeEndpointNotAtScope.message": ({
    from,
    to,
    endpointId,
    endpointKind,
    ownerId,
    ownerKind,
    scopeId,
    scopeKind,
  }) =>
    `エッジ "${from} → ${to}" は ${scopeKind} "${scopeId}" の中で宣言されていますが、"${endpointId}" は${
      ownerId === "" ? "" : ` ${ownerKind} "${ownerId}" 配下の`
    } ${endpointKind} です。このスコープの peer ではないため、このエッジはどのビューにも描画されません`,
  "warning.edgeEndpointNotAtScope.anchorHint": ({ from, to }) =>
    `エッジを source のブロック内（\`${from} { -> ${to} }\`）に書くと、両端が peer になるビューで描画されます`,
  "warning.edgeEndpointNotAtScope.qualifyHint": ({ ownerId, endpointId }) =>
    `参照先を限定子付き（"${ownerId}.${endpointId}"）で書くと、entity ビューに描画されます`,
  "warning.crossSystemRefImplicitExternal.message": ({ ref, sourceSystemId, sourceNodeId }) =>
    `"${ref}" は ${sourceSystemId}.${sourceNodeId} から参照されていますが、@external として明示されていません`,
  "warning.crossSystemRefImplicitExternal.suppressHint": ({ targetSystemId, sourceSystemId }) =>
    `system ${sourceSystemId} に 'service ${targetSystemId} [external]' を追加するとこの警告を抑制できます`,
  "warning.cyclicDependency.message": ({ path }) => `循環依存を検出しました: ${path}`,
  "warning.deliversTargetNotClient.message": ({ serviceId, targetId }) =>
    `service "${serviceId}" の delivers 先 "${targetId}" は client ノードではありません`,
  "warning.clientCapabilityDuplicate.message": ({ clientId, name }) =>
    `client "${clientId}" は capability "${name}" を複数回宣言しています`,
  "warning.annotationPossibleTypo.message": ({ nodeId, annotation, suggestion }) =>
    `${nodeId} の "@${annotation}" — "@${suggestion}" の誤記ではありませんか？`,
  "warning.annotationPossibleTypo.openSetNote":
    "このヒントは組み込み名に近い名前にのみ表示されます。任意の名前は v1.x では引き続きパースされますが、非組み込み名は非推奨です（annotation-not-builtin を参照）。",
  "warning.tagNotBuiltin.message": ({ nodeId, tag }) =>
    `${nodeId} の "[${tag}]" は組み込みタグではありません — 非推奨です。構文 v2.0 はツール語彙のみを受理します（警告であり、パースは通ります）。`,
  "warning.tagNotBuiltin.migrationNote":
    "所属やモデル固有のラベリングは facet 構文（#2065）へ移行してください。新しいアーキタイプが必要な場合は組み込みタグの追加要望を出してください。",
  "warning.tagNotApplicable.message": ({ nodeId, tag, nodeKind, appliesTo }) =>
    `${nodeId} の "[${tag}]" は効果がありません: このタグは ${appliesTo} に適用されますが、${nodeId} は ${nodeKind} です。`,
  "warning.tagNotApplicable.applicabilityNote":
    "組み込みタグは適用範囲に挙げられた kind の上でのみ意味を持ちます。タグを外すか、適用範囲に含まれる kind のノードへ移してください。",
  "warning.annotationNotBuiltin.message": ({ nodeId, annotation }) =>
    `${nodeId} の "@${annotation}" は組み込みアノテーションではありません — 非推奨です。構文 v2.0 はツール語彙のみを受理します（警告であり、パースは通ります）。`,
  "warning.annotationNotBuiltin.migrationNote":
    "所属やモデル固有のラベリングは facet 構文（#2065）へ移行してください。新しい lifecycle 状態が必要な場合は組み込みアノテーションの追加要望を出してください。",
  "warning.facetNotDeclared.message": ({ nodeId, facetId }) =>
    `${nodeId} の "facets ${facetId}" は宣言済みの facet を指していません`,
  "warning.facetNotDeclared.declarationNote":
    'top-level に facet <id> { label "..." } を宣言するか、既存の宣言に合わせて綴りを修正してください。',
  "warning.legendRefUnresolved.message": ({ target, legendTitle }) =>
    legendTitle
      ? `legend "${legendTitle}": ref ${target} はどのノード・スタイル規則にも一致しません`
      : `legend ref ${target} はどのノード・スタイル規則にも一致しません`,
  "warning.styleColumnInvalidValue.message": ({ nodeId, value }) =>
    `column: "${value}"（#${nodeId}）は left / center / right のいずれでもないため無視されました`,
  "warning.styleColumnIgnoredNonSystemView.message": ({ nodeId, viewType }) =>
    `#${nodeId} の column ヒントは ${viewType} ビューでは無視されます（layout hints は現状 system view のみ対応）`,
  "warning.styleGridColumnsInvalidValue.message": ({ nodeId, value }) =>
    `grid-columns: "${value}"（#${nodeId}）は正の整数ではないため無視されました（自動バランスにフォールバック）`,
  "warning.styleInvalidEnumValue.message": ({ property, value, allowed }) =>
    `${property}: "${value}" は ${allowed.join(" / ")} のいずれでもないため無視されました`,
  "warning.styleInvalidHexColor.message": ({ property, value }) =>
    `${property}: "${value}" は有効な hex color ではないため無視されました（#RGB / #RGBA / #RRGGBB / #RRGGBBAA を期待）`,
  "warning.styleMissingLengthUnit.message": ({ property, value, allowedUnits }) =>
    `${property}: "${value}" に単位がないため無視されました（${allowedUnits.join(" / ")} を期待）`,
  "warning.styleInvalidLengthUnit.message": ({ property, value, unit, allowedUnits }) =>
    `${property}: "${value}" の単位 "${unit}" は無効です（${allowedUnits.join(" / ")} を期待）— 無視されました`,
  "warning.styleOutOfRange.message": ({ property, value, min, max }) =>
    `${property}: ${value} は範囲外 ${formatRange(min, max)} のため無視されました`,
  "warning.styleUnknownProperty.message": ({ property }) =>
    `未知のスタイルプロパティ "${property}" — 無視されました`,

  // Diagnostics (rendered in PreviewPane's diagnostic banner)
  "diagnostic.tokenTypeMismatch.message": ({ expected, got, value }) =>
    `${expected} を期待しましたが ${got} ("${value}") が見つかりました`,
  "diagnostic.unexpectedTokenRoot.message": ({ tokenType, value }) =>
    `予期しないトークン: ${tokenType} ("${value}")`,
  "diagnostic.topLevelDeclaration.message": ({ construct }) =>
    `トップレベルの ${construct} は許可されていません — system ブロックの内側で宣言してください`,
  "diagnostic.unexpectedTokenInBlock.subResource": ({ tokenType, value }) =>
    `sub-resource ブロック内で予期しないトークン: ${tokenType} ("${value}")。sub-resource ノード（table, queue-item, bucket）は子宣言を含められません。`,
  "diagnostic.unexpectedTokenInBlock.generic": ({ tokenType, value }) =>
    `ブロック内で予期しないトークン: ${tokenType} ("${value}")`,
  "diagnostic.unexpectedTokenInBlock.deployNode": ({ tokenType, value }) =>
    `deploy ノード内で予期しないトークン: ${tokenType} ("${value}")`,
  "diagnostic.unexpectedTokenInBlock.named": ({ blockKind, tokenType, value }) =>
    `${blockKind} ブロック内で予期しないトークン: ${tokenType} ("${value}")`,
  "diagnostic.expectedBraceOrString.message": ({ got, value }) =>
    `{ または文字列リテラルを期待しましたが ${got} ("${value}") が見つかりました`,
  "diagnostic.expectedIdentifier.message": ({ got, value }) =>
    `識別子を期待しましたが ${got} ("${value}") が見つかりました`,
  "diagnostic.expectedStringAfter.message": ({ property }) =>
    `"${property}" の後に文字列リテラルを期待しました`,
  "diagnostic.propertyNotForNodeKind.role": `"role" プロパティは user ノードでのみ有効です`,
  "diagnostic.propertyNotForNodeKind.handles": `"handles" プロパティは client / service ノードでのみ有効です`,
  "diagnostic.propertyNotForNodeKind.delivers": `"delivers" プロパティは service ノードでのみ有効です`,
  "diagnostic.propertyNotForNodeKind.operations": `"operations" プロパティは usecase 内の resource 宣言でのみ有効です`,
  "diagnostic.infraNotInContext.message": ({ infraKind, parentKind }) =>
    `"${infraKind}" は system の直接の子としてのみ有効です。"${parentKind}" の内側には配置できません`,
  "diagnostic.entityNotInDomain.message": ({ parentKind }) =>
    `"entity" は domain の子としてのみ有効です。"${parentKind}" の内側には配置できません`,
  "diagnostic.nodeNotInContext.message": ({ childKind, parentKind }) =>
    `"${childKind}" は "${parentKind}" の子として定義されていません。描画はされますが意味は定義されていません`,
  "diagnostic.legendNotTopLevel.message": ({ parentKind }) =>
    `legend ブロックはファイルのトップレベルにのみ書けます。"${parentKind}" の内側には配置できません`,
  "diagnostic.expectedIdOrString.message": ({ context }) =>
    `"${context}" の後に識別子または文字列リテラルを期待しました`,
  "diagnostic.expectedNodeId.message": ({ kind }) =>
    `"${kind}" の後に識別子または文字列リテラル (id) を期待しました`,
  "diagnostic.invalidNodeKind.message": ({ kind }) => `未知の論理ノード種別: "${kind}"`,
  "diagnostic.expectedPropertyValue.message": ({ propName }) =>
    `プロパティ "${propName}" の値を期待しました`,
  "diagnostic.expectedIdAfter.message": ({ property }) =>
    `"${property}" の後に識別子または文字列リテラルを期待しました`,
  "diagnostic.teamPropertyRemoved.message": `"team" プロパティは削除されました。organization ブロックと "owns" で所有を宣言してください`,
  "diagnostic.annotationParamUnsupported.message": ({ annotation, key }) =>
    `"@${annotation}" は "${key}" パラメータをサポートしていません。無視されます`,
  "diagnostic.linkUrlSchemeNotAllowed.message": ({ url, scheme }) =>
    scheme
      ? `link URL "${url}" は許可されていないスキーム "${scheme}" を使用しています（許可: http, https, mailto）。このリンクは無視されます`
      : `link URL "${url}" は http / https / mailto の絶対 URL ではありません。このリンクは無視されます`,
  "diagnostic.edgeSourceMismatch.message": ({ from, parentId }) =>
    `エッジ source "${from}" は所属するブロック id "${parentId}" と一致する必要があります`,
  "diagnostic.clientResourceInvalidKind.message": ({ kind, name }) =>
    `client の resource "${name}" の種別 "${kind}" は無効です。利用可能な種別: localStorage, sessionStorage, indexedDB, opfs, file, keychain`,
  "diagnostic.unknownResourceOperation.message": ({ operation, resourceId }) =>
    `resource "${resourceId}" に未知の operation "${operation}" が指定されました。認識される verb: create, read, update, delete`,
  "diagnostic.duplicateResourceOperation.message": ({ operation, resourceId }) =>
    `resource "${resourceId}" の operation "${operation}" が重複しています`,
  "diagnostic.invalidCrudDecoration.message": ({ operation, value, resourceId }) =>
    `resource "${resourceId}" の operation "${operation}" の CRUD 装飾 "${value}" が無効です。右辺は create / read / update / delete のいずれかである必要があります`,
  "diagnostic.emptyCrudDecoration.message": ({ operation, resourceId }) =>
    `resource "${resourceId}" の operation "${operation}" の CRUD 装飾が空です。"${operation}:create,read,update,delete" 形式で指定するか、コロンを削除してください`,
  "diagnostic.duplicateCrudDecorationTarget.message": ({ operation, value, resourceId }) =>
    `resource "${resourceId}" の operation "${operation}" の装飾内に CRUD verb "${value}" が重複しています`,
  "diagnostic.duplicateOwnerAssignment.message": ({ nodeId, existingTeam }) =>
    `"${nodeId}" は複数の team が owns しています。主オーナーとして "${existingTeam}" を採用します`,
  "diagnostic.duplicateBoundaryAssignment.message": ({ nodeId, existingBoundary }) =>
    `"${nodeId}" は複数の boundary に所属しています（"${existingBoundary}" を含む）`,
  "diagnostic.boundaryMembershipNotDrawn.message": ({ nodeId, boundaryId }) =>
    `このビューでは boundary "${boundaryId}" の枠が "${nodeId}" に届きません。所属はカード上に表示しています`,
  "diagnostic.containsTargetNotFound.message": ({ memberId }) =>
    `"contains" で参照されている "${memberId}" が system 階層内に見つかりません`,
  "diagnostic.boundaryNotInContext.message": ({ parentKind }) =>
    `"${parentKind}" は自身のキャンバスを持たないため、その中に "boundary" は宣言できません`,
  "diagnostic.duplicateBoundaryId.message": ({ boundaryId }) =>
    `同一スコープ内で boundary id "${boundaryId}" が重複しています`,
  "diagnostic.duplicateFacetId.message": ({ facetId }) =>
    `facet "${facetId}" は既に宣言されています。参照が解決するのは最初の宣言です`,
  "diagnostic.positionalLabelRemoved.message": ({ construct }) =>
    `"${construct}" は id の直後にラベルを置けません。ブロック内に label "..." を書いてください`,
  "diagnostic.positionalLabelDeprecated.message": ({ construct }) =>
    `"${construct}" の id 直後のラベル記法は非推奨です。ブロック内に label "..." を書いてください（"karasu fmt" が書き換えます）`,
  "diagnostic.duplicateTeamId.message": ({ teamId }) => `team id "${teamId}" が重複しています`,
  "diagnostic.nodeIdMultipleLocations.message": ({ nodeId }) =>
    `ノード id "${nodeId}" が複数箇所に出現しています。ナビゲーションには最初のパスが使われます`,
  "diagnostic.duplicateNodeIdParent.message": ({ nodeId }) =>
    `同じ親の下でノード id "${nodeId}" が重複しています`,
  "diagnostic.ownsTargetNotFound.message": ({ ownedId }) =>
    `"owns" で参照されている "${ownedId}" が system 階層内に見つかりません`,
  "diagnostic.duplicateEdgeId.message": ({ authorId }) =>
    `エッジ id "#${authorId}" が重複しています。エッジ id は system 内で一意である必要があります`,
  "diagnostic.ambiguousEdgeBase.message": ({ fromId, toId, arrow }) =>
    `複数のエッジが base "${fromId}${arrow}${toId}" を共有しており、識別する #<id> がありません。これらのエッジは per-edge style selector では一致しません`,
  "diagnostic.styleTokenTypeMismatch.message": ({ expected, got, value }) =>
    `${expected} を期待しましたが ${got} ("${value}") が見つかりました`,
  "diagnostic.expectedStylePropertyName.message": ({ got }) =>
    `プロパティ名を期待しましたが ${got} が見つかりました`,
  "diagnostic.expectedSemicolonBetweenProperties.message": ({ property }) =>
    `"${property}" の後に ";" を期待しましたが "," が見つかりました。プロパティはセミコロンで区切ってください`,
  "diagnostic.unknownEdgeSelectorAttribute.message": ({ attribute }) =>
    `エッジセレクタの属性 "${attribute}" は不明です。"from" と "to" のみ指定できます（例: edge[from=Hub]）`,
  "diagnostic.styleInvalidEnumValue.message": ({ property, value, allowed }) =>
    `"${property}" の値 "${value}" は無効です。有効な値: ${allowed.join(", ")}`,
  "diagnostic.styleInvalidHexColor.message": ({ property, value }) =>
    `"${property}" の hex color "${value}" は無効です（#RGB / #RGBA / #RRGGBB / #RRGGBBAA を期待）`,
  "diagnostic.styleMissingLengthUnit.message": ({ property, value, allowedUnits }) =>
    `"${property}" の値 "${value}" に単位がありません。期待する単位: ${allowedUnits.join(", ")}`,
  "diagnostic.styleInvalidLengthUnit.message": ({ property, value, unit, allowedUnits }) =>
    `"${property}" の値 "${value}" の単位 "${unit}" は無効です。許容: ${allowedUnits.join(", ")}`,
  "diagnostic.styleOutOfRange.message": ({ property, value, min, max }) =>
    `"${property}" の値 ${value} は範囲外です ${formatRange(min, max)}`,
  "diagnostic.styleUnknownProperty.message": ({ property }) =>
    `未知のスタイルプロパティ "${property}"`,
  "diagnostic.circularImport.message": ({ filePath }) =>
    `循環インポートを検出しました: ${filePath}`,
  "diagnostic.fileNotFound.message": ({ filePath }) => `ファイルが見つかりません: ${filePath}`,
  "diagnostic.directoryNotFound.message": ({ dirPath }) =>
    `ディレクトリが見つかりません: ${dirPath}`,
  "diagnostic.serviceOutsideSystem.message": ({ serviceId }) =>
    `"${serviceId}" は system ブロックの外で宣言されています — system への所属が曖昧です`,
  "diagnostic.duplicateNodeInSystem.message": ({ nodeId, systemId }) =>
    `system "${systemId}" 内でノード ID "${nodeId}" が重複しています`,
  "diagnostic.duplicateNodeInDeploy.message": ({ nodeId, deployId }) =>
    `deploy ブロック "${deployId}" 内でノード ID "${nodeId}" が重複しています`,
  "diagnostic.duplicateTeamInOrganization.message": ({ teamId, orgId }) =>
    `organization "${orgId}" 内で team ID "${teamId}" が重複しています`,
  "diagnostic.systemPropertyConflict.message": ({
    blockKind,
    blockId,
    property,
    chosen,
    ignored,
  }) =>
    `${blockKind} "${blockId}" の ${property} が衝突しています — "${chosen}" を採用、"${ignored}" を無視`,
  "diagnostic.infraLeafRedeclaredSilently.message": ({ leafKind, leafId, infraKind, infraId }) =>
    `${leafKind} "${leafId}" は ${infraKind} "${infraId}" 内で複数回宣言されています（最初の宣言を採用）`,
  "diagnostic.infraRedeclaredAcrossFiles.message": ({ blockKind, blockId }) =>
    `${blockKind} "${blockId}" は複数のファイルで宣言されています（merge 済み）`,
  "diagnostic.importIdNotFound.message": ({ id, path }) =>
    `インポートされた識別子 "${id}" が ${path} に見つかりません`,
  "diagnostic.importPathNotFound.message": ({
    path,
    failedAt,
    failedSegment,
    importPath,
    lastResolvedId,
  }) =>
    lastResolvedId
      ? `import path "${path}" のセグメント "${failedSegment}" (#${failedAt}) を解決できません: "${lastResolvedId}" の下にその id の子は存在しません`
      : `import path "${path}" のセグメント "${failedSegment}" (#${failedAt}) を解決できません: ${importPath} に該当 id を持つ top-level system はありません`,
  "diagnostic.circularStyleImport.message": ({ filePath }) =>
    `循環スタイルインポートを検出しました: ${filePath}`,
  "diagnostic.styleFileNotFound.message": ({ filePath }) =>
    `スタイルファイルが見つかりません: ${filePath}`,
  "diagnostic.appProjectCompileError.message": "プロジェクトのコンパイル中にエラーが発生しました",
  "diagnostic.appOrgParseError.message": "パース中にエラーが発生しました",
};
