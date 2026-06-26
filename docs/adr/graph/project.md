# ADR Topic: project

7 ADRs in this topic. Solid nodes belong to `project`; gray dashed nodes are ghosts showing cross-topic references to help navigation.

Other topics: [overview](../graph.md).
```mermaid
flowchart TD
  subgraph project["project"]
    ADR_20260317_02["ADR-20260317-02<br/>プロジェクトとファイルシステム抽象化 — `FileSystemProvider` + OPFS"]
    ADR_20260411_06["ADR-20260411-06<br/>Export Project as ZIP — `fflate` による OPFS エクスポート"]
    ADR_20260412_03["ADR-20260412-03<br/>Import Project from ZIP — `fflate` 再利用 + トップレベル除去"]
    ADR_20260422_07["ADR-20260422-07<br/>OPFS 履歴スナップショットを diff 比較ソースにする"]
    ADR_20260624_05["ADR-20260624-05<br/>Private vulnerability reporting を有効化する"]
    ADR_20260626_01["ADR-20260626-01<br/>karasu-nest — URL で .krs を共有・プレビューするホスト型機能"]
    ADR_20260626_03["ADR-20260626-03<br/>プレイグラウンドを karasu.kompiro.dev カスタムドメインで公開する"]
  end
  ADR_20260328_04["ADR-20260328-04<br/>[cli] CLI `karasu serve` モード — ローカル `.krs` のリアルタイムプレビュー"]
  ADR_20260407_03["ADR-20260407-03<br/>[app-ui] ProjectSelector の Rename 操作 — インライン入力欄パターン"]
  ADR_20260408_03["ADR-20260408-03<br/>[app-ui] ProjectMode 初期コンテンツ — `examples/ec-platform` から..."]
  ADR_20260420_02["ADR-20260420-02<br/>[app-ui] グラフィカル diff ビューア"]
  ADR_20260411_06 --> ADR_20260317_02
  ADR_20260411_06 --> ADR_20260407_03
  ADR_20260412_03 --> ADR_20260407_03
  ADR_20260412_03 --> ADR_20260408_03
  ADR_20260412_03 --> ADR_20260411_06
  ADR_20260422_07 --> ADR_20260420_02
  ADR_20260328_04 --> ADR_20260317_02
  ADR_20260407_03 --> ADR_20260317_02

  classDef accepted fill:#d4edda,stroke:#28a745,color:#155724
  classDef proposed fill:#fff3cd,stroke:#ffc107,color:#856404
  classDef deprecated fill:#f8d7da,stroke:#dc3545,color:#721c24
  classDef superseded fill:#e2e3e5,stroke:#6c757d,color:#383d41
  classDef not_adopted fill:#e2e3e5,stroke:#6c757d,color:#383d41,stroke-dasharray:3 3
  classDef ghost fill:#f5f5f5,stroke:#adb5bd,color:#6c757d,stroke-dasharray:2 2
  class ADR_20260317_02 accepted
  class ADR_20260411_06 accepted
  class ADR_20260412_03 accepted
  class ADR_20260422_07 accepted
  class ADR_20260624_05 accepted
  class ADR_20260626_01 accepted
  class ADR_20260626_03 accepted
  class ADR_20260328_04 ghost
  class ADR_20260407_03 ghost
  class ADR_20260408_03 ghost
  class ADR_20260420_02 ghost
```
