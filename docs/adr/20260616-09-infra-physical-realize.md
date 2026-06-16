---
id: ADR-20260616-09
title: deploy unit は共有 infra ノードを realize できる（store kind を新設）
status: accepted
date: 2026-06-16
topic: core-concepts
related_to:
  - ADR-20260405-05
scope:
  packages: [core]
assumptions:
  - "file: docs/spec/syntax.md"
  - "symbol: packages/core/src/types/ast.ts :: DeployNodeKind"
  - "grep: packages/core/src/resolver/warnings.ts :: detectUnresolvedRealizes"
---

# ADR-20260616-09: deploy unit は共有 infra ノードを realize できる（store kind を新設）

- **日付**: 2026-06-16
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#1632](https://github.com/kompiro/karasu/issues/1632)（物理層で infra を表現できるべきかの壁打ち）
  - 受け皿 Issue: [#1314](https://github.com/kompiro/karasu/issues/1314)（v1.0 spec freeze）
  - 設計経緯: Design Doc `docs/design/infra-physical-layer.md`（PR [#1645](https://github.com/kompiro/karasu/pull/1645)、本 ADR 昇格で削除）
  - 関連 ADR: [ADR-20260405-05](20260405-05-database-as-first-class-node.md)（database/queue/storage を論理層の first-class node に昇格）
  - spec: `docs/spec/syntax.md`（§Writing physical diagrams → Realizing shared infra）
  - コード: `packages/core/src/resolver/warnings.ts`（`detectUnresolvedRealizes`）, `packages/core/src/builtins/reference-data.ts`（`store` kind）

## 背景

infra block keyword（`database` / `queue` / `storage`）は [ADR-20260405-05](20260405-05-database-as-first-class-node.md) で
論理層の first-class node に昇格したが、**論理層にしか存在しなかった**。物理層は `deploy` block であり、その unit は
`realizes` で論理層に紐づくが、`realizes` の解決対象は `service` / `domain` の id に限定されており
（`detectUnresolvedRealizes`）、infra id を realize すると `unresolved-realizes` warning になっていた。

結果として「論理上の `database OrderDB` は本番では Aurora PostgreSQL として動く」のように、共有データストアの
*物理的な実体*（どの DBMS / managed 形態か）を表現する手段が無く、論理⇄物理の対応表で infra だけが
realize 対象外という非対称が残っていた。

## 決定

**deploy unit は共有 infra ノード（`database` / `queue` / `storage`）を `realizes` できる。マネージドデータストアの
物理実体を表す専用 deploy kind `store` を新設し、その自由記述プロパティ `type` で具体技術を記録する。**

- `realizes <infraId>` は valid（top-level の database/queue/storage、および system 内のそれら。leaf の
  `table` / `queue-item` / `bucket` は対象外）。
- `store` のプロパティは `["label", "type", "realizes"]`。`type` は `"Aurora PostgreSQL 15"` / `"Amazon SQS"` 等の
  **自由記述**で、controlled vocabulary は設けない。`runtime` / `schedule` は持たない。
- 既存 kind（`oci` 等）でも infra を realize できる（valid 化のみ）が、推奨スタイルは「マネージドストアは `store`」。
- 前方互換: これまで warning だった `realizes <infraId>` が valid になるだけで、既存ファイルは壊れない。

## 理由

- **「どの DBMS / managed 形態か」は論理層ではなく物理層（deployment 層）の関心**。PostgreSQL か MySQL か、
  RDS か Aurora かは「実プロダクトをどう動かすか」であり、`oci` が service を realize するのと対称に
  deploy が `realizes` で受け持つのが自然。infra だけ realize 対象外という非対称を解消する。
- **境界規定（ランタイム契約層）を越えない**。`docs/concepts.md` が対象外とするのはトポロジ（リージョン・AZ・
  クラスタ・ノード）であって、「どの concrete な形態がストアを裏付けるか」は `deploy` のランタイム契約層そのもの。
  「Aurora PostgreSQL 15 として動く」は「OCI image として動く」と同じ抽象度。
- **専用 `store` kind（B-2）で意図を明確化**。成果物 kind（`war` / `oci` …）に managed store を混ぜると kind の
  意味が薄れる。kind で区別することで deploy diagram の説明力が上がる。
- **`type` は自由記述**。controlled vocabulary を設けると managed service 種別の列挙からトポロジ寄りの
  構成記述に滑るため、`@deprecated(until:)` と同じく自由記述で受ける。

## 却下した案

- **案A 現状維持**（infra は論理層のみ）: 対応表の非対称と「この DB は本番で何か」への無回答が残る。
- **案B-1 既存 kind 流用**（`artifact` に `type` を書いて realize）: 文法追加ゼロだが、成果物寄りの kind 群に
  managed store が混じり意味が薄れる。
- **案C 一般的な managed kind を別途新設**: `store` に集約するより語彙が増える。`store` 1 つで database/queue/storage の
  物理実体を表現でき、具体は `type` で吸収できるため不要。
- **案D `[external]` 強化のみ**: boundary の内外という boolean しか表せず「RDS か Aurora か」を書けない。
- **controlled vocabulary な `type`**: managed service 種別の列挙はインフラ構成モデリングへの第一歩になり、
  ランタイム契約層の境界を侵食するため自由記述とした。
