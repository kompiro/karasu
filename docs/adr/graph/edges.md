# ADR Topic: edges

15 ADRs in this topic. Solid nodes belong to `edges`; gray dashed nodes are ghosts showing cross-topic references to help navigation.

Other topics: [overview](../graph.md).
```mermaid
flowchart TD
  subgraph edges["edges"]
    ADR_285["ADR-285<br/>クロスシステムサービス参照 — ドット記法（`SystemId.ServiceId`）"]
    ADR_445["ADR-445<br/>Domain 間エッジと `[implicit]` 自動タグによる暗黙サービスエッジ"]
    ADR_460["ADR-460<br/>サービスドリルダウンビューでの Ghost Domain エッジ表示"]
    ADR_463["ADR-463<br/>集約された暗黙エッジの詳細パネル — SVG 属性埋め込み方式"]
    ADR_510["ADR-510<br/>Implicit エッジにおける sync/async の視覚的区別"]
    ADR_968["ADR-968<br/>Skip-layer エッジの直交チャネルルーティング"]
    ADR_1064["ADR-1064<br/>エッジの border-style に dotted を追加してユーザーが第3の線スタイル軸を..."]
    ADR_1096["ADR-1096<br/>`.krs.style` の `edge#<id>` セレクタ — base ID + opt..."]
    ADR_1135["ADR-1135<br/>edge `direction: left` / `direction: right` の l..."]
    ADR_1184["ADR-1184<br/>edge `label-position` / `label-offset` プロパティ — ..."]
    ADR_1185["ADR-1185<br/>同一ペア間の並列エッジ束ね"]
    ADR_1492["ADR-1492<br/>stroke-style をエッジ線スタイルの正準プロパティとして採用する"]
    ADR_1554["ADR-1554<br/>エッジコンテキストメニューへの authored ラベル表示と data-edge-label..."]
    ADR_1911["ADR-1911<br/>エンティティビューの cross-domain 関連は限定子付き参照 + ghost で表示する"]
    ADR_9019["ADR-9019<br/>`.krs.style` の edge `direction` プロパティ — 矢印の流れる向..."]
  end
  ADR_281["ADR-281<br/>[parser] ワイルドカードインポートと2パス解決の採用"]
  ADR_1142["ADR-1142<br/>[app-ui] GUI 駆動の `.krs.style` 編集 — 単一プロパティ rule は in-pla..."]
  ADR_285 --> ADR_281
  ADR_460 --> ADR_445
  ADR_463 --> ADR_445
  ADR_510 --> ADR_445
  ADR_1096 --> ADR_1142
  ADR_1135 --> ADR_9019
  ADR_1911 --> ADR_460
  ADR_9019 --> ADR_1142
  ADR_9019 --> ADR_1096

  classDef accepted fill:#d4edda,stroke:#28a745,color:#155724
  classDef proposed fill:#fff3cd,stroke:#ffc107,color:#856404
  classDef deprecated fill:#f8d7da,stroke:#dc3545,color:#721c24
  classDef superseded fill:#e2e3e5,stroke:#6c757d,color:#383d41
  classDef not_adopted fill:#e2e3e5,stroke:#6c757d,color:#383d41,stroke-dasharray:3 3
  classDef ghost fill:#f5f5f5,stroke:#adb5bd,color:#6c757d,stroke-dasharray:2 2
  class ADR_285 accepted
  class ADR_445 accepted
  class ADR_460 accepted
  class ADR_463 accepted
  class ADR_510 accepted
  class ADR_968 accepted
  class ADR_1064 accepted
  class ADR_1096 accepted
  class ADR_1135 accepted
  class ADR_1184 accepted
  class ADR_1185 accepted
  class ADR_1492 accepted
  class ADR_1554 accepted
  class ADR_1911 accepted
  class ADR_9019 accepted
  class ADR_281 ghost
  class ADR_1142 ghost
```
