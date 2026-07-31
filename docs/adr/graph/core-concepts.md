# ADR Topic: core-concepts

19 ADRs in this topic. Solid nodes belong to `core-concepts`; gray dashed nodes are ghosts showing cross-topic references to help navigation.

Other topics: [overview](../graph.md).
```mermaid
flowchart TD
  subgraph core-concepts["core-concepts"]
    ADR_14["ADR-14<br/>Organization 図（organization / team / member）の追加"]
    ADR_309["ADR-309<br/>Org Tree View — 組織階層の左→右ツリー俯瞰図"]
    ADR_823["ADR-823<br/>クライアント / MCP を system 図でどう表現するか — `client` kind..."]
    ADR_832["ADR-832<br/>実行時認可（usecase レベルの authz）は karasu の語彙に取り込まない"]
    ADR_834["ADR-834<br/>セキュリティ／脅威モデリングは karasu の語彙に取り込まず companion docu..."]
    ADR_837["ADR-837<br/>client の capability 軸 — device / browser permis..."]
    ADR_1281["ADR-1281<br/>user.role キーワードは存続させ、spec で「authz primitive ではな..."]
    ADR_1386["ADR-1386<br/>karasu はスタイル流派を規定せず、流派が smell と呼ぶ構造は `info` 診断で..."]
    ADR_1564["ADR-1564<br/>service / domain の `team` プロパティを削除する"]
    ADR_1566["ADR-1566<br/>`duplicate-owner-assignment` を info（fact-vs-sty..."]
    ADR_1568["ADR-1568<br/>ライフサイクルアノテーションに移行 intent パラメータを持たせる"]
    ADR_1583["ADR-1583<br/>team アノテーション対応と `@migration_target` による primary..."]
    ADR_1632["ADR-1632<br/>deploy unit は共有 infra ノードを realize できる（store ki..."]
    ADR_1639["ADR-1639<br/>user は system-scoped とする（identity ではなく relation..."]
    ADR_1718["ADR-1718<br/>vector store / search index は `database` の `[in..."]
    ADR_1720["ADR-1720<br/>client は realizes / owns の対象になれる（valid-target に..."]
    ADR_1870["ADR-1870<br/>ドメインエンティティと関連のモデリング（v1）— 非目標「DB スキーマ」の線引き直し"]
    ADR_9002["ADR-9002<br/>ツール名「karasu」の採用"]
    ADR_9003["ADR-9003<br/>論理構造と物理構造の分離"]
  end
  ADR_237["ADR-237<br/>[resolver] Domain Drift Detection — 検出スコープと検出キー"]
  ADR_1580["ADR-1580<br/>[chat-ai] 組織グラフと解決済み ownerIndex を AI チャットプロンプトにシリアライズする"]
  ADR_1819["ADR-1819<br/>[resolver] infra leaf のドメイン所有を entity から導出し cross-domain ス..."]
  ADR_2075["ADR-2075<br/>[resolver] 宣言スコープで描画できない edge endpoint を診断する — peer はノードイン..."]
  ADR_9009["ADR-9009<br/>[app-ui] ツールバーボタンはアイコン+テキストラベル必須"]
  ADR_14 --> ADR_9003
  ADR_14 --> ADR_9009
  ADR_309 --> ADR_14
  ADR_1564 --> ADR_14
  ADR_1583 --> ADR_1566
  ADR_237 --> ADR_9003
  ADR_1580 --> ADR_1583
  ADR_1819 --> ADR_1870
  ADR_2075 --> ADR_1386

  classDef accepted fill:#d4edda,stroke:#28a745,color:#155724
  classDef proposed fill:#fff3cd,stroke:#ffc107,color:#856404
  classDef deprecated fill:#f8d7da,stroke:#dc3545,color:#721c24
  classDef superseded fill:#e2e3e5,stroke:#6c757d,color:#383d41
  classDef not_adopted fill:#e2e3e5,stroke:#6c757d,color:#383d41,stroke-dasharray:3 3
  classDef ghost fill:#f5f5f5,stroke:#adb5bd,color:#6c757d,stroke-dasharray:2 2
  class ADR_14 accepted
  class ADR_309 accepted
  class ADR_823 accepted
  class ADR_832 accepted
  class ADR_834 accepted
  class ADR_837 accepted
  class ADR_1281 accepted
  class ADR_1386 accepted
  class ADR_1564 accepted
  class ADR_1566 accepted
  class ADR_1568 accepted
  class ADR_1583 accepted
  class ADR_1632 accepted
  class ADR_1639 accepted
  class ADR_1718 accepted
  class ADR_1720 accepted
  class ADR_1870 accepted
  class ADR_9002 accepted
  class ADR_9003 accepted
  class ADR_237 ghost
  class ADR_1580 ghost
  class ADR_1819 ghost
  class ADR_2075 ghost
  class ADR_9009 ghost
```
