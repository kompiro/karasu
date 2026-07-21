# ADR Topic: navigation

11 ADRs in this topic. Solid nodes belong to `navigation`; gray dashed nodes are ghosts showing cross-topic references to help navigation.

Other topics: [overview](../graph.md).
```mermaid
flowchart TD
  subgraph navigation["navigation"]
    ADR_110["ADR-110<br/>Permanent Link — `nodePathIndex` と URL hash の 2..."]
    ADR_177["ADR-177<br/>ノードクリック UX — ドリルダウンと Cmd/Ctrl+Click エディタジャンプ"]
    ADR_226["ADR-226<br/>Drill-down 収集ロジック統一 — `HierarchyNode` 型 + 高階関数"]
    ADR_278["ADR-278<br/>ブラウザ履歴ナビゲーション — URL hash による drill-down 同期"]
    ADR_321["ADR-321<br/>プロジェクト URL ナビゲーション — `/projects/<uuid>` パスネーム方式"]
    ADR_422["ADR-422<br/>クロスナビゲーション時のアトミックなハイライト適用"]
    ADR_425["ADR-425<br/>ブラウザ履歴でのハイライト復元 — hash コロン拡張"]
    ADR_429["ADR-429<br/>マルチファイルプロジェクトでのクロスファイルナビゲーション"]
    ADR_1094["ADR-1094<br/>ActiveView を追加するときは URL hash 対応もセットで行う"]
    ADR_1827["ADR-1827<br/>Deep permalink — 構造要素 / view への深いパーマリンク"]
    ADR_1828["ADR-1828<br/>repo-backed + ref-pinned permalink（nest Phase 2..."]
  end
  ADR_211["ADR-211<br/>[parser] `compile()` API 統一 — Discriminated Union による戻り値型"]
  ADR_218["ADR-218<br/>[vscode] VSCode Phase 3.5 — Webview ドリルダウンナビゲーション"]
  ADR_412["ADR-412<br/>[parser] トップレベル service の Named Import — スタブ補完 + エッジ参照によ..."]
  ADR_9007["ADR-9007<br/>[renderer] インタラクティブ SVG レンダリングと NodeDetailPanel"]
  ADR_177 --> ADR_9007
  ADR_177 --> ADR_218
  ADR_278 --> ADR_110
  ADR_321 --> ADR_278
  ADR_321 --> ADR_110
  ADR_422 --> ADR_9007
  ADR_425 --> ADR_422
  ADR_425 --> ADR_278
  ADR_429 --> ADR_412
  ADR_429 --> ADR_211
  ADR_1828 --> ADR_1827
  ADR_218 --> ADR_9007

  classDef accepted fill:#d4edda,stroke:#28a745,color:#155724
  classDef proposed fill:#fff3cd,stroke:#ffc107,color:#856404
  classDef deprecated fill:#f8d7da,stroke:#dc3545,color:#721c24
  classDef superseded fill:#e2e3e5,stroke:#6c757d,color:#383d41
  classDef not_adopted fill:#e2e3e5,stroke:#6c757d,color:#383d41,stroke-dasharray:3 3
  classDef ghost fill:#f5f5f5,stroke:#adb5bd,color:#6c757d,stroke-dasharray:2 2
  class ADR_110 accepted
  class ADR_177 accepted
  class ADR_226 accepted
  class ADR_278 accepted
  class ADR_321 accepted
  class ADR_422 accepted
  class ADR_425 accepted
  class ADR_429 accepted
  class ADR_1094 accepted
  class ADR_1827 accepted
  class ADR_1828 accepted
  class ADR_211 ghost
  class ADR_218 ghost
  class ADR_412 ghost
  class ADR_9007 ghost
```
