# ADR Topic: adr-tooling

8 ADRs in this topic. Solid nodes belong to `adr-tooling`; gray dashed nodes are ghosts showing cross-topic references to help navigation.

Other topics: [overview](../graph.md).
```mermaid
flowchart TD
  subgraph adr-tooling["adr-tooling"]
    ADR_788["ADR-788<br/>ADR knowledge graph — machine-readable frontmat..."]
    ADR_808["ADR-808<br/>ADR 本文とフロントマター関係フィールドの整合性を validator の warning ..."]
    ADR_830["ADR-830<br/>ADR タイトルは OSS 化までは日本語で書く"]
    ADR_1077["ADR-1077<br/>ADR ツール用語彙の adr.config.json への外部化"]
    ADR_1357["ADR-1357<br/>TPL ツールを `@kompiro/tpl-tools` として外出しし、karasu から..."]
    ADR_1829["ADR-1829<br/>ADR から karasu 構造へリンクする permalink 規約（taka 短縮 + 必..."]
    ADR_1830["ADR-1830<br/>ADR→karasu permalink の検証は adr-tools の krs kind ..."]
    ADR_2092["ADR-2092<br/>TPL の reference-data 設定を `tpl.config.json` に分離し..."]
  end
  ADR_1077 --> ADR_788

  classDef accepted fill:#d4edda,stroke:#28a745,color:#155724
  classDef proposed fill:#fff3cd,stroke:#ffc107,color:#856404
  classDef deprecated fill:#f8d7da,stroke:#dc3545,color:#721c24
  classDef superseded fill:#e2e3e5,stroke:#6c757d,color:#383d41
  classDef not_adopted fill:#e2e3e5,stroke:#6c757d,color:#383d41,stroke-dasharray:3 3
  classDef ghost fill:#f5f5f5,stroke:#adb5bd,color:#6c757d,stroke-dasharray:2 2
  class ADR_788 accepted
  class ADR_808 accepted
  class ADR_830 accepted
  class ADR_1077 accepted
  class ADR_1357 accepted
  class ADR_1829 accepted
  class ADR_1830 accepted
  class ADR_2092 accepted
```
