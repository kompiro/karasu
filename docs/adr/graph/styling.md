# ADR Topic: styling

8 ADRs in this topic. Solid nodes belong to `styling`; gray dashed nodes are ghosts showing cross-topic references to help navigation.

Other topics: [overview](../graph.md).
```mermaid
flowchart TD
  subgraph styling["styling"]
    ADR_8["ADR-8<br/>ビルトインスタイルの一元化と構造化リファレンス"]
    ADR_108["ADR-108<br/>スタイル解決パイプラインの一元化"]
    ADR_517["ADR-517<br/>親サービスのアノテーションを子ノードに継承する"]
    ADR_969["ADR-969<br/>`.krs.style` 側の `column` で layer 内 x 配置を上書きする e..."]
    ADR_999["ADR-999<br/>凡例 ref のフォールバック swatch（in-use なら描画する）"]
    ADR_1508["ADR-1508<br/>組み込みアノテーションバッジラベルは reference-data から生成し locale ..."]
    ADR_1755["ADR-1755<br/>`.krs.style` に始点 / 終点エッジセレクタ `edge[from=<id>]` ..."]
    ADR_9004["ADR-9004<br/>CSSインスパイアのスタイリングシステム"]
  end
  ADR_477["ADR-477<br/>[resolver] 移行期における重複ドメイン ID の共存を `@deprecated` + `@migrati..."]
  ADR_1296["ADR-1296<br/>[build] in-app Reference データを `reference-data.ts` に集約し、..."]
  ADR_108 --> ADR_9004
  ADR_108 --> ADR_8
  ADR_517 --> ADR_477
  ADR_1296 --> ADR_8

  classDef accepted fill:#d4edda,stroke:#28a745,color:#155724
  classDef proposed fill:#fff3cd,stroke:#ffc107,color:#856404
  classDef deprecated fill:#f8d7da,stroke:#dc3545,color:#721c24
  classDef superseded fill:#e2e3e5,stroke:#6c757d,color:#383d41
  classDef not_adopted fill:#e2e3e5,stroke:#6c757d,color:#383d41,stroke-dasharray:3 3
  classDef ghost fill:#f5f5f5,stroke:#adb5bd,color:#6c757d,stroke-dasharray:2 2
  class ADR_8 accepted
  class ADR_108 accepted
  class ADR_517 accepted
  class ADR_969 accepted
  class ADR_999 accepted
  class ADR_1508 accepted
  class ADR_1755 accepted
  class ADR_9004 accepted
  class ADR_477 ghost
  class ADR_1296 ghost
```
