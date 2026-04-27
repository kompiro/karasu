# ADR Topic: chat-ai

8 ADRs in this topic. Solid nodes belong to `chat-ai`; gray dashed nodes are ghosts showing cross-topic references to help navigation.

Other topics: [overview](../graph.md).
```mermaid
flowchart TD
  subgraph chat-ai["chat-ai"]
    ADR_20260407_04["ADR-20260407-04<br/>Cloudflare Pages デプロイ基盤と BYOK AI 連携"]
    ADR_20260409_01["ADR-20260409-01<br/>Chat UI Phase 2 — BYOK + AI 統合の実装方針"]
    ADR_20260409_08["ADR-20260409-08<br/>Chat UI Panel — 全体アーキテクチャと Phase 1 レイアウト"]
    ADR_20260412_01["ADR-20260412-01<br/>Chat UI Phase 3 — 構造化インタビュープロンプトの実装方針"]
    ADR_20260412_05["ADR-20260412-05<br/>Playwright と AI による視覚レビューの併用"]
    ADR_20260418_01["ADR-20260418-01<br/>Chat システムプロンプトの i18n — ロケール検出とプロンプト選択"]
    ADR_20260420_03["ADR-20260420-03<br/>i18n ロールアウト — 英語 / 日本語の UI・診断・Chat"]
    ADR_20260422_02["ADR-20260422-02<br/>Chat UI AI 設計レビュー — プロンプト駆動 + トリガー二系統"]
  end
  ADR_20260324_01["ADR-20260324-01<br/>[testing] E2EテストよりQA手動確認を優先する"]
  ADR_20260425_01["ADR-20260425-01<br/>[app-ui] ユーザー向け文字列はデフォルトで i18n を通す"]
  ADR_20260409_01 --> ADR_20260409_08
  ADR_20260409_01 --> ADR_20260407_04
  ADR_20260409_08 --> ADR_20260407_04
  ADR_20260412_01 --> ADR_20260409_01
  ADR_20260412_01 --> ADR_20260409_08
  ADR_20260420_03 --> ADR_20260418_01
  ADR_20260422_02 --> ADR_20260409_08
  ADR_20260422_02 --> ADR_20260412_01
  ADR_20260425_01 --> ADR_20260420_03
  ADR_20260412_05 -.supersedes.-> ADR_20260324_01

  classDef accepted fill:#d4edda,stroke:#28a745,color:#155724
  classDef proposed fill:#fff3cd,stroke:#ffc107,color:#856404
  classDef deprecated fill:#f8d7da,stroke:#dc3545,color:#721c24
  classDef superseded fill:#e2e3e5,stroke:#6c757d,color:#383d41
  classDef not_adopted fill:#e2e3e5,stroke:#6c757d,color:#383d41,stroke-dasharray:3 3
  classDef ghost fill:#f5f5f5,stroke:#adb5bd,color:#6c757d,stroke-dasharray:2 2
  class ADR_20260407_04 accepted
  class ADR_20260409_01 accepted
  class ADR_20260409_08 accepted
  class ADR_20260412_01 accepted
  class ADR_20260412_05 accepted
  class ADR_20260418_01 accepted
  class ADR_20260420_03 accepted
  class ADR_20260422_02 accepted
  class ADR_20260324_01 ghost
  class ADR_20260425_01 ghost
```
