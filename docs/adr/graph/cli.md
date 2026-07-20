# ADR Topic: cli

12 ADRs in this topic. Solid nodes belong to `cli`; gray dashed nodes are ghosts showing cross-topic references to help navigation.

Other topics: [overview](../graph.md).
```mermaid
flowchart TD
  subgraph cli["cli"]
    ADR_121["ADR-121<br/>CLI `karasu render` コマンド"]
    ADR_355["ADR-355<br/>CLI `karasu translate` コマンドと複数 realizes 対応"]
    ADR_464["ADR-464<br/>`karasu apply` サブコマンド — stdin + `applyKrsPatch`..."]
    ADR_469["ADR-469<br/>CLI 変更系サブコマンド — `karasu remove` / `append` / `i..."]
    ADR_643["ADR-643<br/>`translate --from openapi` のデフォルトをリソース単位の useca..."]
    ADR_644["ADR-644<br/>`translate --from db` のデフォルトを集約ルート単位のテーブル集約に変更する"]
    ADR_1020["ADR-1020<br/>`karasu diff` CLI と diff SVG の self-contained ス..."]
    ADR_1025["ADR-1025<br/>`karasu diff` の bundled all-views 出力"]
    ADR_1062["ADR-1062<br/>CRUD マトリクスビュー（usecase × resource）を派生プロジェクションとして..."]
    ADR_1104["ADR-1104<br/>translate adapter で usecase → resource バインディング ..."]
    ADR_1935["ADR-1935<br/>--from wrangler translate adapter と「adapter を採る基準」"]
    ADR_9013["ADR-9013<br/>CLI `karasu serve` モード — ローカル `.krs` のリアルタイムプレビュー"]
  end
  ADR_9006["ADR-9006<br/>[project] プロジェクトとファイルシステム抽象化 — `FileSystemProvider` + OPFS"]
  ADR_9015["ADR-9015<br/>[renderer] 全ビュー統合バンドル SVG（buildAllViewsSvg）"]
  ADR_121 --> ADR_9015
  ADR_355 --> ADR_121
  ADR_464 --> ADR_355
  ADR_469 --> ADR_464
  ADR_643 --> ADR_355
  ADR_644 --> ADR_355
  ADR_9013 --> ADR_9006

  classDef accepted fill:#d4edda,stroke:#28a745,color:#155724
  classDef proposed fill:#fff3cd,stroke:#ffc107,color:#856404
  classDef deprecated fill:#f8d7da,stroke:#dc3545,color:#721c24
  classDef superseded fill:#e2e3e5,stroke:#6c757d,color:#383d41
  classDef not_adopted fill:#e2e3e5,stroke:#6c757d,color:#383d41,stroke-dasharray:3 3
  classDef ghost fill:#f5f5f5,stroke:#adb5bd,color:#6c757d,stroke-dasharray:2 2
  class ADR_121 accepted
  class ADR_355 accepted
  class ADR_464 accepted
  class ADR_469 accepted
  class ADR_643 accepted
  class ADR_644 accepted
  class ADR_1020 accepted
  class ADR_1025 accepted
  class ADR_1062 accepted
  class ADR_1104 accepted
  class ADR_1935 accepted
  class ADR_9013 accepted
  class ADR_9006 ghost
  class ADR_9015 ghost
```
