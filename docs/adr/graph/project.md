# ADR Topic: project

8 ADRs in this topic. Solid nodes belong to `project`; gray dashed nodes are ghosts showing cross-topic references to help navigation.

Other topics: [overview](../graph.md).
```mermaid
flowchart TD
  subgraph project["project"]
    ADR_461["ADR-461<br/>Export Project as ZIP — `fflate` による OPFS エクスポート"]
    ADR_462["ADR-462<br/>Import Project from ZIP — `fflate` 再利用 + トップレベル除去"]
    ADR_740["ADR-740<br/>OPFS 履歴スナップショットを diff 比較ソースにする"]
    ADR_1302["ADR-1302<br/>Private vulnerability reporting を有効化する"]
    ADR_1783["ADR-1783<br/>karasu-nest — URL で .krs を共有・プレビューするホスト型機能"]
    ADR_1801["ADR-1801<br/>karasu-nest — 共有リンクの OGP 画像（system 図 unfurl）"]
    ADR_1809["ADR-1809<br/>プレイグラウンドを karasu.kompiro.dev カスタムドメインで公開する"]
    ADR_9006["ADR-9006<br/>プロジェクトとファイルシステム抽象化 — `FileSystemProvider` + OPFS"]
  end
  ADR_357["ADR-357<br/>[app-ui] ProjectSelector の Rename 操作 — インライン入力欄パターン"]
  ADR_650["ADR-650<br/>[app-ui] グラフィカル diff ビューア"]
  ADR_9013["ADR-9013<br/>[cli] CLI `karasu serve` モード — ローカル `.krs` のリアルタイムプレビュー"]
  ADR_9018["ADR-9018<br/>[app-ui] ProjectMode 初期コンテンツ — `examples/ec-platform` から..."]
  ADR_461 --> ADR_9006
  ADR_461 --> ADR_357
  ADR_462 --> ADR_357
  ADR_462 --> ADR_9018
  ADR_462 --> ADR_461
  ADR_740 --> ADR_650
  ADR_357 --> ADR_9006
  ADR_9013 --> ADR_9006

  classDef accepted fill:#d4edda,stroke:#28a745,color:#155724
  classDef proposed fill:#fff3cd,stroke:#ffc107,color:#856404
  classDef deprecated fill:#f8d7da,stroke:#dc3545,color:#721c24
  classDef superseded fill:#e2e3e5,stroke:#6c757d,color:#383d41
  classDef not_adopted fill:#e2e3e5,stroke:#6c757d,color:#383d41,stroke-dasharray:3 3
  classDef ghost fill:#f5f5f5,stroke:#adb5bd,color:#6c757d,stroke-dasharray:2 2
  class ADR_461 accepted
  class ADR_462 accepted
  class ADR_740 accepted
  class ADR_1302 accepted
  class ADR_1783 accepted
  class ADR_1801 accepted
  class ADR_1809 accepted
  class ADR_9006 accepted
  class ADR_357 ghost
  class ADR_650 ghost
  class ADR_9013 ghost
  class ADR_9018 ghost
```
