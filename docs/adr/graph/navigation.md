# ADR Topic: navigation

8 ADRs in this topic. Solid nodes belong to `navigation`; gray dashed nodes are ghosts showing cross-topic references to help navigation.

Other topics: [overview](../graph.md).
```mermaid
flowchart TD
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
  ADR_20260320_01["ADR-20260320-01<br/>[renderer] インタラクティブ SVG レンダリングと NodeDetailPanel"]
  ADR_20260401_03["ADR-20260401-03<br/>[parser] `compile()` API 統一 — Discriminated Union による戻り値型"]
  ADR_20260401_05["ADR-20260401-05<br/>[vscode] VSCode Phase 3.5 — Webview ドリルダウンナビゲーション"]
  ADR_20260409_06["ADR-20260409-06<br/>[parser] トップレベル service の Named Import — スタブ補完 + エッジ参照によ..."]
  ADR_20260401_07 --> ADR_20260320_01
  ADR_20260401_07 --> ADR_20260401_05
  ADR_20260404_05 --> ADR_20260330_04
  ADR_20260405_08 --> ADR_20260404_05
  ADR_20260405_08 --> ADR_20260330_04
  ADR_20260409_03 --> ADR_20260320_01
  ADR_20260409_07 --> ADR_20260409_06
  ADR_20260409_07 --> ADR_20260401_03
  ADR_20260411_03 --> ADR_20260409_03
  ADR_20260411_03 --> ADR_20260404_05
  ADR_20260401_05 --> ADR_20260320_01

  classDef accepted fill:#d4edda,stroke:#28a745,color:#155724
  classDef proposed fill:#fff3cd,stroke:#ffc107,color:#856404
  classDef deprecated fill:#f8d7da,stroke:#dc3545,color:#721c24
  classDef superseded fill:#e2e3e5,stroke:#6c757d,color:#383d41
  classDef not_adopted fill:#e2e3e5,stroke:#6c757d,color:#383d41,stroke-dasharray:3 3
  classDef ghost fill:#f5f5f5,stroke:#adb5bd,color:#6c757d,stroke-dasharray:2 2
  class ADR_20260330_04 accepted
  class ADR_20260401_07 accepted
  class ADR_20260403_01 accepted
  class ADR_20260404_05 accepted
  class ADR_20260405_08 accepted
  class ADR_20260409_03 accepted
  class ADR_20260409_07 accepted
  class ADR_20260411_03 accepted
  class ADR_20260320_01 ghost
  class ADR_20260401_03 ghost
  class ADR_20260401_05 ghost
  class ADR_20260409_06 ghost
```
