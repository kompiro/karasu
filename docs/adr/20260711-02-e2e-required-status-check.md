---
id: ADR-20260711-02
title: app E2E（Playwright）を Required status check にし、paired stub で永久 pending を防ぐ
status: accepted
date: 2026-07-11
topic: build
related_to:
  - ADR-20260623-05
  - ADR-20260428-08
  - ADR-20260413-01
scope:
  concerns:
    - ci
assumptions:
  - "file: .github/workflows/e2e.yml"
  - "file: .github/workflows/e2e-skip.yml"
  - "grep: .github/workflows/e2e.yml :: name: Playwright"
  - "grep: .github/workflows/e2e-skip.yml :: name: Playwright"
  - "grep: .github/workflows/e2e-skip.yml :: paths-ignore"
---

# ADR-20260711-02: app E2E（Playwright）を Required status check にし、paired stub で永久 pending を防ぐ

- **日付**: 2026-07-11
- **ステータス**: 決定済み
- **関連**:
  - Issue #1866
  - [ADR-20260623-05](20260623-05-e2e-path-filter-trigger.md)（E2E をラベル駆動から path filter へ移行した ADR — 本 ADR はその「`Playwright` は required にしない」という一点を更新する）
  - [ADR-20260428-08](20260428-08-ci-docs-only-paired-stub-workflow.md)（Required Check を paired stub workflow で満たすパターン — 本 ADR はこれを E2E に適用する）
  - [ADR-20260413-01](20260413-01-preview-workflow-no-label-gating.md)（path filter 化の先例）
  - [TPL-20260520-02](../test-perspectives/TPL-20260520-02-consistency-check-triggers-on-both-sides.md)（paired workflow の paths を両側で同期させる観点）
  - `.github/workflows/e2e.yml` / `.github/workflows/e2e-skip.yml`

## 背景

app の Playwright E2E は ADR-20260623-05 で path filter 駆動になり、
`packages/app/**` / `packages/core/**` / `packages/e2e/**` などを触る PR で
自動起動する。しかし `Playwright` job は **branch protection の required status
check ではない**（ruleset の required は `Check` / `Validate` / `Reference docs`
のみ）。

## 問題

required でないため、E2E が走る PR でも:

- **E2E の完了を待たずにマージできる**（in-flight のままマージ可能）
- **E2E が失敗していてもマージできる**

つまり「その PR の中で stale セレクタを検出する」という path filter 化の意図
（ADR-20260623-05）が、マージゲートとしては効いていない。壊れたアサーションが
自分の E2E run の完了前に `main` へ入りうる。

ADR-20260623-05 は当時「`Playwright` を required にすると path 非該当 PR
（docs-only 等）で workflow が起動せず required が永久 pending になる」ため、
あえて required にしない判断をしていた。本 ADR はこの制約を、既存の paired stub
パターンで解消したうえで判断を更新する。

## 検討した選択肢

### 案 A: paired stub で `Playwright` を required 化（採用）

ADR-20260428-08（`ci.yml` ↔ `ci-skip.yml`）と同型に、`e2e.yml` の `paths` を
反転した `paths-ignore` を持つ companion `e2e-skip.yml` を新設し、`Playwright`
という同名 job を exit 0 で emit する。そのうえで ruleset の required に
`Playwright` を追加する。

**採用理由**: リポジトリに既に確立した先例（ADR-20260428-08）があり、構造・
運用ともに流用できる。E2E 該当 PR では実 run が、非該当 PR では stub が
`Playwright / success` を報告し、required は常に解決する。

### 案 B: E2E を全 PR で実行し stub 不要にする

**却下**: 全 PR で 8〜9 分の Playwright を走らせるのは CI コスト・待ち時間が
大きい。path filter 化（ADR-20260623-05）で得た「必要な PR だけ走らせる」利得を
捨てることになる。

### 案 C: required にせず、運用でマージ前に E2E 完了を待つ

**却下**: 人間が毎回 status を確認して待つ運用依存になり、ゲートとして機能
しない。ADR-20260623-05 が opt-in ラベル運用を廃した理由（人依存のブラインド
スポット）と同じ轍。

## 決定

案 A を採用する。

1. `.github/workflows/e2e-skip.yml` を新設する。
   - `on.pull_request`: `types: [opened, synchronize, reopened]`、
     `paths-ignore:` に `e2e.yml` の `paths` と同一リストを列挙。
   - `concurrency.group: e2e-skip-${{ github.ref }}`（`e2e.yml` とは別グループ。
     mixed PR で両方が起動しても互いを cancel しない）。
   - `jobs.playwright.name: Playwright`（required context 名を実 job と一致）。
     中身は echo のみで 0 終了。
2. ruleset `14114011` の required status checks に `Playwright` を追加する。
3. `e2e.yml` に、`e2e-skip.yml` と `paths` を同期させる旨のコメントを追加する
   （TPL-20260520-02）。

### 順序制約（重要）

ruleset への `Playwright` 追加は、**`e2e-skip.yml` がデフォルトブランチに
マージされた後**に行う。逆順だと、stub がまだ存在しない間に docs-only 等の
PR が `Playwright` を報告できず永久 pending になる。

## 結果

- app/core/e2e を触る PR は、`Playwright` の完了かつ成功までマージできなくなる
  （in-flight・失敗マージが塞がれる）。
- docs-only / cli-only / lsp-only などの PR は stub が `Playwright / success` を
  返し、従来どおりマージできる。
- トレードオフ: E2E 該当パスと非該当パスを混在させた PR では、`e2e.yml` と
  `e2e-skip.yml` が両方起動し `Playwright` を二重に報告する。branch protection は
  同名 check を AND するため実 run の合否が支配し、正しさは保たれる
  （ADR-20260428-08 の `Check` と同じ既知挙動）。
- 新たな moving part として stub と実 workflow の `paths` 同期が必要になる。
  TPL-20260520-02 のチェックリストで担保し、両ファイルに相互参照コメントを置く。
- ADR-20260623-05 の path filter 判断・三層 QA モデルは不変。本 ADR は
  「`Playwright` を required にしない」の一点のみを更新する（`supersedes` では
  なく `related_to`）。

## 将来の読者への注意

- `e2e.yml` の `paths` を変更したら、必ず `e2e-skip.yml` の `paths-ignore` も
  同一集合に更新する。片側だけ変えると mixed 判定が崩れ、非該当 PR が pending
  になる、あるいは該当 PR で実 run が走らなくなる。
