# ADR Topic: testing

13 ADRs in this topic. Solid nodes belong to `testing`; gray dashed nodes are ghosts showing cross-topic references to help navigation.

Other topics: [overview](../graph.md).
```mermaid
flowchart TD
  subgraph testing["testing"]
    ADR_33["ADR-33<br/>E2EテストよりQA手動確認を優先する"]
    ADR_40["ADR-40<br/>コンポーネントテストに @testing-library/react を採用する"]
    ADR_165["ADR-165<br/>モノレポ内 vitest の配置 — ルート install ではなく workspace d..."]
    ADR_862["ADR-862<br/>Playwright 向け OPFS fixture ヘルパー"]
    ADR_864["ADR-864<br/>Chat UI E2E は Playwright route で Anthropic API ..."]
    ADR_916["ADR-916<br/>受け入れテストの自動化マーカー規約と検出スクリプト"]
    ADR_926["ADR-926<br/>VS Code WebView の DOM 系テストはマニュアル運用とする"]
    ADR_1008["ADR-1008<br/>flaky な E2E テストは test.fixme でマークし追跡 Issue を立てる"]
    ADR_1014["ADR-1014<br/>VS Code WebView の DOM 系テストは ExTester ハーネスで自動化する"]
    ADR_1192["ADR-1192<br/>テスト観点ライブラリ（Test Perspective Library, TPL）の運用開始"]
    ADR_2045["ADR-2045<br/>QA 手動チェックリスト生成のマーカー対応と 3-way triage"]
    ADR_2348["ADR-2348<br/>AT レコードは Design Doc ではなく Issue を指す — 削除が規約で確定して..."]
    ADR_9012["ADR-9012<br/>`packages/app` のテスト戦略 — `@testing-library/react..."]
  end
  ADR_529["ADR-529<br/>[chat-ai] Playwright と AI による視覚レビューの併用"]
  ADR_9012 --> ADR_40
  ADR_1014 -.supersedes.-> ADR_926
  ADR_529 -.supersedes.-> ADR_33

  classDef accepted fill:#d4edda,stroke:#28a745,color:#155724
  classDef proposed fill:#fff3cd,stroke:#ffc107,color:#856404
  classDef deprecated fill:#f8d7da,stroke:#dc3545,color:#721c24
  classDef superseded fill:#e2e3e5,stroke:#6c757d,color:#383d41
  classDef not_adopted fill:#e2e3e5,stroke:#6c757d,color:#383d41,stroke-dasharray:3 3
  classDef ghost fill:#f5f5f5,stroke:#adb5bd,color:#6c757d,stroke-dasharray:2 2
  class ADR_33 superseded
  class ADR_40 accepted
  class ADR_165 accepted
  class ADR_862 accepted
  class ADR_864 accepted
  class ADR_916 accepted
  class ADR_926 superseded
  class ADR_1008 accepted
  class ADR_1014 accepted
  class ADR_1192 accepted
  class ADR_2045 accepted
  class ADR_2348 accepted
  class ADR_9012 accepted
  class ADR_529 ghost
```
