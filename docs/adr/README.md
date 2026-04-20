# ADR Index

karasu の設計判断の経緯 (Architecture Decision Record) を記録する。
個々の ADR は `YYYYMMDD-NN-<slug>.md` の形式で日付順に並び、
この README はそれらをトピック別 / ステータス別に俯瞰するためのインデックスである。

新しい ADR を追加した際は、このインデックスにもエントリを追加すること。
判断の経緯を辿る際は、まず該当するトピックを探し、関連する複数の ADR を時系列で読むと意図が掴みやすい。

---

## トピック別

各トピック内は時系列順に並ぶ。1 本の ADR が複数のトピックに関わる場合は、
最も中心的な関心事に対応するトピックにのみ掲載している。

### コア概念 — 論理・物理・組織の三面構造

karasu が何を表現するか、その根幹の設計判断。

- [ADR-20260312-02](20260312-02-karasu-naming.md) — ツール名「karasu」の採用
- [ADR-20260312-03](20260312-03-logical-physical-separation.md) — 論理構造と物理構造の分離
- [ADR-20260323-03](20260323-03-organization-diagram.md) — Organization 図（organization / team / member）の追加
- [ADR-20260404-10](20260404-10-org-tree-view.md) — Org Tree View — 組織階層の左→右ツリー俯瞰図

### パーサー / 構文 / AST / フォーマッター

`.krs` テキストから AST を構築し、コメントを保ったまま書き換えるまでの層。

- [ADR-20260320-02](20260320-02-ast-restructure-discriminated-union.md) — AST 再構成 — Discriminated Union とプロパティブロック
- [ADR-20260323-01](20260323-01-yaml-style-syntax-cancelled.md) — YAML スタイル構文移行の見送り
- [ADR-20260323-04](20260323-04-required-id-label-as-property.md) — ID 必須化と `label` のプロパティ化
- [ADR-20260401-03](20260401-03-compile-api-unification.md) — `compile()` API 統一 — Discriminated Union による戻り値型
- [ADR-20260405-03](20260405-03-wildcard-import-two-pass-resolution.md) — ワイルドカードインポートと 2 パス解決の採用
- [ADR-20260409-05](20260409-05-directory-import.md) — Directory Import — `import "dir/"` 構文
- [ADR-20260409-06](20260409-06-named-import-toplevel-service.md) — トップレベル service の Named Import
- [ADR-20260410-02](20260410-02-krs-formatter.md) — `.krs` フォーマッター — トークン列ベースでコメント保持
- [ADR-20260410-03](20260410-03-structural-krs-patch.md) — 構造的 `.krs` パッチ — ノード ID ベースの `append` / `replace` / `remove`
- [ADR-20260412-04](20260412-04-implicit-edge-source-shorthand.md) — ブロック内エッジの暗黙 source 簡略記法

### リゾルバ / 警告 / 検証

AST を意味論レベルで解釈し、モデルの健全性を検査する層。

- [ADR-20260401-06](20260401-06-domain-drift-detection.md) — Domain Drift Detection — Scope and Detection Key
- [ADR-20260405-05](20260405-05-database-as-first-class-node.md) — `database` / `queue` / `storage` を system 直下のファーストクラスノードに昇格
- [ADR-20260405-06](20260405-06-cyclic-dependency-detection.md) — 循環依存の検出と `KrsEdge.cyclic` フラグによる視覚化
- [ADR-20260411-02](20260411-02-deprecated-domain-migration-coexistence.md) — 移行期における重複ドメイン ID の共存を `@deprecated` + `@migration_target` で許容する

### レンダラー / レイアウト / SVG / アイコン

モデルから SVG を生成する層。レイアウトエンジン、アイコン表現、エクスポート戦略を含む。

- [ADR-20260316-01](20260316-01-svg-icon-file-import.md) — SVG アイコンファイルの外部インポート方式
- [ADR-20260317-01](20260317-01-two-layer-rendering.md) — 2 レイヤレンダリングとドリルダウンナビゲーション
- [ADR-20260320-01](20260320-01-interactive-svg-rendering.md) — インタラクティブ SVG レンダリングと NodeDetailPanel
- [ADR-20260327-01](20260327-01-deployment-diagram-design.md) — Deployment Diagram Design Decisions
- [ADR-20260328-02](20260328-02-svg-export-two-phase.md) — SVG エクスポートの 2 フェーズ実装（現在ビュー + Full View 単一ファイル）
- [ADR-20260328-03](20260328-03-icon-mode.md) — アイコンモード — SVG アイコンによるノード表示切り替え
- [ADR-20260329-02](20260329-02-preview-column-svg-export-refactor.md) — `KarasuPreviewColumn` からの SVG エクスポート責務分離
- [ADR-20260401-02](20260401-02-all-diagrams-bundled-svg.md) — 全ビュー統合バンドル SVG（`buildAllViewsSvg`）
- [ADR-20260404-03](20260404-03-png-export-not-adopted.md) — PNG エクスポートは実装しない
- [ADR-20260405-07](20260405-07-ghost-system-rendering.md) — クロスシステム参照の Ghost System レンダリング
- [ADR-20260407-02](20260407-02-resource-shape-and-infra-icon-mode.md) — resource shape 自動推論とインフラノード Icon Mode 対応
- [ADR-20260408-02](20260408-02-deploy-layout-hierarchical-dag.md) — Deploy 図レイアウト — 階層 DAG レイアウト（Longest Path Layering）
- [ADR-20260409-04](20260409-04-barycenter-layer-ordering.md) — 同レイヤー内コンテナ順序の Barycenter ヒューリスティックによる最適化
- [ADR-20260411-01](20260411-01-arch-layout-barycenter-wrap-scope-reduction.md) — Architecture レイアウトへの Barycenter + Sub-row wrap は適用せず共通ユーティリティのみ抽出
- [ADR-20260420-01](20260420-01-drawio-export.md) — draw.io (mxGraph XML) Export — a Layout Escape Hatch

### エッジ

ノード間の関係を表現するエッジの意味論・視覚表現・自動推論。

- [ADR-20260404-09](20260404-09-cross-system-service-references.md) — クロスシステムサービス参照 — ドット記法（`SystemId.ServiceId`）
- [ADR-20260410-01](20260410-01-domain-to-domain-edges-implicit-tag.md) — Domain 間エッジと `[implicit]` 自動タグによる暗黙サービスエッジ
- [ADR-20260411-05](20260411-05-ghost-domain-edges.md) — サービスドリルダウンビューでの Ghost Domain エッジ表示
- [ADR-20260413-02](20260413-02-implicit-edge-sync-async-distinction.md) — Implicit エッジにおける sync/async の視覚的区別

### スタイリング / タグ / アノテーション

`.krs.style` とビルトインスタイル、タグ / アノテーションの伝播ルール。

- [ADR-20260312-04](20260312-04-css-inspired-styling.md) — CSS インスパイアのスタイリングシステム
- [ADR-20260322-01](20260322-01-builtin-style-and-reference.md) — ビルトインスタイルの一元化と構造化リファレンス
- [ADR-20260328-01](20260328-01-unified-style-pipeline.md) — スタイル解決パイプラインの一元化
- [ADR-20260415-01](20260415-01-inherit-service-annotations.md) — 親サービスのアノテーションを子ノードに継承する

### ドリルダウン / ナビゲーション

URL hash・ブラウザ履歴・マルチファイル間のナビゲーションと、ハイライト復元の仕組み。

- [ADR-20260330-04](20260330-04-permanent-link.md) — Permanent Link — `nodePathIndex` と URL hash の 2 フェーズ実装
- [ADR-20260401-07](20260401-07-node-click-ux.md) — ノードクリック UX — ドリルダウンと Cmd/Ctrl+Click エディタジャンプ
- [ADR-20260403-01](20260403-01-drill-down-adapter-hierarchy-node.md) — Drill-down 収集ロジック統一 — `HierarchyNode` 型 + 高階関数
- [ADR-20260404-05](20260404-05-browser-history-navigation.md) — ブラウザ履歴ナビゲーション — URL hash による drill-down 同期
- [ADR-20260405-08](20260405-08-project-url-navigation.md) — プロジェクト URL ナビゲーション — `/projects/<uuid>` パスネーム方式
- [ADR-20260409-03](20260409-03-atomic-highlight-on-cross-navigation.md) — クロスナビゲーション時のアトミックなハイライト適用
- [ADR-20260409-07](20260409-07-cross-file-navigation.md) — マルチファイルプロジェクトでのクロスファイルナビゲーション
- [ADR-20260411-03](20260411-03-hash-highlight-restoration.md) — ブラウザ履歴でのハイライト復元 — hash コロン拡張

### App UI — Editor / Toolbar / Panels

`packages/app` のレイアウト、ツールバー、Editor 診断、パネル配置に関する判断。

- [ADR-20260323-02](20260323-02-toolbar-icon-label.md) — ツールバーボタンはアイコン + テキストラベル必須
- [ADR-20260326-02](20260326-02-memory-project-mode-unification.md) — MemoryMode と ProjectMode の統一 — Reducer + `KarasuPreviewColumn`
- [ADR-20260326-03](20260326-03-editor-diagnostics-display.md) — Editor 診断表示 — Monaco マーカー + Preview エラーオーバーレイ
- [ADR-20260330-02](20260330-02-toolbar-button-display-rules.md) — Toolbar Button Display Rules
- [ADR-20260404-04](20260404-04-system-selector-not-adopted.md) — system セレクタ UI を採用しない
- [ADR-20260405-02](20260405-02-toolbar-btn-actionable.md) — Toolbar Button Actionable Modifier Class
- [ADR-20260405-04](20260405-04-reference-panel-diagram-context.md) — Reference パネルの図種別コンテキスト対応
- [ADR-20260407-03](20260407-03-project-selector-operations.md) — ProjectSelector の Rename 操作 — インライン入力欄パターン
- [ADR-20260408-03](20260408-03-project-mode-initial-content.md) — ProjectMode 初期コンテンツ — `examples/ec-platform` からの自動生成
- [ADR-20260411-04](20260411-04-edit-area-and-sidebar-toggle-relocation.md) — `EditArea` コンポーネント新設と sidebar-toggle のサイドバーエリアへの移動
- [ADR-20260411-08](20260411-08-edit-pane-toolbar.md) — EditPaneToolbar — LeftPane アクションボタンの専用ツールバーへの集約
- [ADR-20260413-02](20260413-02-single-detail-panel-at-a-time.md) — DetailPanel は常に 1 つだけ表示する
- [ADR-20260419-02](20260419-02-rename-preview-column.md) — `KarasuPreviewColumn` を `PreviewColumn` にリネーム

### プロジェクト / マルチファイル / Import-Export

ファイルシステム抽象、OPFS、プロジェクトの ZIP Import/Export。

- [ADR-20260317-02](20260317-02-project-and-filesystem.md) — プロジェクトとファイルシステム抽象化 — `FileSystemProvider` + OPFS
- [ADR-20260411-06](20260411-06-export-project-zip.md) — Export Project as ZIP — `fflate` による OPFS エクスポート
- [ADR-20260412-03](20260412-03-import-project-zip.md) — Import Project from ZIP — `fflate` 再利用 + トップレベル除去

### Chat / AI

Chat パネル、BYOK、構造化インタビュー、AI アシスト機能の設計。

- [ADR-20260407-04](20260407-04-cloudflare-deployment-and-byok-ai.md) — Cloudflare Pages デプロイ基盤と BYOK AI 連携
- [ADR-20260409-01](20260409-01-chat-ui-phase2-byok-ai-integration.md) — Chat UI Phase 2 — BYOK + AI 統合の実装方針
- [ADR-20260409-08](20260409-08-chat-ui-panel.md) — Chat UI Panel — 全体アーキテクチャと Phase 1 レイアウト
- [ADR-20260412-01](20260412-01-chat-ui-phase3-structured-interview.md) — Chat UI Phase 3 — 構造化インタビュープロンプトの実装方針
- [ADR-20260412-05](20260412-05-playwright-with-ai-visual-review.md) — Playwright with AI-assisted visual review
- [ADR-20260418-01](20260418-01-chat-prompt-i18n.md) — Chat system prompt i18n — locale detection and prompt selection

### CLI

`karasu` CLI のサブコマンド設計。

- [ADR-20260328-04](20260328-04-cli-serve-mode.md) — CLI `karasu serve` モード — ローカル `.krs` のリアルタイムプレビュー
- [ADR-20260404-08](20260404-08-cli-render-command.md) — CLI `karasu render` コマンド
- [ADR-20260409-02](20260409-02-cli-translate-command.md) — CLI `karasu translate` コマンドと複数 realizes 対応
- [ADR-20260411-07](20260411-07-translate-apply-option.md) — `karasu apply` サブコマンド — stdin + `applyKrsPatch` を core に移動
- [ADR-20260412-02](20260412-02-cli-mutation-subcommands.md) — CLI 変更系サブコマンド — `karasu remove` / `append` / `insert`

### VS Code / LSP

VS Code 拡張と LSP の段階的実装。

- [ADR-20260330-05](20260330-05-vscode-extension-lsp-first.md) — VSCode 拡張 — LSP-first アーキテクチャと段階的フェーズ計画
- [ADR-20260401-04](20260401-04-vscode-phase3-webview-architecture.md) — VSCode Phase 3 — 独立 HTML Webview アーキテクチャ
- [ADR-20260401-05](20260401-05-vscode-phase3-5-drilldown.md) — VSCode Phase 3.5 — Webview ドリルダウンナビゲーション
- [ADR-20260404-07](20260404-07-vscode-icon-mode-toggle.md) — VSCode プレビュー Icon Mode トグル — Extension Host 管理 + postMessage

### テスト戦略

- [ADR-20260324-01](20260324-01-manual-qa-over-e2e.md) — E2E テストより QA 手動確認を優先する
- [ADR-20260325-01](20260325-01-testing-library-react.md) — コンポーネントテストに `@testing-library/react` を採用する
- [ADR-20260326-04](20260326-04-app-testing-strategy.md) — `packages/app` のテスト戦略 — `@testing-library/react` + renderHook + ARIA
- [ADR-20260330-03](20260330-03-vitest-placement-in-monorepo.md) — vitest Placement in Monorepo — Workspace Delegation over Root Install

### ビルド / CI / インフラ / 依存関係

モノレポ構成、依存更新、デプロイ、CI ワークフローに関する判断。

- [ADR-20260312-01](20260312-01-monorepo.md) — モノレポ構成の採用
- [ADR-20260326-01](20260326-01-merge-queue.md) — Main Branch Health Strategy
- [ADR-20260329-01](20260329-01-dependabot.md) — Dependency Update Automation with Dependabot
- [ADR-20260330-01](20260330-01-update-dependencies-20260330.md) — Major Dependency Updates — March 2026
- [ADR-20260331-01](20260331-01-update-dependencies-20260331.md) — Dependency Updates — 2026-03-31
- [ADR-20260401-01](20260401-01-marked-and-chokidar.md) — Adopt marked for Markdown rendering and chokidar for file watching
- [ADR-20260404-01](20260404-01-bun-not-adopted.md) — Bun への移行は行わない
- [ADR-20260404-02](20260404-02-claude-session-rename-not-adopted.md) — start-dev スキルでの Claude セッションリネームは採用しない
- [ADR-20260404-06](20260404-06-github-markdown-render-service.md) — GitHub Markdown レンダリングサービス — `serve.ts` の `/render` エンドポイント
- [ADR-20260405-01](20260405-01-npm-package-scope-rename.md) — npm パッケージスコープを `@karasu-tools/*` に変更
- [ADR-20260407-01](20260407-01-update-dependencies-20260407.md) — Dependency Updates — 2026-04-07
- [ADR-20260408-01](20260408-01-trunk-based-development.md) — Trunk-Based Development with Release Toggles
- [ADR-20260413-01](20260413-01-preview-workflow-no-label-gating.md) — Preview workflow はラベル駆動をやめ path filter で制御する
- [ADR-20260414-01](20260414-01-dependabot-batch-2026-04-14.md) — Dependabot Batch Triage (2026-04-14)

---

## ステータス別

本 PR では superseded 関係の網羅的な整理は行わず、**明確に不採用** と判断された ADR のみを
別ビューとして抜き出している。未掲載の ADR はすべて accepted として扱う。
superseded 関係の棚卸しや、各 ADR への status フロントマターの追加は follow-up work。

### Not adopted

意識的に「採用しない」と結論づけた ADR。将来同じ議論が再燃したときに、
過去の検討経緯を辿れるようにするために残している。

- [ADR-20260323-01](20260323-01-yaml-style-syntax-cancelled.md) — YAML スタイル構文移行の見送り
- [ADR-20260404-01](20260404-01-bun-not-adopted.md) — Bun への移行は行わない
- [ADR-20260404-02](20260404-02-claude-session-rename-not-adopted.md) — start-dev スキルでの Claude セッションリネームは採用しない
- [ADR-20260404-03](20260404-03-png-export-not-adopted.md) — PNG エクスポートは実装しない
- [ADR-20260404-04](20260404-04-system-selector-not-adopted.md) — system セレクタ UI を採用しない
