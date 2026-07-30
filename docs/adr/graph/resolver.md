# ADR Topic: resolver

8 ADRs in this topic. Solid nodes belong to `resolver`; gray dashed nodes are ghosts showing cross-topic references to help navigation.

Other topics: [overview](../graph.md).
```mermaid
flowchart TD
  subgraph resolver["resolver"]
    ADR_237["ADR-237<br/>Domain Drift Detection — 検出スコープと検出キー"]
    ADR_287["ADR-287<br/>循環依存の検出と `KrsEdge.cyclic` フラグによる視覚化"]
    ADR_316["ADR-316<br/>`database` / `queue` / `storage` を system 直下のファ..."]
    ADR_477["ADR-477<br/>移行期における重複ドメイン ID の共存を `@deprecated` + `@migrati..."]
    ADR_1381["ADR-1381<br/>マルチファイル import の意味論 — whole-file import / syste..."]
    ADR_1570["ADR-1570<br/>共有 infra fan-in を info 診断として通知する"]
    ADR_1819["ADR-1819<br/>infra leaf のドメイン所有を entity から導出し cross-domain ス..."]
    ADR_2184["ADR-2184<br/>同じモデリング状態を表す配置には同じ診断を出す — `system` 直下の domain に..."]
  end
  ADR_351["ADR-351<br/>[renderer] resource shape 自動推論とインフラノード Icon Mode 対応"]
  ADR_496["ADR-496<br/>[parser] ブロック内エッジの暗黙 source 簡略記法"]
  ADR_517["ADR-517<br/>[styling] 親サービスのアノテーションを子ノードに継承する"]
  ADR_702["ADR-702<br/>[renderer] トップレベル infra ブロック（database / queue / storage）を ..."]
  ADR_1314["ADR-1314<br/>[build] .krs / .krs.style を v1.0 として凍結する（ハイブリッド版管理）"]
  ADR_1870["ADR-1870<br/>[core-concepts] ドメインエンティティと関連のモデリング（v1）— 非目標「DB スキーマ」の線引き直し"]
  ADR_2165["ADR-2165<br/>[parser] 論理ノードの containment 規則は `canContain` を唯一の定義とし、違反..."]
  ADR_9003["ADR-9003<br/>[core-concepts] 論理構造と物理構造の分離"]
  ADR_237 --> ADR_9003
  ADR_1819 --> ADR_1870
  ADR_1819 --> ADR_316
  ADR_2184 --> ADR_2165
  ADR_2184 --> ADR_1314
  ADR_351 --> ADR_316
  ADR_496 --> ADR_477
  ADR_517 --> ADR_477
  ADR_702 --> ADR_316
  ADR_2165 --> ADR_1314

  classDef accepted fill:#d4edda,stroke:#28a745,color:#155724
  classDef proposed fill:#fff3cd,stroke:#ffc107,color:#856404
  classDef deprecated fill:#f8d7da,stroke:#dc3545,color:#721c24
  classDef superseded fill:#e2e3e5,stroke:#6c757d,color:#383d41
  classDef not_adopted fill:#e2e3e5,stroke:#6c757d,color:#383d41,stroke-dasharray:3 3
  classDef ghost fill:#f5f5f5,stroke:#adb5bd,color:#6c757d,stroke-dasharray:2 2
  class ADR_237 accepted
  class ADR_287 accepted
  class ADR_316 accepted
  class ADR_477 accepted
  class ADR_1381 accepted
  class ADR_1570 accepted
  class ADR_1819 accepted
  class ADR_2184 accepted
  class ADR_351 ghost
  class ADR_496 ghost
  class ADR_517 ghost
  class ADR_702 ghost
  class ADR_1314 ghost
  class ADR_1870 ghost
  class ADR_2165 ghost
  class ADR_9003 ghost
```
