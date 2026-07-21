---
id: ADR-2045
title: QA 手動チェックリスト生成のマーカー対応と 3-way triage
status: accepted
date: 2026-07-17
topic: testing
related_to:
  - ADR-529
  - ADR-33
assumptions:
  - "file: scripts/acceptance/generate-qa-checklist.ts"
  - "file: scripts/acceptance/coverage.ts"
---

# ADR-2045: QA 手動チェックリスト生成のマーカー対応と 3-way triage

- **日付**: 2026-07-17
- **ステータス**: 決定済み
- **関連**: Issue #2045, ADR-529（三層 QA モデル）, ADR-33（旧・手動 QA 優先、superseded）

## 背景

ADR-529 は三層 QA モデル（Playwright 自動層 / AI 視覚レビュー層 / 手動 QA
チェックリスト層）を決定し、第 3 層を `/qa`（hane:qa）スキルが生成するチェックリストが
担うとした。その後、前提が 2 つ変わった。

1. hane:qa スキルは retired 化され、後継が prose として残るのみでコードによる強制力がない。
2. 生成器はチェックリスト生成時に `- [ ]`（未チェック）行を機械的に集めるだけで、直後の
   `> ✅ Automated` マーカーや退役 AT バナーを無視していた（"marker-blind"）。

このため、既に committed test でフェンス済みの項目（`- [ ]` のまま `✅ Automated` が付いた
もの、または suite-wide マーカー配下）や退役 AT（AT-1403）の項目が、毎回のチェックリストに
混入していた。2026-07-17 の自動化実現性検証でこの汚染を実測し、本 repo で marker 被覆 51
項目 + 開発ツール AT 15 件 + 退役 1 件に上ることを定量化した（Issue #2045）。

## 決定

QA チェックリスト生成を karasu ネイティブの `scripts/acceptance/generate-qa-checklist.ts` が
担い（retired prose skill に依存しない）、次を行う。

1. **除外**: (a) 退役 AT（本文冒頭の `⚠️ Retired` バナー）、(b) 開発ツール AT（frontmatter
   `type: tool` / `tooling`）、(c) 自動化マーカーで被覆済みの `- [ ]` 項目。マーカー検出は
   `coverage.ts` の `scanBulletCoverage` を再利用し、`at:check-coverage` と同じ規約で一元化する。
2. **3-way triage**: 残った真の手動項目を `spec-target`（committed test で自動化可能）/
   `agent-sweep`（審美・外部実描画）/ `human-only`（外部実サービス・LLM 品質）へキーワード
   ヒューリスティックで振り分ける。確信が持てないものは `needs-review` に明示フォールバック
   する。triage は ADR-529 の三層に対応する advisory な振り分けであり、確定分類ではない。

## 理由

- **marker 検出の一元化**: `coverage.ts`（`at:check-coverage` が使うマーカー規約の正）を
  再利用することで、チェックリスト生成とマーカー検査が同じ規約でロックステップに動く。
  二重定義のドリフトを避ける。
- **retired skill 依存の解消**: prose skill は enforce できずテストもできない。コード化により
  回帰を vitest でフェンスでき、layer-3 の所在も明確になる。
- **三層モデルの道具化**: 3-way triage は ADR-529 が定めた三層の入口を機械化する。
  汚染除去（除外）はコード挙動を変えずにチェックリストの相当数を削減する最安の改善。
- **type ドリフトへの頑健性**: frontmatter `type` は一部で status 的な値（`manual` /
  `automated` / `mixed`）や sub-category（`feature` / `process`）に流用されている。除外は
  開発ツール型（`tool` / `tooling`）に限定し、`type: manual` 等の product AT（まさに手動 QA
  の対象）を誤って落とさない。

## 却下した案

- **hane:qa スキル prose の修正**: retired であり、prose ゆえコードによる強制力・テストがなく、
  cross-repo（kompiro/hane）でもある。karasu 内のコード生成器の方が enforce・回帰可能で、
  layer-3 の所在を明確にできる。
- **「product 以外を全除外」**: `type` ドリフトのため `type: manual`（手動 QA 対象の product
  AT）等を誤除外してしまう。開発ツール型のみを除外する方針を採る。

## 関連

- Issue #2045
- ADR-529（三層 QA モデル。本 ADR はその第 3 層の生成器を具体化する）
- 生成物 `docs/qa/YYYY-MM-DD-checklist.md`（`.gitignore` 対象、コミットしない）
