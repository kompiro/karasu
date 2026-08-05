# ADR Topic: app-ui

42 ADRs in this topic. Solid nodes belong to `app-ui`; gray dashed nodes are ghosts showing cross-topic references to help navigation.

Other topics: [overview](../graph.md).
```mermaid
flowchart TD
  subgraph app-ui["app-ui"]
    ADR_104["ADR-104<br/>system セレクタUIを採用しない"]
    ADR_164["ADR-164<br/>ツールバーボタンの表示ルール"]
    ADR_307["ADR-307<br/>ツールバーボタンの actionable 修飾クラス"]
    ADR_357["ADR-357<br/>ProjectSelector の Rename 操作 — インライン入力欄パターン"]
    ADR_455["ADR-455<br/>EditPaneToolbar — LeftPane アクションボタンの専用ツールバーへの集約"]
    ADR_465["ADR-465<br/>`EditArea` コンポーネント新設と sidebar-toggle のサイドバーエリアへの移動"]
    ADR_607["ADR-607<br/>DetailPanel は常に1つだけ表示する"]
    ADR_650["ADR-650<br/>グラフィカル diff ビューア"]
    ADR_706["ADR-706<br/>`KarasuPreviewColumn` を `PreviewColumn` にリネーム"]
    ADR_739["ADR-739<br/>Diff ペースト入力の UI 配置とストレージ方式"]
    ADR_766["ADR-766<br/>空ビューを避けるための自動タブ切替（system > deploy > org）"]
    ADR_811["ADR-811<br/>プレビューのエントリは「開いている .krs ファイル」"]
    ADR_813["ADR-813<br/>ユーザー向け文字列はデフォルトで i18n を通す"]
    ADR_1076["ADR-1076<br/>GUI 駆動の `.krs.style` 編集 — Preview コンテキストメニューから ..."]
    ADR_1108["ADR-1108<br/>アクティビティバー + サイドバー構造の導入"]
    ADR_1122["ADR-1122<br/>エディタ・プレビュー間のドラッグハンドル"]
    ADR_1142["ADR-1142<br/>GUI 駆動の `.krs.style` 編集 — 単一プロパティ rule は in-pla..."]
    ADR_1144["ADR-1144<br/>GUI コンテキストメニューの append 先解決 — `.krs.style` 直接編集時..."]
    ADR_1148["ADR-1148<br/>FileTree の外部書き込み反映 — ObservableFileSystemProvid..."]
    ADR_1150["ADR-1150<br/>Editor バッファの外部書き込み追従 — 差分検出ベースの auto-refresh"]
    ADR_1179["ADR-1179<br/>Monaco undo stack 統合 — `@monaco-editor/react` 経..."]
    ADR_1344["ADR-1344<br/>`examples/feature-samples/` を built-in ProjectM..."]
    ADR_1368["ADR-1368<br/>shadcn/ui と Tailwind v4 を packages/app に採用する"]
    ADR_1400["ADR-1400<br/>EdgeContextMenu の direction メニューは shadcn Dropdo..."]
    ADR_1408["ADR-1408<br/>App サイドバーに AST Outline ビューを追加する"]
    ADR_1410["ADR-1410<br/>Outline ビューはアクティブビューの AST に追従する"]
    ADR_1411["ADR-1411<br/>App キーボードショートカットはコマンドレジストリを基盤にする"]
    ADR_1415["ADR-1415<br/>Outline ビューはタグ駆動アイコン variant を core 共有関数で解決する"]
    ADR_1421["ADR-1421<br/>App コマンドパレットはコマンドレジストリを列挙する"]
    ADR_1463["ADR-1463<br/>translate を core に移設し App でクライアントサイド変換として提供する"]
    ADR_1468["ADR-1468<br/>overlay/portal surface の z-index を文書化されたトークンスケー..."]
    ADR_1469["ADR-1469<br/>コマンドパレットのコマンド名は当面 i18n せず、解説追加時にまとめて対応する"]
    ADR_1470["ADR-1470<br/>app.css をモジュール分割し、トークン層でライトテーマを提供する"]
    ADR_1646["ADR-1646<br/>gallery の example は id 指定・固定 origin fetch で app..."]
    ADR_1955["ADR-1955<br/>全 service をその場一括展開する — Collapse all / Expand al..."]
    ADR_2120["ADR-2120<br/>bulk collapse は描画済みフレームの集合で駆動し、Group-by 軸の増加に無改..."]
    ADR_2316["ADR-2316<br/>experimental notation は Reference に載せ、experimen..."]
    ADR_9009["ADR-9009<br/>ツールバーボタンはアイコン+テキストラベル必須"]
    ADR_9010["ADR-9010<br/>MemoryMode と ProjectMode の統一 — Reducer + `Karas..."]
    ADR_9011["ADR-9011<br/>Editor 診断表示 — Monaco マーカー + Preview エラーオーバーレイ"]
    ADR_9016["ADR-9016<br/>Reference パネルの図種別コンテキスト対応"]
    ADR_9018["ADR-9018<br/>ProjectMode 初期コンテンツ — `examples/ec-platform` から..."]
  end
  ADR_14["ADR-14<br/>[core-concepts] Organization 図（organization / team / member）の追加"]
  ADR_21["ADR-21<br/>[renderer] 2 レイヤレンダリングとドリルダウンナビゲーション"]
  ADR_22["ADR-22<br/>[renderer] SVG エクスポートの 2 フェーズ実装（現在ビュー + Full View 単一ファイル）"]
  ADR_34["ADR-34<br/>[chat-ai] i18n ロールアウト — 英語 / 日本語の UI・診断・Chat"]
  ADR_461["ADR-461<br/>[project] Export Project as ZIP — `fflate` による OPFS エクスポート"]
  ADR_462["ADR-462<br/>[project] Import Project from ZIP — `fflate` 再利用 + トップレベル除去"]
  ADR_740["ADR-740<br/>[project] OPFS 履歴スナップショットを diff 比較ソースにする"]
  ADR_1096["ADR-1096<br/>[edges] `.krs.style` の `edge#<id>` セレクタ — base ID + opt..."]
  ADR_1821["ADR-1821<br/>[renderer] layer toggles — external/infra カテゴリの対話的 collaps..."]
  ADR_1858["ADR-1858<br/>[renderer] system view を team（owns）軸でグループ化し、折り畳み可能な境界フレームで..."]
  ADR_9006["ADR-9006<br/>[project] プロジェクトとファイルシステム抽象化 — `FileSystemProvider` + OPFS"]
  ADR_9007["ADR-9007<br/>[renderer] インタラクティブ SVG レンダリングと NodeDetailPanel"]
  ADR_9019["ADR-9019<br/>[edges] `.krs.style` の edge `direction` プロパティ — 矢印の流れる向..."]
  ADR_357 --> ADR_9006
  ADR_455 --> ADR_9009
  ADR_650 --> ADR_21
  ADR_739 --> ADR_650
  ADR_813 --> ADR_34
  ADR_1150 --> ADR_1148
  ADR_2120 --> ADR_1858
  ADR_2120 --> ADR_1821
  ADR_9011 --> ADR_9007
  ADR_14 --> ADR_9009
  ADR_22 --> ADR_21
  ADR_22 --> ADR_9007
  ADR_22 --> ADR_9009
  ADR_461 --> ADR_9006
  ADR_461 --> ADR_357
  ADR_462 --> ADR_357
  ADR_462 --> ADR_9018
  ADR_462 --> ADR_461
  ADR_740 --> ADR_650
  ADR_1096 --> ADR_1142
  ADR_9007 --> ADR_21
  ADR_9019 --> ADR_1142
  ADR_9019 --> ADR_1096
  ADR_1142 -.supersedes.-> ADR_1076

  classDef accepted fill:#d4edda,stroke:#28a745,color:#155724
  classDef proposed fill:#fff3cd,stroke:#ffc107,color:#856404
  classDef deprecated fill:#f8d7da,stroke:#dc3545,color:#721c24
  classDef superseded fill:#e2e3e5,stroke:#6c757d,color:#383d41
  classDef not_adopted fill:#e2e3e5,stroke:#6c757d,color:#383d41,stroke-dasharray:3 3
  classDef ghost fill:#f5f5f5,stroke:#adb5bd,color:#6c757d,stroke-dasharray:2 2
  class ADR_104 not_adopted
  class ADR_164 accepted
  class ADR_307 accepted
  class ADR_357 accepted
  class ADR_455 accepted
  class ADR_465 accepted
  class ADR_607 accepted
  class ADR_650 accepted
  class ADR_706 accepted
  class ADR_739 accepted
  class ADR_766 accepted
  class ADR_811 accepted
  class ADR_813 accepted
  class ADR_1076 superseded
  class ADR_1108 accepted
  class ADR_1122 accepted
  class ADR_1142 accepted
  class ADR_1144 accepted
  class ADR_1148 accepted
  class ADR_1150 accepted
  class ADR_1179 accepted
  class ADR_1344 accepted
  class ADR_1368 accepted
  class ADR_1400 accepted
  class ADR_1408 accepted
  class ADR_1410 accepted
  class ADR_1411 accepted
  class ADR_1415 accepted
  class ADR_1421 accepted
  class ADR_1463 accepted
  class ADR_1468 accepted
  class ADR_1469 accepted
  class ADR_1470 accepted
  class ADR_1646 accepted
  class ADR_1955 accepted
  class ADR_2120 accepted
  class ADR_2316 accepted
  class ADR_9009 accepted
  class ADR_9010 accepted
  class ADR_9011 accepted
  class ADR_9016 accepted
  class ADR_9018 accepted
  class ADR_14 ghost
  class ADR_21 ghost
  class ADR_22 ghost
  class ADR_34 ghost
  class ADR_461 ghost
  class ADR_462 ghost
  class ADR_740 ghost
  class ADR_1096 ghost
  class ADR_1821 ghost
  class ADR_1858 ghost
  class ADR_9006 ghost
  class ADR_9007 ghost
  class ADR_9019 ghost
```
