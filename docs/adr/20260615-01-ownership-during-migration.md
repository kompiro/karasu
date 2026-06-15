---
id: ADR-20260615-01
title: "`duplicate-owner-assignment` を info（fact-vs-style register）に下げる"
status: accepted
date: 2026-06-15
topic: core-concepts
related_to:
  - ADR-20260323-03
scope:
  packages: [core, i18n]
assumptions:
  - "grep: packages/core/src/parser/parser.ts :: duplicate-owner-assignment"
  - "grep: packages/i18n/src/en.ts :: primary owner"
---

# ADR-20260615-01: `duplicate-owner-assignment` を info（fact-vs-style register）に下げる

- **日付**: 2026-06-15
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1566](https://github.com/kompiro/karasu/issues/1566)
  - [ADR-20260323-03](20260323-03-organization-diagram.md)（organization / owns 導入。本 ADR は §6 の severity 規定を改める）
  - [TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md)（診断 register は fact / style で決める）
  - 派生 Issue [#1583](https://github.com/kompiro/karasu/issues/1583)（`@migration_target` 優先 / team アノテーション）
  - コード: `packages/core/src/parser/parser.ts`（`indexTeams`）

## 背景

同じノードを複数の `team` が `owns` すると、parser の `indexTeams` が `duplicate-owner-assignment` を **error** で発行していた。しかし構造的に類似した「移行中に同じものが 2 箇所へ属する」事象 — `domain-dispersal` — は **info** で、karasu の「描くが規定しない（fact vs style）」ドクトリンに従っている。この非対称は、karasu が組織面の旗印に掲げる **逆コンウェイ戦略の最中**（チーム引き直し時の一時的な共同所有）を error で弾いてしまう。加えて ADR-20260323-03 §6 は本診断を **warning** と規定しており、実装（error）とも食い違っていた。

検討の経緯は Design Doc（本 ADR に集約、同 PR で削除）と Issue #1566 を参照。

## 決定

`duplicate-owner-assignment` の severity を **info** に下げ、`domain-dispersal` と同じ fact-vs-style register に置く。`ownerIndex` は 1:1 のままで、主オーナーは最初に `owns` した team を採用する（first-wins）。検出は parser の `indexTeams` のまま、severity フィールドのみ変更する。

本決定は ADR-20260323-03 §6 の「同一 ID を複数チームが owns → warning」を **info に改める**（旧 ADR は歴史的記録として残す）。

## 理由

- **fact vs style ドクトリン（TPL-20260514-08）**: 移行中の共同所有はモデル内部整合性のエラーではなく、ある組織論から見た smell（事実）。`domain-dispersal` と対称に info が妥当。
- **逆コンウェイの過渡状態を通せる**: error だとチーム引き直しの最中に render がブロックされる。info なら事実として描き、判断はユーザーに委ねる。
- **lossy さはメッセージで明示**: `ownerIndex` は 1:1 なので 2 つ目の owner は主オーナーにならない。メッセージで「`<主owner>` を採用」と事実先行に述べる。
- **最小実装**: parser diagnostic の severity 変更のみ。owner index は parser 構築時に作るため resolver warning への移設はしない。

## 却下した案

- **warning（ADR-20260323-03 §6 準拠）**: lossy さは表現できるが `domain-dispersal`(info) との非対称が残り、「直すべき」を含意しすぎる。
- **error 維持（現状）**: 逆コンウェイの過渡状態を表現できず、Issue の趣旨に反する。
- **`@migration_target` 優先で主オーナーを選ぶ**: 対称性は上がるが `team` ブロックのアノテーション対応（現状未実装）が前提のため、別 Issue #1583 に分離した。本 ADR は first-wins を維持する。

## 影響範囲

- 既存ユーザー: これまで error でブロックされた重複 owns が info になり render が通る（緩和方向・後方互換）。
- `docs/concepts.md` / `concepts.ja.md` の fact-vs-style 表に `duplicate-owner-assignment` を追加。
- i18n メッセージ（en/ja）を事実先行に更新。
