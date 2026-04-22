---
id: ADR-20260405-05
title: "`database` / `queue` / `storage` を system 直下のファーストクラスノードに昇格"
status: accepted
date: 2026-04-05
scope:
  packages:
    - core
  domains:
    - parser
    - syntax
    - rendering
---

# ADR-20260405-05: `database` / `queue` / `storage` を system 直下のファーストクラスノードに昇格

- **日付**: 2026-04-05
- **ステータス**: 決定済み
- **関連**: Issue #316, `docs/spec/syntax.md`, `docs/concepts.md`

## 背景

これまでの karasu では `resource`（テーブル・キュー・ストレージ等）は `usecase` 配下にのみ存在できた（`system → service → domain → usecase → resource`）。しかし実際のアーキテクチャでは `resource` は次の二つの顔を持つ：

- **UseCase 図**: usecase が操作する依存先（実装詳細）
- **System 図**: service と並ぶインフラ構成要素（DB・キュー・外部 API）

この二重性を karasu の語彙とレンダリングでどう設計するかが問題だった。

## 決定

`database` / `queue` / `storage` を `service`・`user` と同階層の system 直下ノードとして導入し、`usecase` 内では `resource DatabaseId.TableId` のドット記法で参照する。種別ごとのサブリソース名は：

| system 直下の種別 | サブリソース | 参照例 |
|---|---|---|
| `database` | `table` | `resource OrderDB.OrderTable` |
| `queue` | `queue` | `resource EventBus.OrderCreated` |
| `storage` | `bucket` | `resource MediaStorage.ImageBucket` |

System 図では各 service の usecase の resource 参照を集約して `service → database` の暗黙エッジを自動導出する。

### ライフサイクルへの配慮

「usecase を書きながら resource を発見する」ボトムアップ設計を許容するため：

- `database` 未宣言のまま `resource C` と書いた場合は警告のみ（エラーにしない、孤立ノードとして描画）
- 発見後に `database OrderDB { table C }` へグループ化し、`resource OrderDB.C` のドット記法に昇格する

## 理由

- **定義が一箇所に集まる**: `database` ブロックで定義を集約でき、`service` 直下に置く案のような「担当 domain」との概念コンフリクトが起きない
- **System 図に自然に現れる**: `database` は system 直下ノードなので System 図に自然に描画され、複数 service が同じ database を参照していれば共有関係が可視化される
- **ドット記法の統一性**: `ECommerce -> PaymentGateway.PaymentService`（クロスシステム参照）と同じ「親.子」所属表現と整合する
- **未割り当て resource を warning にとどめる**: karasu の "warn, don't error" ポリシーに従い、書きながら設計を詰めていくフローを阻害しない
- **二重性の扱い**: 案 A（暗黙プロモーション）のような「書けばすべて System 図に出る」方式は制御不能になるため、明示的な定義・参照分離が優る

## 却下した案

### 案A: 暗黙的プロモーション（`usecase` 内の `resource` を System 図に自動昇格）

DRY だが System 図に全 resource が出て制御不能になる。

### 案B: `resource` を `service` 直下で宣言 + ID 参照

`service` 直下に resource を置くと「担当 domain」との概念コンフリクトが起きる。定義が散らばる。

### `service` 直下の `database` 配置

`system` 直下のみとする。DB per service のケースも、system 図上で service と database の 1:1 対応として表現できる。
