# ADR Topic: renderer

39 ADRs in this topic. Solid nodes belong to `renderer`; gray dashed nodes are ghosts showing cross-topic references to help navigation.

Other topics: [overview](../graph.md).
```mermaid
flowchart TD
  subgraph renderer["renderer"]
    ADR_21["ADR-21<br/>2 レイヤレンダリングとドリルダウンナビゲーション"]
    ADR_22["ADR-22<br/>SVG エクスポートの 2 フェーズ実装（現在ビュー + Full View 単一ファイル）"]
    ADR_29["ADR-29<br/>Deployment 図の設計判断"]
    ADR_30["ADR-30<br/>アイコンモード — SVG アイコンによるノード表示切り替え"]
    ADR_105["ADR-105<br/>PNG エクスポートは実装しない"]
    ADR_131["ADR-131<br/>KarasuPreviewColumn からの SVG エクスポート責務分離"]
    ADR_328["ADR-328<br/>クロスシステム参照の Ghost System レンダリング"]
    ADR_351["ADR-351<br/>resource shape 自動推論とインフラノード Icon Mode 対応"]
    ADR_392["ADR-392<br/>Deploy 図レイアウト — 階層 DAG レイアウト（Longest Path Layer..."]
    ADR_395["ADR-395<br/>同レイヤー内コンテナ順序の Barycenter ヒューリスティックによる最適化"]
    ADR_458["ADR-458<br/>Architecture レイアウトへの Barycenter + Sub-row wrap ..."]
    ADR_649["ADR-649<br/>draw.io（mxGraph XML）エクスポート — レイアウトの逃げ道"]
    ADR_681["ADR-681<br/>トップレベル service / domain を `(Unassigned)` 擬似システム..."]
    ADR_702["ADR-702<br/>トップレベル infra ブロック（database / queue / storage）を ..."]
    ADR_833["ADR-833<br/>図の凡例（legend）構文をモデル側に追加する"]
    ADR_967["ADR-967<br/>アクター配置 — outgoing edge の最も浅い target に隣接する row へ..."]
    ADR_974["ADR-974<br/>Infra/external ノードを最深 consumer の直下行に引き上げる"]
    ADR_1000["ADR-1000<br/>Icon display mode 用の auto-layout gap 定数を別系統に分ける"]
    ADR_1061["ADR-1061<br/>usecase→resource edge を read/write で視覚的に区別する"]
    ADR_1479["ADR-1479<br/>SVG 図のライト / ダークテーマ対応（パレット引数 + 解決済み色の埋め込み）"]
    ADR_1513["ADR-1513<br/>ドリルダウン深度スコープによる凡例の完全一致切り替え"]
    ADR_1658["ADR-1658<br/>deploy view に service→infra 依存エッジを描く（導出は共有ヘルパーで..."]
    ADR_1724["ADR-1724<br/>system-view の dep ティアを infra 行と external 行に分割する"]
    ADR_1728["ADR-1728<br/>system-view の external サービスをサイド列に配置してエッジ交差を減らす"]
    ADR_1737["ADR-1737<br/>多すぎる兄弟ノードをバランス grid で畳む"]
    ADR_1738["ADR-1738<br/>deploy view は job-only container を専用の job 帯にまとめ..."]
    ADR_1805["ADR-1805<br/>karasu-nest の PNG ラスタライズに resvg-wasm を採用する"]
    ADR_1815["ADR-1815<br/>system view のコンテナをその場で展開する（in-place expansion /..."]
    ADR_1821["ADR-1821<br/>layer toggles — external/infra カテゴリの対話的 collaps..."]
    ADR_1858["ADR-1858<br/>system view を team（owns）軸でグループ化し、折り畳み可能な境界フレームで..."]
    ADR_1859["ADR-1859<br/>grouped system view のエッジを直交ルーティング・集約トランク・交差マークで..."]
    ADR_1872["ADR-1872<br/>category collapse は境界エッジを drop せず stub に re-tar..."]
    ADR_1884["ADR-1884<br/>multi-system root view でも Group by: team を効かせる（..."]
    ADR_1886["ADR-1886<br/>差分モードの Group by で除去ノードを元の team フレームに残し、集約エッジの d..."]
    ADR_1983["ADR-1983<br/>boundary grouping の drill-down 拡張 — 描画レベルとの交差によ..."]
    ADR_2048["ADR-2048<br/>エッジラベルの自動衝突回避 — レンダー後段の label placement post-pass"]
    ADR_9005["ADR-9005<br/>SVGアイコンファイルの外部インポート方式"]
    ADR_9007["ADR-9007<br/>インタラクティブ SVG レンダリングと NodeDetailPanel"]
    ADR_9015["ADR-9015<br/>全ビュー統合バンドル SVG（buildAllViewsSvg）"]
  end
  ADR_121["ADR-121<br/>[cli] CLI `karasu render` コマンド"]
  ADR_177["ADR-177<br/>[navigation] ノードクリック UX — ドリルダウンと Cmd/Ctrl+Click エディタジャンプ"]
  ADR_218["ADR-218<br/>[vscode] VSCode Phase 3.5 — Webview ドリルダウンナビゲーション"]
  ADR_299["ADR-299<br/>[vscode] VSCode プレビュー Icon Mode トグル — Extension Host 管理 ..."]
  ADR_316["ADR-316<br/>[resolver] `database` / `queue` / `storage` を system 直下のファ..."]
  ADR_412["ADR-412<br/>[parser] トップレベル service の Named Import — スタブ補完 + エッジ参照によ..."]
  ADR_422["ADR-422<br/>[navigation] クロスナビゲーション時のアトミックなハイライト適用"]
  ADR_650["ADR-650<br/>[app-ui] グラフィカル diff ビューア"]
  ADR_1046["ADR-1046<br/>[parser] usecase 内 resource に CRUD operations プロパティを追加する"]
  ADR_1974["ADR-1974<br/>[parser] system view の意味的クラスタを宣言する `boundary` 構文と `bound..."]
  ADR_2036["ADR-2036<br/>[parser] boundary をスコープ内に宣言する — 「層ごとの関心事」としての boundary 再定義"]
  ADR_2120["ADR-2120<br/>[app-ui] bulk collapse は描画済みフレームの集合で駆動し、Group-by 軸の増加に無改..."]
  ADR_9008["ADR-9008<br/>[parser] AST 再構成 — Discriminated Union とプロパティブロック"]
  ADR_9009["ADR-9009<br/>[app-ui] ツールバーボタンはアイコン+テキストラベル必須"]
  ADR_9011["ADR-9011<br/>[app-ui] Editor 診断表示 — Monaco マーカー + Preview エラーオーバーレイ"]
  ADR_22 --> ADR_21
  ADR_22 --> ADR_9007
  ADR_22 --> ADR_9009
  ADR_131 --> ADR_22
  ADR_351 --> ADR_316
  ADR_351 --> ADR_30
  ADR_392 --> ADR_29
  ADR_395 --> ADR_392
  ADR_458 --> ADR_392
  ADR_458 --> ADR_395
  ADR_681 --> ADR_412
  ADR_702 --> ADR_681
  ADR_702 --> ADR_316
  ADR_1061 --> ADR_1046
  ADR_9007 --> ADR_9008
  ADR_9007 --> ADR_21
  ADR_9015 --> ADR_22
  ADR_121 --> ADR_9015
  ADR_177 --> ADR_9007
  ADR_177 --> ADR_218
  ADR_218 --> ADR_9007
  ADR_299 --> ADR_30
  ADR_422 --> ADR_9007
  ADR_650 --> ADR_21
  ADR_1974 --> ADR_1858
  ADR_2036 --> ADR_1974
  ADR_2036 --> ADR_1983
  ADR_2120 --> ADR_1858
  ADR_2120 --> ADR_1821
  ADR_9011 --> ADR_9007

  classDef accepted fill:#d4edda,stroke:#28a745,color:#155724
  classDef proposed fill:#fff3cd,stroke:#ffc107,color:#856404
  classDef deprecated fill:#f8d7da,stroke:#dc3545,color:#721c24
  classDef superseded fill:#e2e3e5,stroke:#6c757d,color:#383d41
  classDef not_adopted fill:#e2e3e5,stroke:#6c757d,color:#383d41,stroke-dasharray:3 3
  classDef ghost fill:#f5f5f5,stroke:#adb5bd,color:#6c757d,stroke-dasharray:2 2
  class ADR_21 accepted
  class ADR_22 accepted
  class ADR_29 accepted
  class ADR_30 accepted
  class ADR_105 not_adopted
  class ADR_131 accepted
  class ADR_328 accepted
  class ADR_351 accepted
  class ADR_392 accepted
  class ADR_395 accepted
  class ADR_458 accepted
  class ADR_649 accepted
  class ADR_681 accepted
  class ADR_702 accepted
  class ADR_833 accepted
  class ADR_967 accepted
  class ADR_974 accepted
  class ADR_1000 accepted
  class ADR_1061 accepted
  class ADR_1479 accepted
  class ADR_1513 accepted
  class ADR_1658 accepted
  class ADR_1724 accepted
  class ADR_1728 accepted
  class ADR_1737 accepted
  class ADR_1738 accepted
  class ADR_1805 accepted
  class ADR_1815 accepted
  class ADR_1821 accepted
  class ADR_1858 accepted
  class ADR_1859 accepted
  class ADR_1872 accepted
  class ADR_1884 accepted
  class ADR_1886 accepted
  class ADR_1983 accepted
  class ADR_2048 accepted
  class ADR_9005 accepted
  class ADR_9007 accepted
  class ADR_9015 accepted
  class ADR_121 ghost
  class ADR_177 ghost
  class ADR_218 ghost
  class ADR_299 ghost
  class ADR_316 ghost
  class ADR_412 ghost
  class ADR_422 ghost
  class ADR_650 ghost
  class ADR_1046 ghost
  class ADR_1974 ghost
  class ADR_2036 ghost
  class ADR_2120 ghost
  class ADR_9008 ghost
  class ADR_9009 ghost
  class ADR_9011 ghost
```
