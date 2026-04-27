# ADR Topic: build

18 ADRs in this topic. Solid nodes belong to `build`; gray dashed nodes are ghosts showing cross-topic references to help navigation.

Other topics: [overview](../graph.md).
```mermaid
flowchart TD
  subgraph build["build"]
    ADR_20260312_01["ADR-20260312-01<br/>モノレポ構成の採用"]
    ADR_20260326_01["ADR-20260326-01<br/>Main Branch Health Strategy"]
    ADR_20260329_01["ADR-20260329-01<br/>Dependency Update Automation with Dependabot"]
    ADR_20260330_01["ADR-20260330-01<br/>Major Dependency Updates — March 2026"]
    ADR_20260331_01["ADR-20260331-01<br/>Dependency Updates — 2026-03-31"]
    ADR_20260401_01["ADR-20260401-01<br/>Adopt marked for Markdown rendering and chokida..."]
    ADR_20260404_01["ADR-20260404-01<br/>Do not migrate to Bun"]
    ADR_20260404_02["ADR-20260404-02<br/>Do not rename Claude session to feature name in..."]
    ADR_20260404_06["ADR-20260404-06<br/>GitHub Markdown レンダリングサービス — `serve.ts` の `/ren..."]
    ADR_20260405_01["ADR-20260405-01<br/>npm パッケージスコープを @karasu-tools/* に変更"]
    ADR_20260407_01["ADR-20260407-01<br/>Dependency Updates — 2026-04-07"]
    ADR_20260408_01["ADR-20260408-01<br/>Trunk-Based Development with Release Toggles"]
    ADR_20260413_01["ADR-20260413-01<br/>Preview workflow はラベル駆動をやめ path filter で制御する"]
    ADR_20260414_01["ADR-20260414-01<br/>Dependabot Batch Triage (2026-04-14)"]
    ADR_20260416_01["ADR-20260416-01<br/>DOMPurify Adoption for HTML Sanitization"]
    ADR_20260421_01["ADR-20260421-01<br/>Dependency Updates — 2026-04-20"]
    ADR_20260422_01["ADR-20260422-01<br/>Dependency Updates — 2026-04-21"]
    ADR_20260427_01["ADR-20260427-01<br/>Feature toggle policy — compile-time, short-liv..."]
  end

  classDef accepted fill:#d4edda,stroke:#28a745,color:#155724
  classDef proposed fill:#fff3cd,stroke:#ffc107,color:#856404
  classDef deprecated fill:#f8d7da,stroke:#dc3545,color:#721c24
  classDef superseded fill:#e2e3e5,stroke:#6c757d,color:#383d41
  classDef not_adopted fill:#e2e3e5,stroke:#6c757d,color:#383d41,stroke-dasharray:3 3
  classDef ghost fill:#f5f5f5,stroke:#adb5bd,color:#6c757d,stroke-dasharray:2 2
  class ADR_20260312_01 accepted
  class ADR_20260326_01 accepted
  class ADR_20260329_01 accepted
  class ADR_20260330_01 accepted
  class ADR_20260331_01 accepted
  class ADR_20260401_01 accepted
  class ADR_20260404_01 not_adopted
  class ADR_20260404_02 not_adopted
  class ADR_20260404_06 accepted
  class ADR_20260405_01 accepted
  class ADR_20260407_01 accepted
  class ADR_20260408_01 accepted
  class ADR_20260413_01 accepted
  class ADR_20260414_01 accepted
  class ADR_20260416_01 accepted
  class ADR_20260421_01 accepted
  class ADR_20260422_01 accepted
  class ADR_20260427_01 accepted
```
