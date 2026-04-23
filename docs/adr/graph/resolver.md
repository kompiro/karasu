# ADR Topic: resolver

4 ADRs in this topic. Solid nodes belong to `resolver`; gray dashed nodes are ghosts showing cross-topic references to help navigation.

Other topics: [overview](../graph.md).
```mermaid
flowchart TD
  subgraph resolver["resolver"]
    ADR_20260401_06["ADR-20260401-06<br/>Domain Drift Detection — Scope and Detection Key"]
    ADR_20260405_05["ADR-20260405-05<br/>`database` / `queue` / `storage` を system 直下のファ..."]
    ADR_20260405_06["ADR-20260405-06<br/>循環依存の検出と `KrsEdge.cyclic` フラグによる視覚化"]
    ADR_20260411_02["ADR-20260411-02<br/>移行期における重複ドメイン ID の共存を `@deprecated` + `@migrati..."]
  end
  ADR_20260312_03["ADR-20260312-03<br/>[core-concepts] 論理構造と物理構造の分離"]
  ADR_20260407_02["ADR-20260407-02<br/>[renderer] resource shape 自動推論とインフラノード Icon Mode 対応"]
  ADR_20260412_04["ADR-20260412-04<br/>[parser] ブロック内エッジの暗黙 source 簡略記法"]
  ADR_20260415_01["ADR-20260415-01<br/>[styling] 親サービスのアノテーションを子ノードに継承する"]
  ADR_20260422_05["ADR-20260422-05<br/>[renderer] トップレベル infra ブロック（database / queue / storage）を ..."]
  ADR_20260401_06 --> ADR_20260312_03
  ADR_20260407_02 --> ADR_20260405_05
  ADR_20260412_04 --> ADR_20260411_02
  ADR_20260415_01 --> ADR_20260411_02
  ADR_20260422_05 --> ADR_20260405_05

  classDef accepted fill:#d4edda,stroke:#28a745,color:#155724
  classDef proposed fill:#fff3cd,stroke:#ffc107,color:#856404
  classDef deprecated fill:#f8d7da,stroke:#dc3545,color:#721c24
  classDef superseded fill:#e2e3e5,stroke:#6c757d,color:#383d41
  classDef not_adopted fill:#e2e3e5,stroke:#6c757d,color:#383d41,stroke-dasharray:3 3
  classDef ghost fill:#f5f5f5,stroke:#adb5bd,color:#6c757d,stroke-dasharray:2 2
  class ADR_20260401_06 accepted
  class ADR_20260405_05 accepted
  class ADR_20260405_06 accepted
  class ADR_20260411_02 accepted
  class ADR_20260312_03 ghost
  class ADR_20260407_02 ghost
  class ADR_20260412_04 ghost
  class ADR_20260415_01 ghost
  class ADR_20260422_05 ghost
```
