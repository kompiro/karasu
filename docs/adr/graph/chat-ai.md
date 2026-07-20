# ADR Topic: chat-ai

10 ADRs in this topic. Solid nodes belong to `chat-ai`; gray dashed nodes are ghosts showing cross-topic references to help navigation.

Other topics: [overview](../graph.md).
```mermaid
flowchart TD
  subgraph chat-ai["chat-ai"]
    ADR_34["ADR-34<br/>i18n ロールアウト — 英語 / 日本語の UI・診断・Chat"]
    ADR_362["ADR-362<br/>Chat UI Panel — 全体アーキテクチャと Phase 1 レイアウト"]
    ADR_363["ADR-363<br/>Chat UI AI 設計レビュー — プロンプト駆動 + トリガー二系統"]
    ADR_419["ADR-419<br/>Chat UI Phase 2 — BYOK + AI 統合の実装方針"]
    ADR_420["ADR-420<br/>Chat UI Phase 3 — 構造化インタビュープロンプトの実装方針"]
    ADR_529["ADR-529<br/>Playwright と AI による視覚レビューの併用"]
    ADR_639["ADR-639<br/>Chat システムプロンプトの i18n — ロケール検出とプロンプト選択"]
    ADR_1580["ADR-1580<br/>組織グラフと解決済み ownerIndex を AI チャットプロンプトにシリアライズする"]
    ADR_1895["ADR-1895<br/>アーキテクチャリバースハーネス — multi-subagent fan-out + CLI ..."]
    ADR_9017["ADR-9017<br/>Cloudflare Pages デプロイ基盤と BYOK AI 連携"]
  end
  ADR_33["ADR-33<br/>[testing] E2EテストよりQA手動確認を優先する"]
  ADR_813["ADR-813<br/>[app-ui] ユーザー向け文字列はデフォルトで i18n を通す"]
  ADR_1417["ADR-1417<br/>[vscode] LSP / CLI の i18n — 互換ブリッジ廃止と @karasu-tools/i18n..."]
  ADR_1583["ADR-1583<br/>[core-concepts] team アノテーション対応と `@migration_target` による primary..."]
  ADR_34 --> ADR_639
  ADR_362 --> ADR_9017
  ADR_363 --> ADR_362
  ADR_363 --> ADR_420
  ADR_419 --> ADR_362
  ADR_419 --> ADR_9017
  ADR_420 --> ADR_419
  ADR_420 --> ADR_362
  ADR_1580 --> ADR_1583
  ADR_813 --> ADR_34
  ADR_1417 --> ADR_34
  ADR_529 -.supersedes.-> ADR_33

  classDef accepted fill:#d4edda,stroke:#28a745,color:#155724
  classDef proposed fill:#fff3cd,stroke:#ffc107,color:#856404
  classDef deprecated fill:#f8d7da,stroke:#dc3545,color:#721c24
  classDef superseded fill:#e2e3e5,stroke:#6c757d,color:#383d41
  classDef not_adopted fill:#e2e3e5,stroke:#6c757d,color:#383d41,stroke-dasharray:3 3
  classDef ghost fill:#f5f5f5,stroke:#adb5bd,color:#6c757d,stroke-dasharray:2 2
  class ADR_34 accepted
  class ADR_362 accepted
  class ADR_363 accepted
  class ADR_419 accepted
  class ADR_420 accepted
  class ADR_529 accepted
  class ADR_639 accepted
  class ADR_1580 accepted
  class ADR_1895 accepted
  class ADR_9017 accepted
  class ADR_33 ghost
  class ADR_813 ghost
  class ADR_1417 ghost
  class ADR_1583 ghost
```
