---
id: ADR-20260428-08
title: Required Check は paired stub workflow で docs-only PR を成功扱いにする
status: accepted
date: 2026-04-28
topic: build
related_to:
  - ADR-20260413-01
scope:
  packages: []
  concerns:
    - ci
assumptions:
  - "file: .github/workflows/ci.yml"
  - "file: .github/workflows/ci-skip.yml"
  - "grep: .github/workflows/ci.yml :: paths-ignore"
  - "grep: .github/workflows/ci-skip.yml :: name: Check"
---

# ADR-20260428-08: Required Check は paired stub workflow で docs-only PR を成功扱いにする

- **日付**: 2026-04-28
- **ステータス**: 決定済み
- **関連**: Issue #953, PR #954, ADR-20260413-01 (Preview workflow の path filter 採用)

## 背景

`Check` job (`.github/workflows/ci.yml`) は branch protection の Required status check として登録されている。docs-only の PR でも lint / typecheck / build / test を毎回フル実行しており、ドキュメントだけ触る場合に CI 時間が無駄になっていた。

単純に `paths-ignore` を `ci.yml` に足すだけでは、docs-only PR で **workflow 自体が起動しない**ため Required の `Check` が GitHub に届かず、PR がマージできなくなる（required status check が pending のまま完了しない）。

## 決定

GitHub 公式が推奨する **paired stub workflow** パターンを採用する。

- `ci.yml` は `paths-ignore` で docs-only を除外し、コード変更時のみ走る
- 同じ `name: Check` の job を持つ companion `ci-skip.yml` を新設し、逆向きの `paths` でフィルタする。中身は `echo` で 0 終了する空 step
- branch protection rule は `Check` を Required のまま維持する（変更不要）

両方の workflow が必ずどちらか一方を発火させて `Check` を成功で報告するため、Required は常に満たされる。

## 理由

- **GitHub 公式推奨**: GitHub Docs の "Handling skipped but required checks" で、required status check に対しては「workflow 自体を `paths` で除外せず、stub job を返す companion workflow を用意する」パターンが明記されている (`https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/troubleshooting-required-status-checks#handling-skipped-but-required-checks`)。`paths-ignore` 単独の罠 (required check が pending のまま) と、その公式回避策が同じドキュメントに併記されている
- **branch protection を触らない**: `Check` という名前で required を要求する rule はそのまま使える。CI 構成は workflow 側で完結し、設定が分散しない
- **mutually exclusive**: `paths-ignore` と `paths` の集合が補集合なので、片方だけが必ず発火する。`concurrency.group` を `ci-${{ github.ref }}` で揃えて二重起動も防ぐ

## 却下した案

- **CI を常に走らせて、内部 step で `if:` 分岐**: docs-only でも runner 起動 + `pnpm install` まではかかるため CI 時間が大して減らない
- **集約 gate job (`if: always()`) を Required にする**: 既存の `Check` 名から required ルールを差し替える必要があり、移行コストが高い。リポジトリのスケールが小さい現状ではメリットが少ない
- **branch protection rule から `Check` を外す**: Required の意図 (lint / test がコード変更時に必ず通ること) が失われる

## 運用ルール

- `ci.yml` の `paths-ignore` と `ci-skip.yml` の `paths` は **必ず同じ集合**を表すように保守する。両方の workflow ファイルにクロスリファレンスのコメントを残してある
- 新たに docs-only パスを追加するときは両ファイルを同時に更新する
- 本パターンを他の Required check (将来 `vscode-e2e` などを Required 化する場合) に拡張するときも、同じ paired-stub の形に揃える
