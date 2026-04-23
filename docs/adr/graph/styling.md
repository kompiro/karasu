# ADR Topic: styling

4 ADRs in this topic. Solid nodes belong to `styling`; gray dashed nodes are ghosts showing cross-topic references to help navigation.

Other topics: [overview](../graph.md).
```mermaid
flowchart TD
  subgraph styling["styling"]
    ADR_20260312_04["ADR-20260312-04<br/>CSSインスパイアのスタイリングシステム"]
    ADR_20260322_01["ADR-20260322-01<br/>ビルトインスタイルの一元化と構造化リファレンス"]
    ADR_20260328_01["ADR-20260328-01<br/>スタイル解決パイプラインの一元化"]
    ADR_20260415_01["ADR-20260415-01<br/>親サービスのアノテーションを子ノードに継承する"]
  end
  ADR_20260411_02["ADR-20260411-02<br/>[resolver] 移行期における重複ドメイン ID の共存を `@deprecated` + `@migrati..."]
  ADR_20260415_01 --> ADR_20260411_02

  classDef accepted fill:#d4edda,stroke:#28a745,color:#155724
  classDef proposed fill:#fff3cd,stroke:#ffc107,color:#856404
  classDef deprecated fill:#f8d7da,stroke:#dc3545,color:#721c24
  classDef superseded fill:#e2e3e5,stroke:#6c757d,color:#383d41
  classDef not_adopted fill:#e2e3e5,stroke:#6c757d,color:#383d41,stroke-dasharray:3 3
  classDef ghost fill:#f5f5f5,stroke:#adb5bd,color:#6c757d,stroke-dasharray:2 2
  class ADR_20260312_04 accepted
  class ADR_20260322_01 accepted
  class ADR_20260328_01 accepted
  class ADR_20260415_01 accepted
  class ADR_20260411_02 ghost
```
