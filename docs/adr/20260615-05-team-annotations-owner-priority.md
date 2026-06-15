---
id: ADR-20260615-05
title: "team アノテーション対応と `@migration_target` による primary owner 選択"
status: accepted
date: 2026-06-15
topic: core-concepts
depends_on:
  - ADR-20260615-01
related_to:
  - ADR-20260411-02
  - ADR-20260615-04
scope:
  packages: [core]
assumptions:
  - "symbol: packages/core/src/parser/parser.ts :: migrationPriority"
  - "grep: packages/core/src/types/ast.ts :: annotations: string\\[\\]"
  - "grep: packages/core/src/resolver/style-resolver.ts :: sel.annotations.every"
  - "file: docs/test-perspectives/TPL-20260615-01-migration-priority-index-winner.md"
---

# ADR-20260615-05: team アノテーション対応と `@migration_target` による primary owner 選択

- **日付**: 2026-06-15
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1583](https://github.com/kompiro/karasu/issues/1583)（実装）、親 [#1566](https://github.com/kompiro/karasu/issues/1566)
  - [ADR-20260615-01](20260615-01-ownership-during-migration.md)（`duplicate-owner-assignment` を info に下げ first-wins を採用。本 ADR はその「却下した案: `@migration_target` 優先」を実装する続き）
  - [ADR-20260411-02](20260411-02-deprecated-domain-migration-coexistence.md)（domain 側の migration-coexistence precedent）
  - [TPL-20260615-01](../test-perspectives/TPL-20260615-01-migration-priority-index-winner.md)（本 ADR と同 PR で起こした proactive TPL）
  - コード: `packages/core/src/parser/parser.ts`（`migrationPriority` / `indexTeams` / `buildNodePathIndex`）、`packages/core/src/resolver/style-resolver.ts`、`packages/core/src/renderer/badge.ts`

## 背景

同じノードを複数の `team` が `owns` する状態は、逆コンウェイ戦略の過渡期（移行元 → 移行先の引き継ぎ中）に正当に発生する。ADR-20260615-01（#1566）はこれを踏まえ `duplicate-owner-assignment` を error → info に下げたが、`ownerIndex` は 1:1（`Map<nodeId, teamId>`）なので主オーナーを 1 つ選ぶ必要があり、最小実装として first-wins を採った。

一方、論理構造側の `domain` 移行共存では `buildNodePathIndex` が既に `@migration_target` を勝たせている（移行先 domain が `nodePathIndex` の winner）。組織構造側でも対称に、引き継ぎ中の主オーナーは移行先チーム（`@migration_target`）にしたい。しかし `team` ブロックはアノテーションを持てなかった（`TeamNode` に `annotations` なし、parser も `@...` を読まない）ため、ADR-20260615-01 ではこの案を「却下」し #1583 に分離していた。

検討の経緯は Design Doc（本 ADR に集約、同 PR で削除）と Issue #1583 を参照。

## 決定

`team` ブロックにアノテーション対応を追加し、重複所有時の `ownerIndex` の主オーナーを移行優先度で選ぶ。

1. **team アノテーション**: `TeamNode` に `annotations: string[]` / `annotationParams?` を追加。`parseTeamBlock` が label 後・`{` 前で既存の汎用 `parseAnnotations()` を呼ぶ（`@migration_target(from: …)` 等を解釈）。
2. **primary owner 選択（軸 A: インライン優先スワップ）**: module-level helper `migrationPriority(annotations)`（`@migration_target`=2 > 無印=1 > `@deprecated`=0）を新設。`indexTeams` は priority Map を併走させ、重複所有を見つけたら高優先度の team に主を差し替える。同優先度の tie は first-wins。`duplicate-owner-assignment` は info のまま発火し、文言は解決後の主オーナーを指す。`buildNodePathIndex` の domain priority も同 helper に寄せて重複を排除する。
3. **親継承なし**: domain は親 service のアノテーションを継承して priority を決めるが、team の所有優先度は `owns` を宣言した team 自身のアノテーションのみで決める（所有の主体は宣言した team）。
4. **badge レンダリング（軸 B）**: `orgNodeSelectorMatches` がアノテーションセレクタを許可するようにし（従来は弾いていた）、default-style の `@migration_target{}` / `@deprecated{}` ルールが team に当たって resolved style に badge プロパティが乗るようにする。badge SVG は共有 helper `renderer/badge.ts` に切り出し、system renderer と org view（grid / icon / tree）で再利用する。org カードは label がカード外へはみ出すため icon-only（`iconOnly` フラグ）で描画する。

## 理由

- **domain との対称性**: 論理構造（domain → `nodePathIndex`）と組織構造（team → `ownerIndex`）で「移行先が主になる」挙動を揃える。ユーザーから見て「カードのオーナーは移行先なのにナビゲーションは移行元」のような不整合を防ぐ。
- **fact-vs-style ドクトリンの維持**: 共同所有自体は事実であり、引き続き info（error にしない）。ADR-20260615-01 / TPL-20260514-08 の register 判断を保つ。
- **規則の単一化**: priority 計算を `migrationPriority()` に集約し、`nodePathIndex` と `ownerIndex` の両方で共有。将来 3 つ目の 1:1 index が増えても同じ規則を使えるよう proactive TPL-20260615-01 で縛る。
- **最小スコープの badge 再利用**: 既存の node badge 機構（style resolver + 共有 SVG helper）に乗せ、新しい描画系を作らない。

## 却下した案

- **2 フェーズ（収集 → 解決）で ownerIndex を構築**: ノードあたり診断 1 件にできるが、中間データ構造が増え `buildNodePathIndex`（インライン方式）とパターンが揃わず diff も大きい。既存テスト（重複 2 team で info 1 件）はインライン方式でも満たせるため利点が限定的。インライン優先スワップ（案 A-1）を採用した。
- **badge を priority-only（描画しない）に倒す**: スコープは小さいが、team にアノテーションを書けても視覚的フィードバックが無く価値が半減する。#1583 item 4 を今回スコープに含め badge まで実装した（org カードは overflow 回避のため icon-only）。
- **team アノテーションを親 team から継承**: domain↔service の継承に揃える案だが、所有宣言の主体が曖昧になる。継承しない方針とした。

## 影響範囲

- 既存ユーザー: 後方互換（無印 team の優先度は 1 のまま、重複が無ければ `ownerIndex` 挙動は不変）。重複時のみ主オーナーの選び方が first-wins → migration 優先 に変わる（緩和・対称化方向）。badge は team にアノテーションを付けた場合のみ出る。
- ドキュメント: `docs/spec/tags-annotations.md`（en/ja）に team アノテーション + primary-owner 優先 + badge を追記。proactive TPL-20260615-01 を新設。
- テスト: parser / style-resolver / org renderer に優先解決・badge のユニットテストを追加。
