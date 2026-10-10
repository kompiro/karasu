---
id: ADR-3117
title: CodeRabbit を外す小さな PR は、PR 本文の ignore コマンドで外し、skip-coderabbit ラベルは記録として残す
status: accepted
date: 2026-10-11
topic: build
authors: [kompiro]
supersedes: [ADR-3011]
related_to: [ADR-2949, ADR-2898, ADR-2716]
scope:
  packages: []
  concerns:
    - ci
assumptions:
  - "grep: .coderabbit.yaml :: !skip-coderabbit"
  - "grep: docs/process.md :: skip-coderabbit"
  - "grep: docs/process.md :: @coderabbitai ignore"
---

# ADR-3117: CodeRabbit を外す小さな PR は、PR 本文の ignore コマンドで外し、skip-coderabbit ラベルは記録として残す

- **日付**: 2026-10-11
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3117](https://github.com/kompiro/karasu/issues/3117)
  - [ADR-3011](3011-skip-coderabbit-label.md)（ラベルで外す。判定基準と人間の承認は本 ADR に引き継ぐ）
  - [ADR-2949](2949-coderabbit-skips-adr-auto-merge.md)（ADR-only PR をラベルで外す。同じ問題を持つが本 ADR の対象外）
  - [ADR-2898](2898-draft-first-code-review.md)（review 枠の補充は直近 7 日の利用量で遅くなる）
  - `.coderabbit.yaml`、`docs/process.md`「CodeRabbit を外す小さな PR」

## 背景

ADR-3011 は、正否が差分だけで決まる小さな PR に `skip-coderabbit` ラベルを付け、
`.coderabbit.yaml` の `reviews.auto_review.labels` で自動レビューから外すと決めた。

運用してみると、ラベルでは CodeRabbit が PR を最初に処理する 1 回を止められなかった。

- CodeRabbit のダッシュボードでは、ラベルの付いた PR にも最初の 1 回が数えられている
- GitHub 側の記録でも、#3003 はラベル付きで開いたのに、開いた直後に
  「Review limit reached」が付いた。ラベルによる除外より前に review 枠の判定を通っているとみられる

review 枠の補充レートは直近 7 日の利用量で下がる。2026-10-11 のダッシュボードは
70 回中 65 回使用で補充は 2 回/時、10/04〜10/11 のレビュー試行の約 4 割が rate limit で
止められている。外すと決めた PR に 1 回使うのは純粋な損失である。

CodeRabbit は PR 本文に ignore コマンドを書くと、その PR のどのコミットも自動レビューしない
（[Commands](https://docs.coderabbit.ai/guides/commands)）。PR を作る時点の本文に書いておけば、
CodeRabbit が最初に見た時点で対象外になる。

ADR-3011 はこのコマンドを「PR の性質として残らず、どの PR を外したかを後から一覧できない」
として却下していた。この理由は、ラベルを記録として併記すれば解消する。

## 決定

**CodeRabbit を外す小さな PR は、`gh pr create` の時点で PR 本文に `@coderabbitai ignore` の
行を入れて外し、`skip-coderabbit` ラベルも付ける。ラベルは外した PR を一覧するための記録で、
`.coderabbit.yaml` のラベル除外は本文に書き忘れたときの後ろ盾として残す。**

- 判定基準（差分の正否が差分そのものと外部の事実だけで決まり、実行時の振る舞いを変えない）と、
  Claude が提案して人間が承認する手順は ADR-3011 から変えない
- 承認は `gh pr create` の前に取る。PR を作ってから外すと決めた場合は、draft のうちに
  本文へ行を足してラベルを付ける
- 通常のレビューに戻すときは、本文の行とラベルの両方を外す
- それ以外の PR の本文には、引き続きこの文字列を書かない（#3012 の事故）

## 理由

- **外す判断が CodeRabbit の最初の処理より前に効く。** ラベルは `.coderabbit.yaml` の
  自動レビュー条件として評価され、PR を開いた時点の処理を止められなかった。本文は PR の作成と
  同時に存在し、CodeRabbit の文書はそのコマンドがある PR のどのコミットもレビューしないと定めている
- **一覧性はラベルが担う。** `gh pr list --label skip-coderabbit --state all` で外した PR を
  振り返れる。ADR-3011 が ignore コマンドを却下した理由は、外す手段と記録を同じものに
  しようとしたことにあった。役割を分ければ両立する
- **ラベル除外を残すのは安価な保険である。** 本文の行を書き忘れても、ready にした後の
  レビューはラベルで止まる。設定を消しても得るものがない

## 却下した案

### ラベルだけを使い続ける

現状維持。外すと決めた PR でも最初の 1 回を使い続ける。rate limit の補充レートは
利用量に直結しているので、この 1 回を払い続ける理由がない。

### ignore コマンドだけを使い、ラベルをやめる

ADR-3011 の却下理由がそのまま残る。本文の検索（`gh pr list --search`）でも拾えるが、
#3012 のように説明や引用として書いた PR も混ざるので、一覧として信頼できない。

### `adr-auto-merge`（ADR-2949）にも同じ変更を入れる

同じ問題を持つが、ADR-only PR の auto-merge は Claude が diff を見て付ける別の決定で、
変更の判断は別に取る。本 ADR は `skip-coderabbit` に限る。
