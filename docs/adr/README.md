# ADR Index

karasu の設計判断の経緯 (Architecture Decision Record) を記録する。
個々の ADR は `<n>-<slug>.md` の形式（`<n>` は起点の GitHub Issue 番号、無ければ PR 番号 — [#2083](https://github.com/kompiro/karasu/issues/2083)）で置かれ、
この README はそれらをトピック別 / ステータス別に俯瞰するためのインデックスである。

新しい ADR を追加した際は、このインデックスにもエントリを追加すること。
判断の経緯を辿る際は、まず該当するトピックを探し、関連する複数の ADR を時系列で読むと意図が掴みやすい。

---

## トピック別

各トピック内は時系列順に並ぶ。1 本の ADR が複数のトピックに関わる場合は、
最も中心的な関心事に対応するトピックにのみ掲載している。

### コア概念 — 論理・物理・組織の三面構造

> Derives from (`core-concepts`): [concepts.md → Three-dimensional structure](../concepts.md#three-dimensional-structure)

karasu が何を表現するか、その根幹の設計判断。

- [ADR-9002](9002-karasu-naming.md) — ツール名「karasu」の採用
- [ADR-9003](9003-logical-physical-separation.md) — 論理構造と物理構造の分離
- [ADR-14](14-organization-diagram.md) — Organization 図（organization / team / member）の追加
- [ADR-309](309-org-tree-view.md) — Org Tree View — 組織階層の左→右ツリー俯瞰図
- [ADR-823](823-client-mcp-modeling.md) — `client` kind 導入 — `user → client → service` のアクセス経路と MCP / 外部依存のモデル化
- [ADR-834](834-security-modeling-stance.md) — セキュリティ／脅威モデリングは karasu の語彙に取り込まず companion document に委ねる
- [ADR-832](832-no-runtime-authz-modeling.md) — 実行時認可（usecase レベルの authz）は karasu の語彙に取り込まない
- [ADR-1386](1386-style-prescription-stance.md) — karasu はスタイル流派を規定せず、流派が smell と呼ぶ構造は `info` 診断で事実通知する

### パーサー / 構文 / AST / フォーマッター

> Derives from (`parser`): [concepts.md → Three-dimensional structure](../concepts.md#three-dimensional-structure)

`.krs` テキストから AST を構築し、コメントを保ったまま書き換えるまでの層。

- [ADR-9008](9008-ast-restructure-discriminated-union.md) — AST 再構成 — Discriminated Union とプロパティブロック
- [ADR-7](7-yaml-style-syntax-cancelled.md) — YAML スタイル構文移行の見送り
- [ADR-19](19-required-id-label-as-property.md) — ID 必須化と `label` のプロパティ化
- [ADR-211](211-compile-api-unification.md) — `compile()` API 統一 — Discriminated Union による戻り値型
- [ADR-281](281-wildcard-import-two-pass-resolution.md) — ワイルドカードインポートと 2 パス解決の採用
- [ADR-292](292-directory-import.md) — Directory Import — `import "dir/"` 構文
- [ADR-412](412-named-import-toplevel-service.md) — トップレベル service の Named Import
- [ADR-438](438-krs-formatter.md) — `.krs` フォーマッター — トークン列ベースでコメント保持
- [ADR-442](442-structural-krs-patch.md) — 構造的 `.krs` パッチ — ノード ID ベースの `append` / `replace` / `remove`
- [ADR-496](496-implicit-edge-source-shorthand.md) — ブロック内エッジの暗黙 source 簡略記法
- [ADR-927](927-import-system-nested.md) — system にネストした service / domain の Named Import は明示的な path 構文で取り込む
- [ADR-2076](2076-formatter-top-level-exhaustiveness.md) — formatter の top-level 網羅は手で列挙せず `KrsFile` から導出して型と test で強制する
- [ADR-2087](2087-escape-emitted-string-values.md) — 出力する文字列「値」を lexer のデコード規則と 1:1 で escape し、表現不能な値には fallback を置く

### リゾルバ / 警告 / 検証

> Derives from (`resolver`): [concepts.md → Domain dispersal detection](../concepts.md#domain-dispersal-detection)

AST を意味論レベルで解釈し、モデルの健全性を検査する層。

- [ADR-237](237-domain-drift-detection.md) — Domain Drift Detection — Scope and Detection Key
- [ADR-316](316-database-as-first-class-node.md) — `database` / `queue` / `storage` を system 直下のファーストクラスノードに昇格
- [ADR-287](287-cyclic-dependency-detection.md) — 循環依存の検出と `KrsEdge.cyclic` フラグによる視覚化
- [ADR-477](477-deprecated-domain-migration-coexistence.md) — 移行期における重複ドメイン ID の共存を `@deprecated` + `@migration_target` で許容する

### レンダラー / レイアウト / SVG / アイコン

> Derives from (`renderer`): [concepts.md → Drill-down as the way to understand architecture](../concepts.md#drill-down)

モデルから SVG を生成する層。レイアウトエンジン、アイコン表現、エクスポート戦略を含む。

- [ADR-9005](9005-svg-icon-file-import.md) — SVG アイコンファイルの外部インポート方式
- [ADR-21](21-two-layer-rendering.md) — 2 レイヤレンダリングとドリルダウンナビゲーション
- [ADR-9007](9007-interactive-svg-rendering.md) — インタラクティブ SVG レンダリングと NodeDetailPanel
- [ADR-29](29-deployment-diagram-design.md) — Deployment Diagram Design Decisions
- [ADR-22](22-svg-export-two-phase.md) — SVG エクスポートの 2 フェーズ実装（現在ビュー + Full View 単一ファイル）
- [ADR-30](30-icon-mode.md) — アイコンモード — SVG アイコンによるノード表示切り替え
- [ADR-131](131-preview-column-svg-export-refactor.md) — `KarasuPreviewColumn` からの SVG エクスポート責務分離
- [ADR-9015](9015-all-diagrams-bundled-svg.md) — 全ビュー統合バンドル SVG（`buildAllViewsSvg`）
- [ADR-105](105-png-export-not-adopted.md) — PNG エクスポートは実装しない
- [ADR-328](328-ghost-system-rendering.md) — クロスシステム参照の Ghost System レンダリング
- [ADR-351](351-resource-shape-and-infra-icon-mode.md) — resource shape 自動推論とインフラノード Icon Mode 対応
- [ADR-392](392-deploy-layout-hierarchical-dag.md) — Deploy 図レイアウト — 階層 DAG レイアウト（Longest Path Layering）
- [ADR-395](395-barycenter-layer-ordering.md) — 同レイヤー内コンテナ順序の Barycenter ヒューリスティックによる最適化
- [ADR-458](458-arch-layout-barycenter-wrap-scope-reduction.md) — Architecture レイアウトへの Barycenter + Sub-row wrap は適用せず共通ユーティリティのみ抽出
- [ADR-649](649-drawio-export.md) — draw.io (mxGraph XML) Export — a Layout Escape Hatch
- [ADR-681](681-top-level-service-rendering.md) — トップレベル service / domain を `(Unassigned)` 擬似システムで描画する
- [ADR-702](702-top-level-infra-rendering.md) — トップレベル infra ブロック（database / queue / storage）を `(Unassigned)` で描画する
- [ADR-974](974-infra-row-by-deepest-consumer.md) — Infra/external ノードを最深 consumer の直下行に引き上げる

### エッジ

> Derives from (`edges`): [concepts.md → Edges](../concepts.md#edges)

ノード間の関係を表現するエッジの意味論・視覚表現・自動推論。

- [ADR-285](285-cross-system-service-references.md) — クロスシステムサービス参照 — ドット記法（`SystemId.ServiceId`）
- [ADR-445](445-domain-to-domain-edges-implicit-tag.md) — Domain 間エッジと `[implicit]` 自動タグによる暗黙サービスエッジ
- [ADR-460](460-ghost-domain-edges.md) — サービスドリルダウンビューでの Ghost Domain エッジ表示
- [ADR-510](510-implicit-edge-sync-async-distinction.md) — Implicit エッジにおける sync/async の視覚的区別
- [ADR-463](463-implicit-edge-detail-panel.md) — 集約された暗黙エッジの詳細パネル — SVG 属性埋め込み方式
- [ADR-968](968-orthogonal-edge-routing-skip-layer.md) — Skip-layer エッジの直交チャネルルーティング

### スタイリング / タグ / アノテーション

> Derives from (`styling`): [concepts.md → What karasu visualizes vs. what it doesn't prescribe](../concepts.md#visualizes-vs-prescribes)

`.krs.style` とビルトインスタイル、タグ / アノテーションの伝播ルール。

- [ADR-9004](9004-css-inspired-styling.md) — CSS インスパイアのスタイリングシステム
- [ADR-8](8-builtin-style-and-reference.md) — ビルトインスタイルの一元化と構造化リファレンス
- [ADR-108](108-unified-style-pipeline.md) — スタイル解決パイプラインの一元化
- [ADR-517](517-inherit-service-annotations.md) — 親サービスのアノテーションを子ノードに継承する
- [ADR-999](999-legend-in-use-fallback.md) — 凡例 ref のフォールバック swatch（in-use なら描画する）

### ドリルダウン / ナビゲーション

> Derives from (`navigation`): [concepts.md → Drill-down as the way to understand architecture](../concepts.md#drill-down)

URL hash・ブラウザ履歴・マルチファイル間のナビゲーションと、ハイライト復元の仕組み。

- [ADR-110](110-permanent-link.md) — Permanent Link — `nodePathIndex` と URL hash の 2 フェーズ実装
- [ADR-177](177-node-click-ux.md) — ノードクリック UX — ドリルダウンと Cmd/Ctrl+Click エディタジャンプ
- [ADR-226](226-drill-down-adapter-hierarchy-node.md) — Drill-down 収集ロジック統一 — `HierarchyNode` 型 + 高階関数
- [ADR-278](278-browser-history-navigation.md) — ブラウザ履歴ナビゲーション — URL hash による drill-down 同期
- [ADR-321](321-project-url-navigation.md) — プロジェクト URL ナビゲーション — `/projects/<uuid>` パスネーム方式
- [ADR-422](422-atomic-highlight-on-cross-navigation.md) — クロスナビゲーション時のアトミックなハイライト適用
- [ADR-429](429-cross-file-navigation.md) — マルチファイルプロジェクトでのクロスファイルナビゲーション
- [ADR-425](425-hash-highlight-restoration.md) — ブラウザ履歴でのハイライト復元 — hash コロン拡張
- [ADR-1094](1094-active-view-url-hash.md) — ActiveView を追加するときは URL hash 対応もセットで行う — チェックリスト化

### App UI — Editor / Toolbar / Panels

> Derives from (`app-ui`): N/A — implementation topic, no originating concept section

`packages/app` のレイアウト、ツールバー、Editor 診断、パネル配置に関する判断。

- [ADR-9009](9009-toolbar-icon-label.md) — ツールバーボタンはアイコン + テキストラベル必須
- [ADR-9010](9010-memory-project-mode-unification.md) — MemoryMode と ProjectMode の統一 — Reducer + `KarasuPreviewColumn`
- [ADR-9011](9011-editor-diagnostics-display.md) — Editor 診断表示 — Monaco マーカー + Preview エラーオーバーレイ
- [ADR-164](164-toolbar-button-display-rules.md) — Toolbar Button Display Rules
- [ADR-104](104-system-selector-not-adopted.md) — system セレクタ UI を採用しない
- [ADR-307](307-toolbar-btn-actionable.md) — Toolbar Button Actionable Modifier Class
- [ADR-9016](9016-reference-panel-diagram-context.md) — Reference パネルの図種別コンテキスト対応
- [ADR-357](357-project-selector-operations.md) — ProjectSelector の Rename 操作 — インライン入力欄パターン
- [ADR-9018](9018-project-mode-initial-content.md) — ProjectMode 初期コンテンツ — `examples/ec-platform` からの自動生成
- [ADR-465](465-edit-area-and-sidebar-toggle-relocation.md) — `EditArea` コンポーネント新設と sidebar-toggle のサイドバーエリアへの移動
- [ADR-455](455-edit-pane-toolbar.md) — EditPaneToolbar — LeftPane アクションボタンの専用ツールバーへの集約
- [ADR-607](607-single-detail-panel-at-a-time.md) — DetailPanel は常に 1 つだけ表示する
- [ADR-706](706-rename-preview-column.md) — `KarasuPreviewColumn` を `PreviewColumn` にリネーム
- [ADR-739](739-diff-paste-input-ui.md) — Diff ペースト入力の UI 配置とストレージ方式（FileTree ヘッダ + モーダル + 隠しファイル）

### プロジェクト / マルチファイル / Import-Export

> Derives from (`project`): [concepts.md → Three-dimensional structure](../concepts.md#three-dimensional-structure)

ファイルシステム抽象、OPFS、プロジェクトの ZIP Import/Export。

- [ADR-9006](9006-project-and-filesystem.md) — プロジェクトとファイルシステム抽象化 — `FileSystemProvider` + OPFS
- [ADR-461](461-export-project-zip.md) — Export Project as ZIP — `fflate` による OPFS エクスポート
- [ADR-462](462-import-project-zip.md) — Import Project from ZIP — `fflate` 再利用 + トップレベル除去
- [ADR-1990](1990-karasu-nest-pivot-server-reverse.md) — karasu-nest ピボット — GitHub App による server-side reverse の hosted サービス化（ADR-1783 を supersede）
- [ADR-2262](2262-nest-intake-and-completion.md) — karasu-nest の受付と完了通知 — installer 起動 + PR 還元、reader は無通知のリクエスト受付（ADR-1990 を refine）

### Chat / AI

> Derives from (`chat-ai`): [concepts.md → karasu and AI](../concepts.md#karasu-and-ai)

Chat パネル、BYOK、構造化インタビュー、AI アシスト機能の設計。

- [ADR-9017](9017-cloudflare-deployment-and-byok-ai.md) — Cloudflare Pages デプロイ基盤と BYOK AI 連携
- [ADR-419](419-chat-ui-phase2-byok-ai-integration.md) — Chat UI Phase 2 — BYOK + AI 統合の実装方針
- [ADR-362](362-chat-ui-panel.md) — Chat UI Panel — 全体アーキテクチャと Phase 1 レイアウト
- [ADR-420](420-chat-ui-phase3-structured-interview.md) — Chat UI Phase 3 — 構造化インタビュープロンプトの実装方針
- [ADR-529](529-playwright-with-ai-visual-review.md) — Playwright with AI-assisted visual review
- [ADR-639](639-chat-prompt-i18n.md) — Chat system prompt i18n — locale detection and prompt selection
- [ADR-34](34-i18n-rollout.md) — i18n Rollout — English / Japanese UI, Diagnostics, and Chat（#34 全体）
- [ADR-363](363-chat-ui-design-review.md) — Chat UI AI 設計レビュー — プロンプト駆動 + トリガー二系統
- [ADR-2077](2077-reverse-bc-granularity.md) — reverse harness の分解粒度 — bounded-context 既定と構造 grounding の不採用

### CLI

> Derives from (`cli`): N/A — implementation topic, no originating concept section

`karasu` CLI のサブコマンド設計。

- [ADR-9013](9013-cli-serve-mode.md) — CLI `karasu serve` モード — ローカル `.krs` のリアルタイムプレビュー
- [ADR-121](121-cli-render-command.md) — CLI `karasu render` コマンド
- [ADR-355](355-cli-translate-command.md) — CLI `karasu translate` コマンドと複数 realizes 対応
- [ADR-464](464-translate-apply-option.md) — `karasu apply` サブコマンド — stdin + `applyKrsPatch` を core に移動
- [ADR-469](469-cli-mutation-subcommands.md) — CLI 変更系サブコマンド — `karasu remove` / `append` / `insert`
- [ADR-1020](1020-karasu-diff-cli.md) — `karasu diff` CLI と diff SVG の self-contained スタイル化
- [ADR-1025](1025-bundled-all-views-diff.md) — `karasu diff` の bundled all-views 出力（既定で 3 view を 1 SVG に束ねる）

### VS Code / LSP

> Derives from (`vscode`): N/A — implementation topic, no originating concept section

VS Code 拡張と LSP の段階的実装。

- [ADR-9014](9014-vscode-extension-lsp-first.md) — VSCode 拡張 — LSP-first アーキテクチャと段階的フェーズ計画
- [ADR-176](176-vscode-phase3-webview-architecture.md) — VSCode Phase 3 — 独立 HTML Webview アーキテクチャ
- [ADR-218](218-vscode-phase3-5-drilldown.md) — VSCode Phase 3.5 — Webview ドリルダウンナビゲーション
- [ADR-299](299-vscode-icon-mode-toggle.md) — VSCode プレビュー Icon Mode トグル — Extension Host 管理 + postMessage

### テスト戦略

> Derives from (`testing`): N/A — process topic, no originating concept section

- [ADR-33](33-manual-qa-over-e2e.md) — E2E テストより QA 手動確認を優先する
- [ADR-40](40-testing-library-react.md) — コンポーネントテストに `@testing-library/react` を採用する
- [ADR-9012](9012-app-testing-strategy.md) — `packages/app` のテスト戦略 — `@testing-library/react` + renderHook + ARIA
- [ADR-165](165-vitest-placement-in-monorepo.md) — vitest Placement in Monorepo — Workspace Delegation over Root Install

### ビルド / CI / インフラ / 依存関係

> Derives from (`build`): N/A — infrastructure topic, no originating concept section

モノレポ構成、依存更新、デプロイ、CI ワークフローに関する判断。

- [ADR-9001](9001-monorepo.md) — モノレポ構成の採用
- [ADR-65](65-merge-queue.md) — Main Branch Health Strategy
- [ADR-128](128-dependabot.md) — Dependency Update Automation with Dependabot
- [ADR-158](158-update-dependencies-20260330.md) — Major Dependency Updates — March 2026
- [ADR-199](199-update-dependencies-20260331.md) — Dependency Updates — 2026-03-31
- [ADR-209](209-marked-and-chokidar.md) — Adopt marked for Markdown rendering and chokidar for file watching
- [ADR-45](45-bun-not-adopted.md) — Bun への移行は行わない
- [ADR-284](284-claude-session-rename-not-adopted.md) — start-dev スキルでの Claude セッションリネームは採用しない
- [ADR-123](123-github-markdown-render-service.md) — GitHub Markdown レンダリングサービス — `serve.ts` の `/render` エンドポイント
- [ADR-308](308-npm-package-scope-rename.md) — npm パッケージスコープを `@karasu-tools/*` に変更
- [ADR-349](349-update-dependencies-20260407.md) — Dependency Updates — 2026-04-07
- [ADR-377](377-trunk-based-development.md) — Trunk-Based Development with Release Toggles
- [ADR-579](579-preview-workflow-no-label-gating.md) — Preview workflow はラベル駆動をやめ path filter で制御する
- [ADR-633](633-dependabot-batch-2026-04-14.md) — Dependabot Batch Triage (2026-04-14)
- [ADR-843](843-feature-toggle-policy.md) — Feature toggle policy — compile-time, short-lived, deleted on graduation
- [ADR-903](903-skip-secret-gated-jobs-on-bot-prs.md) — Secret 必須の CI ジョブは bot 作者の PR で skip する
- [ADR-909](909-update-dependencies-20260428.md) — 依存更新バッチ — 2026-04-28
- [ADR-953](953-ci-docs-only-paired-stub-workflow.md) — Required Check は paired stub workflow で docs-only PR を成功扱いにする
- [ADR-1338](1338-fast-uri-override-pin.md) — `fast-uri` を `pnpm.overrides` で `^3.1.2` に固定（GHSA セキュリティ修正）
- [ADR-1350](1350-dependabot-batch-2026-05-12.md) — Dependabot Batch Triage (2026-05-12)
- [ADR-1084](1084-skills-plugin-portability.md) — portable な開発スキルは `kompiro/hane` plugin に切り出し、karasu からは plugin 経由で読み込む
- [ADR-1085](1085-agent-worktree-coexistence.md) — ユーザー作成 worktree は `.claude/worktrees/<branch>` 配下に置き、Claude Code Agent の自動 worktree と共存させる

### ADR 運用・ツール — `adr-tooling`

> Derives from (`adr-tooling`): N/A — tooling topic, no originating concept section

ADR 自体のスキーマ、フロントマター、バリデータ、extractor など、ADR を支える
ツール層に関する判断。将来的には karasu 本体から独立したツールとして切り出す
可能性があるため、コア機能トピックとは別枠で管理する。

- [ADR-808](808-adr-body-ref-check.md) — Validator warning for body ↔ frontmatter reference consistency
- [ADR-788](788-adr-knowledge-graph.md) — ADR knowledge graph — machine-readable frontmatter + tooling
- [ADR-1077](1077-adr-config-externalization.md) — ADR ツール用語彙の `adr.config.json` への外部化
- [ADR-2092](2092-tpl-config-split.md) — TPL の reference-data 設定を `tpl.config.json` に分離し、TPL は `date-sequence` を維持する

---

## ステータス別

本 PR では superseded 関係の網羅的な整理は行わず、**明確に不採用** と判断された ADR のみを
別ビューとして抜き出している。未掲載の ADR はすべて accepted として扱う。
superseded 関係の棚卸しや、各 ADR への status フロントマターの追加は follow-up work。

### Not adopted

意識的に「採用しない」と結論づけた ADR。将来同じ議論が再燃したときに、
過去の検討経緯を辿れるようにするために残している。

- [ADR-7](7-yaml-style-syntax-cancelled.md) — YAML スタイル構文移行の見送り
- [ADR-45](45-bun-not-adopted.md) — Bun への移行は行わない
- [ADR-284](284-claude-session-rename-not-adopted.md) — start-dev スキルでの Claude セッションリネームは採用しない
- [ADR-105](105-png-export-not-adopted.md) — PNG エクスポートは実装しない
- [ADR-104](104-system-selector-not-adopted.md) — system セレクタ UI を採用しない
