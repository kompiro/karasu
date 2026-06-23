---
id: ADR-20260623-04
title: "vector store / search index は `database` の `[index]` タグで表す（新 infra kind を増やさない）"
status: accepted
date: 2026-06-23
topic: core-concepts
related_to: [ADR-20260405-05]
scope:
  packages:
    - core
assumptions:
  - "symbol: packages/core/src/types/ast.ts :: INFRA_BLOCK_KINDS"
  - "file: packages/core/src/builtins/default-style.ts"
  - "file: docs/spec/tags-annotations.md"
---

# ADR-20260623-04: vector store / search index は `database` の `[index]` タグで表す（新 infra kind を増やさない）

- **日付**: 2026-06-23
- **ステータス**: 決定済み
- **関連**: Issue #1718, PR #1727, [ADR-20260405-05](20260405-05-database-as-first-class-node.md)（`database`/`queue`/`storage` を first-class 化）, `docs/spec/{syntax,tags-annotations}.md`

## 背景

ElasticSearch / OpenSearch やベクトルストア（pgvector, Pinecone, Weaviate, …）を karasu で書くとき、論理 infra 語彙は `database` / `queue` / `storage` の 3 種しかなく（[ADR-20260405-05](20260405-05-database-as-first-class-node.md)）、これらは `database` に押し込むしかなかった。RAG / LLM 構成の普及でこれらが頻出し、「正本（system of record）を持つ `database` と、検索用の派生 index は別物として扱うべきか」が問われた。

検討の結果、この問いは **2 つの異なる区別**を束ねていることが分かった:

- **技術の区別**（ElasticSearch か pgvector か）— karasu では既に **物理層 `store { type "..." }`** が realize する場所がある。論理層は技術非依存に保つ設計。
- **役割の区別**（正本 vs 正本から導出された二次インデックス）— これが本質的な論点。

## 決定

vector store / search index を **新しい論理 infra kind にはしない**。代わりに、`database` に付与する **`[index]` タグ**で「派生の検索 / 二次インデックスである」という**役割**を表す（`database SearchIndex [index] { ... }`）。

- `[index]` は **役割であって技術ではない**: 正本を高速に検索するために導出した二次ストアに付ける。Vector DB / ElasticSearch を使っていても、それが正本なら `[index]` は付けず素の `database` とする。同じストアが正本かつ index を兼ねる場合（Postgres + pgvector）も付けない。
- 具体技術は引き続き物理層 `store { type "ElasticSearch 8"; realizes SearchIndex }` で表す。
- 効果: `database[index]` は `index` バッジを付与する（cylinder シェイプは維持）。受理される語彙は効果を持つ（[TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md)）。

採用にあたり、次の**判断基準**を置く:

> 論理 infra kind を増やすのは、それが system 図に描くべき**固有の「相互作用の形（interaction shape）」**を表すときに限る（`database`=ストア、`queue`=pub/sub、`storage`=blob）。技術の違いは物理 `store { type }`、同一ストアの役割違い（正本 / 派生）は構造か修飾で表す。

## 理由

- **境界クリープの回避**: `index` を kind にすると「では cache（Redis）/ graph DB / time-series は？」が連鎖し、ADR-20260405-05 が 3 種に絞った判断と逆行する。タグなら語彙集合を増やさない。
- **「ストア ≠ 役割」への適合**: pgvector / Postgres FTS では同じ DB が正本かつ index。kind 分割は無理なノード分割を強いるが、opt-in タグなら付けない選択で自然に表現できる。
- **論理/物理分離の維持**: 「vector store」はしばしば技術の言い換え。技術を論理 kind に焼き込むと、エンジン載せ替えで論理モデルが揺れる。技術は物理層に隔離する。
- **効果がある**: 単なるラベルではなく `index` バッジという描画効果を持つため、TPL-20260610-01 を満たす。

## 却下した案

### 案A: 新語彙を足さない（`database` のまま、技術は物理 `store`、派生はエッジ/構造で表現）

論理/物理分離には最も忠実だが、「正本ではなく派生 index」という役割が**語彙として一切可視化されない**（自由記述頼み）。読者が system 図で区別できない。

### 案B: 新しい論理 infra kind を追加（`index` / `search` / `vector-store`）

専用 shape で最も直感的だが、**境界クリープ**（cache/graph/time-series の連鎖）と **pgvector の「同一 DB が正本かつ index」を分割で壊す**コスト、実装面積（parser〜renderer〜reference-data〜shape-tag〜TPL）が、得られる専用 shape の価値を上回る。

## 補足（follow-up）

本 ADR の範囲外として次を残す（Issue 化）:

- `index-without-source` 診断（派生 index が参照元の正本を持たない場合の info 警告）。
- `shared-infra-fan-in` smell から `[index]` ストアを除外すべきか。
