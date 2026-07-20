# ADR Topic: vscode

7 ADRs in this topic. Solid nodes belong to `vscode`; gray dashed nodes are ghosts showing cross-topic references to help navigation.

Other topics: [overview](../graph.md).
```mermaid
flowchart TD
  subgraph vscode["vscode"]
    ADR_176["ADR-176<br/>VSCode Phase 3 — 独立 HTML Webview アーキテクチャ"]
    ADR_218["ADR-218<br/>VSCode Phase 3.5 — Webview ドリルダウンナビゲーション"]
    ADR_299["ADR-299<br/>VSCode プレビュー Icon Mode トグル — Extension Host 管理 ..."]
    ADR_863["ADR-863<br/>VS Code 拡張ホスト向け smoke test harness"]
    ADR_1316["ADR-1316<br/>VS Code 拡張を Entra ID + GitHub OIDC（managed iden..."]
    ADR_1417["ADR-1417<br/>LSP / CLI の i18n — 互換ブリッジ廃止と @karasu-tools/i18n..."]
    ADR_9014["ADR-9014<br/>VSCode 拡張 — LSP-first アーキテクチャと段階的フェーズ計画"]
  end
  ADR_30["ADR-30<br/>[renderer] アイコンモード — SVG アイコンによるノード表示切り替え"]
  ADR_34["ADR-34<br/>[chat-ai] i18n ロールアウト — 英語 / 日本語の UI・診断・Chat"]
  ADR_177["ADR-177<br/>[navigation] ノードクリック UX — ドリルダウンと Cmd/Ctrl+Click エディタジャンプ"]
  ADR_9007["ADR-9007<br/>[renderer] インタラクティブ SVG レンダリングと NodeDetailPanel"]
  ADR_176 --> ADR_9014
  ADR_218 --> ADR_176
  ADR_218 --> ADR_9007
  ADR_299 --> ADR_30
  ADR_299 --> ADR_9014
  ADR_1417 --> ADR_34
  ADR_177 --> ADR_9007
  ADR_177 --> ADR_218

  classDef accepted fill:#d4edda,stroke:#28a745,color:#155724
  classDef proposed fill:#fff3cd,stroke:#ffc107,color:#856404
  classDef deprecated fill:#f8d7da,stroke:#dc3545,color:#721c24
  classDef superseded fill:#e2e3e5,stroke:#6c757d,color:#383d41
  classDef not_adopted fill:#e2e3e5,stroke:#6c757d,color:#383d41,stroke-dasharray:3 3
  classDef ghost fill:#f5f5f5,stroke:#adb5bd,color:#6c757d,stroke-dasharray:2 2
  class ADR_176 accepted
  class ADR_218 accepted
  class ADR_299 accepted
  class ADR_863 accepted
  class ADR_1316 accepted
  class ADR_1417 accepted
  class ADR_9014 accepted
  class ADR_30 ghost
  class ADR_34 ghost
  class ADR_177 ghost
  class ADR_9007 ghost
```
