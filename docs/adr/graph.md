# ADR Dependency Graph — Overview

113 ADRs across 15 topics. Clusters group by `topic` frontmatter field. Edges crossing cluster borders are cross-topic dependencies.
```mermaid
flowchart TD
  subgraph adr-tooling["adr-tooling"]
    ADR_20260423_01["ADR-20260423-01<br/>ADR 本文とフロントマター関係フィールドの整合性を validator の warning ..."]
    ADR_20260424_01["ADR-20260424-01<br/>ADR knowledge graph — machine-readable frontmat..."]
  end
  subgraph app-ui["app-ui"]
    ADR_20260323_02["ADR-20260323-02<br/>ツールバーボタンはアイコン+テキストラベル必須"]
    ADR_20260326_02["ADR-20260326-02<br/>MemoryMode と ProjectMode の統一 — Reducer + `Karas..."]
    ADR_20260326_03["ADR-20260326-03<br/>Editor 診断表示 — Monaco マーカー + Preview エラーオーバーレイ"]
    ADR_20260330_02["ADR-20260330-02<br/>Toolbar Button Display Rules"]
    ADR_20260404_04["ADR-20260404-04<br/>system セレクタUIを採用しない"]
    ADR_20260405_02["ADR-20260405-02<br/>Toolbar Button Actionable Modifier Class"]
    ADR_20260405_04["ADR-20260405-04<br/>Reference パネルの図種別コンテキスト対応"]
    ADR_20260407_03["ADR-20260407-03<br/>ProjectSelector の Rename 操作 — インライン入力欄パターン"]
    ADR_20260408_03["ADR-20260408-03<br/>ProjectMode 初期コンテンツ — `examples/ec-platform` から..."]
    ADR_20260411_04["ADR-20260411-04<br/>`EditArea` コンポーネント新設と sidebar-toggle のサイドバーエリアへの移動"]
    ADR_20260411_08["ADR-20260411-08<br/>EditPaneToolbar — LeftPane アクションボタンの専用ツールバーへの集約"]
    ADR_20260413_03["ADR-20260413-03<br/>DetailPanel は常に1つだけ表示する"]
    ADR_20260419_02["ADR-20260419-02<br/>`KarasuPreviewColumn` を `PreviewColumn` にリネーム"]
    ADR_20260420_02["ADR-20260420-02<br/>グラフィカル diff ビューア"]
    ADR_20260422_06["ADR-20260422-06<br/>Diff ペースト入力の UI 配置とストレージ方式"]
  end
  subgraph build["build"]
    ADR_20260312_01["ADR-20260312-01<br/>モノレポ構成の採用"]
    ADR_20260326_01["ADR-20260326-01<br/>Main Branch Health Strategy"]
    ADR_20260329_01["ADR-20260329-01<br/>Dependency Update Automation with Dependabot"]
    ADR_20260330_01["ADR-20260330-01<br/>Major Dependency Updates — March 2026"]
    ADR_20260331_01["ADR-20260331-01<br/>Dependency Updates — 2026-03-31"]
    ADR_20260401_01["ADR-20260401-01<br/>Adopt marked for Markdown rendering and chokida..."]
    ADR_20260404_01["ADR-20260404-01<br/>Do not migrate to Bun"]
    ADR_20260404_02["ADR-20260404-02<br/>Do not rename Claude session to feature name in..."]
    ADR_20260404_06["ADR-20260404-06<br/>GitHub Markdown レンダリングサービス — `serve.ts` の `/ren..."]
    ADR_20260405_01["ADR-20260405-01<br/>npm パッケージスコープを @karasu-tools/* に変更"]
    ADR_20260407_01["ADR-20260407-01<br/>Dependency Updates — 2026-04-07"]
    ADR_20260408_01["ADR-20260408-01<br/>Trunk-Based Development with Release Toggles"]
    ADR_20260413_01["ADR-20260413-01<br/>Preview workflow はラベル駆動をやめ path filter で制御する"]
    ADR_20260414_01["ADR-20260414-01<br/>Dependabot Batch Triage (2026-04-14)"]
    ADR_20260416_01["ADR-20260416-01<br/>DOMPurify Adoption for HTML Sanitization"]
    ADR_20260421_01["ADR-20260421-01<br/>Dependency Updates — 2026-04-20"]
    ADR_20260422_01["ADR-20260422-01<br/>Dependency Updates — 2026-04-21"]
  end
  subgraph chat-ai["chat-ai"]
    ADR_20260407_04["ADR-20260407-04<br/>Cloudflare Pages デプロイ基盤と BYOK AI 連携"]
    ADR_20260409_01["ADR-20260409-01<br/>Chat UI Phase 2 — BYOK + AI 統合の実装方針"]
    ADR_20260409_08["ADR-20260409-08<br/>Chat UI Panel — 全体アーキテクチャと Phase 1 レイアウト"]
    ADR_20260412_01["ADR-20260412-01<br/>Chat UI Phase 3 — 構造化インタビュープロンプトの実装方針"]
    ADR_20260412_05["ADR-20260412-05<br/>Playwright with AI-assisted visual review"]
    ADR_20260418_01["ADR-20260418-01<br/>Chat system prompt i18n — locale detection and ..."]
    ADR_20260420_03["ADR-20260420-03<br/>i18n Rollout — English / Japanese UI, Diagnosti..."]
    ADR_20260422_02["ADR-20260422-02<br/>Chat UI AI 設計レビュー — プロンプト駆動 + トリガー二系統"]
  end
  subgraph cli["cli"]
    ADR_20260328_04["ADR-20260328-04<br/>CLI `karasu serve` モード — ローカル `.krs` のリアルタイムプレビュー"]
    ADR_20260404_08["ADR-20260404-08<br/>CLI `karasu render` コマンド"]
    ADR_20260409_02["ADR-20260409-02<br/>CLI `karasu translate` コマンドと複数 realizes 対応"]
    ADR_20260411_07["ADR-20260411-07<br/>`karasu apply` サブコマンド — stdin + `applyKrsPatch`..."]
    ADR_20260412_02["ADR-20260412-02<br/>CLI 変更系サブコマンド — `karasu remove` / `append` / `i..."]
    ADR_20260417_01["ADR-20260417-01<br/>`translate --from openapi` のデフォルトをリソース単位の useca..."]
    ADR_20260419_01["ADR-20260419-01<br/>`translate --from db` のデフォルトを集約ルート単位のテーブル集約に変更する"]
  end
  subgraph core-concepts["core-concepts"]
    ADR_20260312_02["ADR-20260312-02<br/>ツール名「karasu」の採用"]
    ADR_20260312_03["ADR-20260312-03<br/>論理構造と物理構造の分離"]
    ADR_20260323_03["ADR-20260323-03<br/>Organization 図（organization / team / member）の追加"]
    ADR_20260404_10["ADR-20260404-10<br/>Org Tree View — 組織階層の左→右ツリー俯瞰図"]
  end
  subgraph edges["edges"]
    ADR_20260404_09["ADR-20260404-09<br/>クロスシステムサービス参照 — ドット記法（`SystemId.ServiceId`）"]
    ADR_20260410_01["ADR-20260410-01<br/>Domain 間エッジと `[implicit]` 自動タグによる暗黙サービスエッジ"]
    ADR_20260411_05["ADR-20260411-05<br/>サービスドリルダウンビューでの Ghost Domain エッジ表示"]
    ADR_20260413_02["ADR-20260413-02<br/>Implicit エッジにおける sync/async の視覚的区別"]
    ADR_20260422_03["ADR-20260422-03<br/>集約された暗黙エッジの詳細パネル — SVG 属性埋め込み方式"]
  end
  subgraph navigation["navigation"]
    ADR_20260330_04["ADR-20260330-04<br/>Permanent Link — `nodePathIndex` と URL hash の 2..."]
    ADR_20260401_07["ADR-20260401-07<br/>ノードクリック UX — ドリルダウンと Cmd/Ctrl+Click エディタジャンプ"]
    ADR_20260403_01["ADR-20260403-01<br/>Drill-down 収集ロジック統一 — `HierarchyNode` 型 + 高階関数"]
    ADR_20260404_05["ADR-20260404-05<br/>ブラウザ履歴ナビゲーション — URL hash による drill-down 同期"]
    ADR_20260405_08["ADR-20260405-08<br/>プロジェクト URL ナビゲーション — `/projects/<uuid>` パスネーム方式"]
    ADR_20260409_03["ADR-20260409-03<br/>クロスナビゲーション時のアトミックなハイライト適用"]
    ADR_20260409_07["ADR-20260409-07<br/>マルチファイルプロジェクトでのクロスファイルナビゲーション"]
    ADR_20260411_03["ADR-20260411-03<br/>ブラウザ履歴でのハイライト復元 — hash コロン拡張"]
  end
  subgraph parser["parser"]
    ADR_20260320_02["ADR-20260320-02<br/>AST 再構成 — Discriminated Union とプロパティブロック"]
    ADR_20260323_01["ADR-20260323-01<br/>YAML スタイル構文移行の見送り"]
    ADR_20260323_04["ADR-20260323-04<br/>ID 必須化と `label` のプロパティ化"]
    ADR_20260401_03["ADR-20260401-03<br/>`compile()` API 統一 — Discriminated Union による戻り値型"]
    ADR_20260405_03["ADR-20260405-03<br/>ワイルドカードインポートと2パス解決の採用"]
    ADR_20260409_05["ADR-20260409-05<br/>Directory Import — `import &quot;dir/&quot;` 構文"]
    ADR_20260409_06["ADR-20260409-06<br/>トップレベル service の Named Import — スタブ補完 + エッジ参照によ..."]
    ADR_20260410_02["ADR-20260410-02<br/>`.krs` フォーマッター — トークン列ベースでコメント保持"]
    ADR_20260410_03["ADR-20260410-03<br/>構造的 `.krs` パッチ — ノード ID ベースの `append` / `replac..."]
    ADR_20260412_04["ADR-20260412-04<br/>ブロック内エッジの暗黙 source 簡略記法"]
  end
  subgraph project["project"]
    ADR_20260317_02["ADR-20260317-02<br/>プロジェクトとファイルシステム抽象化 — `FileSystemProvider` + OPFS"]
    ADR_20260411_06["ADR-20260411-06<br/>Export Project as ZIP — `fflate` による OPFS エクスポート"]
    ADR_20260412_03["ADR-20260412-03<br/>Import Project from ZIP — `fflate` 再利用 + トップレベル除去"]
    ADR_20260422_07["ADR-20260422-07<br/>OPFS 履歴スナップショットを diff 比較ソースにする"]
  end
  subgraph renderer["renderer"]
    ADR_20260316_01["ADR-20260316-01<br/>SVGアイコンファイルの外部インポート方式"]
    ADR_20260317_01["ADR-20260317-01<br/>2 レイヤレンダリングとドリルダウンナビゲーション"]
    ADR_20260320_01["ADR-20260320-01<br/>インタラクティブ SVG レンダリングと NodeDetailPanel"]
    ADR_20260327_01["ADR-20260327-01<br/>Deployment Diagram Design Decisions"]
    ADR_20260328_02["ADR-20260328-02<br/>SVG エクスポートの 2 フェーズ実装（現在ビュー + Full View 単一ファイル）"]
    ADR_20260328_03["ADR-20260328-03<br/>アイコンモード — SVG アイコンによるノード表示切り替え"]
    ADR_20260329_02["ADR-20260329-02<br/>KarasuPreviewColumn からの SVG エクスポート責務分離"]
    ADR_20260401_02["ADR-20260401-02<br/>全ビュー統合バンドル SVG（buildAllViewsSvg）"]
    ADR_20260404_03["ADR-20260404-03<br/>Do not implement PNG export"]
    ADR_20260405_07["ADR-20260405-07<br/>クロスシステム参照の Ghost System レンダリング"]
    ADR_20260407_02["ADR-20260407-02<br/>resource shape 自動推論とインフラノード Icon Mode 対応"]
    ADR_20260408_02["ADR-20260408-02<br/>Deploy 図レイアウト — 階層 DAG レイアウト（Longest Path Layer..."]
    ADR_20260409_04["ADR-20260409-04<br/>同レイヤー内コンテナ順序の Barycenter ヒューリスティックによる最適化"]
    ADR_20260411_01["ADR-20260411-01<br/>Architecture レイアウトへの Barycenter + Sub-row wrap ..."]
    ADR_20260420_01["ADR-20260420-01<br/>draw.io (mxGraph XML) Export — a Layout Escape ..."]
    ADR_20260422_04["ADR-20260422-04<br/>トップレベル service / domain を `(Unassigned)` 擬似システム..."]
    ADR_20260422_05["ADR-20260422-05<br/>トップレベル infra ブロック（database / queue / storage）を ..."]
  end
  subgraph resolver["resolver"]
    ADR_20260401_06["ADR-20260401-06<br/>Domain Drift Detection — Scope and Detection Key"]
    ADR_20260405_05["ADR-20260405-05<br/>`database` / `queue` / `storage` を system 直下のファ..."]
    ADR_20260405_06["ADR-20260405-06<br/>循環依存の検出と `KrsEdge.cyclic` フラグによる視覚化"]
    ADR_20260411_02["ADR-20260411-02<br/>移行期における重複ドメイン ID の共存を `@deprecated` + `@migrati..."]
  end
  subgraph styling["styling"]
    ADR_20260312_04["ADR-20260312-04<br/>CSSインスパイアのスタイリングシステム"]
    ADR_20260322_01["ADR-20260322-01<br/>ビルトインスタイルの一元化と構造化リファレンス"]
    ADR_20260328_01["ADR-20260328-01<br/>スタイル解決パイプラインの一元化"]
    ADR_20260415_01["ADR-20260415-01<br/>親サービスのアノテーションを子ノードに継承する"]
  end
  subgraph testing["testing"]
    ADR_20260324_01["ADR-20260324-01<br/>E2EテストよりQA手動確認を優先する"]
    ADR_20260325_01["ADR-20260325-01<br/>コンポーネントテストに @testing-library/react を採用する"]
    ADR_20260326_04["ADR-20260326-04<br/>`packages/app` のテスト戦略 — `@testing-library/react..."]
    ADR_20260330_03["ADR-20260330-03<br/>vitest Placement in Monorepo — Workspace Delega..."]
  end
  subgraph vscode["vscode"]
    ADR_20260330_05["ADR-20260330-05<br/>VSCode 拡張 — LSP-first アーキテクチャと段階的フェーズ計画"]
    ADR_20260401_04["ADR-20260401-04<br/>VSCode Phase 3 — 独立 HTML Webview アーキテクチャ"]
    ADR_20260401_05["ADR-20260401-05<br/>VSCode Phase 3.5 — Webview ドリルダウンナビゲーション"]
    ADR_20260404_07["ADR-20260404-07<br/>VSCode プレビュー Icon Mode トグル — Extension Host 管理 ..."]
  end
  ADR_20260320_01 --> ADR_20260320_02
  ADR_20260320_01 --> ADR_20260317_01
  ADR_20260323_03 --> ADR_20260312_03
  ADR_20260323_03 --> ADR_20260323_02
  ADR_20260323_04 --> ADR_20260320_02
  ADR_20260326_03 --> ADR_20260320_01
  ADR_20260326_04 --> ADR_20260325_01
  ADR_20260328_01 --> ADR_20260312_04
  ADR_20260328_01 --> ADR_20260322_01
  ADR_20260328_02 --> ADR_20260317_01
  ADR_20260328_02 --> ADR_20260320_01
  ADR_20260328_02 --> ADR_20260323_02
  ADR_20260328_04 --> ADR_20260317_02
  ADR_20260329_02 --> ADR_20260328_02
  ADR_20260401_02 --> ADR_20260328_02
  ADR_20260401_04 --> ADR_20260330_05
  ADR_20260401_05 --> ADR_20260401_04
  ADR_20260401_05 --> ADR_20260320_01
  ADR_20260401_06 --> ADR_20260312_03
  ADR_20260401_07 --> ADR_20260320_01
  ADR_20260401_07 --> ADR_20260401_05
  ADR_20260404_05 --> ADR_20260330_04
  ADR_20260404_07 --> ADR_20260328_03
  ADR_20260404_07 --> ADR_20260330_05
  ADR_20260404_08 --> ADR_20260401_02
  ADR_20260404_09 --> ADR_20260405_03
  ADR_20260404_10 --> ADR_20260323_03
  ADR_20260405_08 --> ADR_20260404_05
  ADR_20260405_08 --> ADR_20260330_04
  ADR_20260407_02 --> ADR_20260405_05
  ADR_20260407_02 --> ADR_20260328_03
  ADR_20260407_03 --> ADR_20260317_02
  ADR_20260408_02 --> ADR_20260327_01
  ADR_20260409_01 --> ADR_20260409_08
  ADR_20260409_01 --> ADR_20260407_04
  ADR_20260409_02 --> ADR_20260404_08
  ADR_20260409_03 --> ADR_20260320_01
  ADR_20260409_04 --> ADR_20260408_02
  ADR_20260409_05 --> ADR_20260405_03
  ADR_20260409_06 --> ADR_20260409_05
  ADR_20260409_06 --> ADR_20260405_03
  ADR_20260409_07 --> ADR_20260409_06
  ADR_20260409_07 --> ADR_20260401_03
  ADR_20260409_08 --> ADR_20260407_04
  ADR_20260411_01 --> ADR_20260408_02
  ADR_20260411_01 --> ADR_20260409_04
  ADR_20260411_03 --> ADR_20260409_03
  ADR_20260411_03 --> ADR_20260404_05
  ADR_20260411_05 --> ADR_20260410_01
  ADR_20260411_06 --> ADR_20260317_02
  ADR_20260411_06 --> ADR_20260407_03
  ADR_20260411_07 --> ADR_20260409_02
  ADR_20260411_08 --> ADR_20260323_02
  ADR_20260412_01 --> ADR_20260409_01
  ADR_20260412_01 --> ADR_20260409_08
  ADR_20260412_02 --> ADR_20260411_07
  ADR_20260412_03 --> ADR_20260407_03
  ADR_20260412_03 --> ADR_20260408_03
  ADR_20260412_03 --> ADR_20260411_06
  ADR_20260412_04 --> ADR_20260411_02
  ADR_20260413_02 --> ADR_20260410_01
  ADR_20260415_01 --> ADR_20260411_02
  ADR_20260417_01 --> ADR_20260409_02
  ADR_20260419_01 --> ADR_20260409_02
  ADR_20260420_02 --> ADR_20260317_01
  ADR_20260420_03 --> ADR_20260418_01
  ADR_20260422_02 --> ADR_20260409_08
  ADR_20260422_02 --> ADR_20260412_01
  ADR_20260422_03 --> ADR_20260410_01
  ADR_20260422_04 --> ADR_20260409_06
  ADR_20260422_05 --> ADR_20260422_04
  ADR_20260422_05 --> ADR_20260405_05
  ADR_20260422_06 --> ADR_20260420_02
  ADR_20260422_07 --> ADR_20260420_02
  ADR_20260412_05 -.supersedes.-> ADR_20260324_01

  classDef accepted fill:#d4edda,stroke:#28a745,color:#155724
  classDef proposed fill:#fff3cd,stroke:#ffc107,color:#856404
  classDef deprecated fill:#f8d7da,stroke:#dc3545,color:#721c24
  classDef superseded fill:#e2e3e5,stroke:#6c757d,color:#383d41
  classDef not_adopted fill:#e2e3e5,stroke:#6c757d,color:#383d41,stroke-dasharray:3 3
  classDef ghost fill:#f5f5f5,stroke:#adb5bd,color:#6c757d,stroke-dasharray:2 2
  class ADR_20260312_01 accepted
  class ADR_20260312_02 accepted
  class ADR_20260312_03 accepted
  class ADR_20260312_04 accepted
  class ADR_20260316_01 accepted
  class ADR_20260317_01 accepted
  class ADR_20260317_02 accepted
  class ADR_20260320_01 accepted
  class ADR_20260320_02 accepted
  class ADR_20260322_01 accepted
  class ADR_20260323_01 not_adopted
  class ADR_20260323_02 accepted
  class ADR_20260323_03 accepted
  class ADR_20260323_04 accepted
  class ADR_20260324_01 superseded
  class ADR_20260325_01 accepted
  class ADR_20260326_01 accepted
  class ADR_20260326_02 accepted
  class ADR_20260326_03 accepted
  class ADR_20260326_04 accepted
  class ADR_20260327_01 accepted
  class ADR_20260328_01 accepted
  class ADR_20260328_02 accepted
  class ADR_20260328_03 accepted
  class ADR_20260328_04 accepted
  class ADR_20260329_01 accepted
  class ADR_20260329_02 accepted
  class ADR_20260330_01 accepted
  class ADR_20260330_02 accepted
  class ADR_20260330_03 accepted
  class ADR_20260330_04 accepted
  class ADR_20260330_05 accepted
  class ADR_20260331_01 accepted
  class ADR_20260401_01 accepted
  class ADR_20260401_02 accepted
  class ADR_20260401_03 accepted
  class ADR_20260401_04 accepted
  class ADR_20260401_05 accepted
  class ADR_20260401_06 accepted
  class ADR_20260401_07 accepted
  class ADR_20260403_01 accepted
  class ADR_20260404_01 not_adopted
  class ADR_20260404_02 not_adopted
  class ADR_20260404_03 not_adopted
  class ADR_20260404_04 not_adopted
  class ADR_20260404_05 accepted
  class ADR_20260404_06 accepted
  class ADR_20260404_07 accepted
  class ADR_20260404_08 accepted
  class ADR_20260404_09 accepted
  class ADR_20260404_10 accepted
  class ADR_20260405_01 accepted
  class ADR_20260405_02 accepted
  class ADR_20260405_03 accepted
  class ADR_20260405_04 accepted
  class ADR_20260405_05 accepted
  class ADR_20260405_06 accepted
  class ADR_20260405_07 accepted
  class ADR_20260405_08 accepted
  class ADR_20260407_01 accepted
  class ADR_20260407_02 accepted
  class ADR_20260407_03 accepted
  class ADR_20260407_04 accepted
  class ADR_20260408_01 accepted
  class ADR_20260408_02 accepted
  class ADR_20260408_03 accepted
  class ADR_20260409_01 accepted
  class ADR_20260409_02 accepted
  class ADR_20260409_03 accepted
  class ADR_20260409_04 accepted
  class ADR_20260409_05 accepted
  class ADR_20260409_06 accepted
  class ADR_20260409_07 accepted
  class ADR_20260409_08 accepted
  class ADR_20260410_01 accepted
  class ADR_20260410_02 accepted
  class ADR_20260410_03 accepted
  class ADR_20260411_01 accepted
  class ADR_20260411_02 accepted
  class ADR_20260411_03 accepted
  class ADR_20260411_04 accepted
  class ADR_20260411_05 accepted
  class ADR_20260411_06 accepted
  class ADR_20260411_07 accepted
  class ADR_20260411_08 accepted
  class ADR_20260412_01 accepted
  class ADR_20260412_02 accepted
  class ADR_20260412_03 accepted
  class ADR_20260412_04 accepted
  class ADR_20260412_05 accepted
  class ADR_20260413_01 accepted
  class ADR_20260413_02 accepted
  class ADR_20260413_03 accepted
  class ADR_20260414_01 accepted
  class ADR_20260415_01 accepted
  class ADR_20260416_01 accepted
  class ADR_20260417_01 accepted
  class ADR_20260418_01 accepted
  class ADR_20260419_01 accepted
  class ADR_20260419_02 accepted
  class ADR_20260420_01 accepted
  class ADR_20260420_02 accepted
  class ADR_20260420_03 accepted
  class ADR_20260421_01 accepted
  class ADR_20260422_01 accepted
  class ADR_20260422_02 accepted
  class ADR_20260422_03 accepted
  class ADR_20260422_04 accepted
  class ADR_20260422_05 accepted
  class ADR_20260422_06 accepted
  class ADR_20260422_07 accepted
  class ADR_20260423_01 accepted
  class ADR_20260424_01 accepted
```

## Per-topic detail

- [`adr-tooling`](graph/adr-tooling.md) — 2 ADRs
- [`app-ui`](graph/app-ui.md) — 15 ADRs
- [`build`](graph/build.md) — 17 ADRs
- [`chat-ai`](graph/chat-ai.md) — 8 ADRs
- [`cli`](graph/cli.md) — 7 ADRs
- [`core-concepts`](graph/core-concepts.md) — 4 ADRs
- [`edges`](graph/edges.md) — 5 ADRs
- [`navigation`](graph/navigation.md) — 8 ADRs
- [`parser`](graph/parser.md) — 10 ADRs
- [`project`](graph/project.md) — 4 ADRs
- [`renderer`](graph/renderer.md) — 17 ADRs
- [`resolver`](graph/resolver.md) — 4 ADRs
- [`styling`](graph/styling.md) — 4 ADRs
- [`testing`](graph/testing.md) — 4 ADRs
- [`vscode`](graph/vscode.md) — 4 ADRs
