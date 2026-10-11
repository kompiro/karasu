---
id: ADR-3117
title: CodeRabbit から外す PR は PR 本文の ignore コマンドで外し、ラベルは外した PR の記録として残す
status: accepted
date: 2026-10-11
topic: build
authors: [kompiro]
supersedes: [ADR-3011, ADR-2949]
related_to: [ADR-2331, ADR-2898, ADR-2716]
scope:
  packages: []
  concerns:
    - ci
assumptions:
  - "grep: .coderabbit.yaml :: !skip-coderabbit"
  - "grep: .coderabbit.yaml :: !adr-auto-merge"
  - "grep: docs/process.md :: skip-coderabbit"
  - "grep: docs/process.md :: @coderabbitai ignore"
  - "grep: .claude/rules/adr.md :: @coderabbitai ignore"
---

# ADR-3117: CodeRabbit から外す PR は PR 本文の ignore コマンドで外し、ラベルは外した PR の記録として残す

- **日付**: 2026-10-11
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3117](https://github.com/kompiro/karasu/issues/3117)
  - [ADR-3011](3011-skip-coderabbit-label.md)（小さな PR をラベルで外す。判定基準と人間の承認は本 ADR に引き継ぐ）
  - [ADR-2949](2949-coderabbit-skips-adr-auto-merge.md)（auto-merge する ADR-only PR をラベルで外す。外す範囲は本 ADR に引き継ぐ）
  - [ADR-2331](2331-adr-automerge-scope.md)（ADR PR の auto-merge 例外は差分の性質で判定する）
  - [ADR-2898](2898-draft-first-code-review.md)（review 枠の補充は直近 7 日の利用量で遅くなる）
  - `.coderabbit.yaml`、`docs/process.md`「CodeRabbit を外す小さな PR」、`.claude/rules/adr.md`「ADR PR の auto-merge」

## 背景

CodeRabbit の自動レビューから PR を外す仕組みは 2 つあり、どちらもラベルを使っていた。

- ADR-2949: auto-merge の適用条件を満たす ADR-only PR に `adr-auto-merge` を付ける
- ADR-3011: 正否が差分だけで決まる小さな PR に、人間の承認を得て `skip-coderabbit` を付ける

どちらも `.coderabbit.yaml` の `reviews.auto_review.labels` で外し、draft のうちにラベルを
付けてから ready にすれば、CodeRabbit がレビューする時点ではラベルが付いている、という前提に立っていた。

運用してみると、ラベルでは CodeRabbit が PR を最初に処理する 1 回を止められなかった。

- CodeRabbit のダッシュボードでは、ラベルの付いた PR にも最初の 1 回が数えられている
- GitHub 側の記録でも、#3003 は `skip-coderabbit` 付きで開いたのに、開いた直後に
  「Review limit reached」が付いた。ラベルによる除外より前に review 枠の判定を通っているとみられる

review 枠の補充レートは直近 7 日の利用量で下がる。2026-10-11 のダッシュボードは
70 回中 65 回使用で補充は 2 回/時、10/04〜10/11 のレビュー試行の約 4 割が rate limit で
止められている。外すと決めた PR に 1 回使うのは純粋な損失である。とくに ADR-only PR は
9/27〜10/08 の 2 週弱で 9 本あった。

CodeRabbit は PR 本文に ignore コマンドを書くと、その PR のどのコミットも自動レビューしない
（[Commands](https://docs.coderabbit.ai/guides/commands)）。PR を作る時点の本文に書いておけば、
CodeRabbit が最初に見た時点で対象外になる。

ADR-3011 はこのコマンドを「PR の性質として残らず、どの PR を外したかを後から一覧できない」
として却下していた。この理由は、ラベルを記録として併記すれば解消する。

## 決定

**CodeRabbit から外す PR は、`gh pr create` の時点で PR 本文に `@coderabbitai ignore` の行を
入れて外し、外した理由のラベル（`adr-auto-merge` または `skip-coderabbit`）も付ける。
ラベルは外した PR を一覧するための記録で、`.coderabbit.yaml` のラベル除外は本文に
書き忘れたときの後ろ盾として残す。**

- 外す範囲はどちらも変えない。`adr-auto-merge` は ADR-2331 の適用条件を diff で確認した
  ADR-only PR だけ、`skip-coderabbit` は ADR-3011 の判定基準を満たすと人間が承認した PR だけである
- 判断は PR を作る前に済ませる。`adr-auto-merge` は Claude がブランチの差分
  （`git diff origin/main...HEAD`）と PR タイトルで判定する。`skip-coderabbit` は Claude が
  提案して人間が承認する。PR を作ってから外すと決めた場合は、draft のうちに本文へ行を足して
  ラベルを付ける
- ADR-2331 が差分の中身を見る手段として加えた `gh pr diff <N>` は、PR を作る前の
  `git diff origin/main...HEAD` に置き換わる。差分の性質で判定するという ADR-2331 の決定は変わらない
- 通常のレビューに戻すときは、本文の行とラベルの両方を外し、`@coderabbitai full review` を
  投げる。それまでのコミットは一度もレビューされていないので、差分レビューでは足りない
- それ以外の PR の本文には、引き続きこの文字列を書かない（#3012 の事故）

## 理由

- **外す判断が CodeRabbit の最初の処理より前に効く。** ラベルは `.coderabbit.yaml` の
  自動レビュー条件として評価され、PR を開いた時点の処理を止められなかった。本文は PR の作成と
  同時に存在し、CodeRabbit の文書はそのコマンドがある PR のどのコミットもレビューしないと定めている
- **一覧性と外す理由はラベルが担う。** `gh pr list --label <label> --state all` で外した PR を
  理由ごとに振り返れる。ADR-3011 が ignore コマンドを却下した理由は、外す手段と記録を同じものに
  しようとしたことにあった。役割を分ければ両立する
- **判定の入力は PR を作る前から手元にある。** ADR-2331 の適用条件は PR タイトルと差分だけで
  決まり、差分はブランチにある。PR を作ってから `gh pr diff` で確かめていたのは、ラベルを
  付ける先の PR が要ったからで、判定自体に PR は要らない
- **ラベル除外を残すのは安価な保険である。** 本文の行を書き忘れても、ready にした後の
  レビューはラベルで止まる。設定を消しても得るものがない

## 却下した案

### ラベルだけを使い続ける

現状維持。外すと決めた PR でも最初の 1 回を使い続ける。rate limit の補充レートは
利用量に直結しているので、この 1 回を払い続ける理由がない。

### ignore コマンドだけを使い、ラベルをやめる

ADR-3011 の却下理由がそのまま残る。本文の検索（`gh pr list --search`）でも拾えるが、
#3012 のように説明や引用として書いた PR も混ざるので、一覧として信頼できない。
外した理由（auto-merge か、小さな PR か）も本文の行からは分からない。

### タイトルの keyword で外す（`ignore_title_keywords`）

ADR-2949 が退けた理由のまま。auto-merge の条件を満たさない `docs(adr):` PR も一律に外れ、
ADR 向けの `path_instructions` が効いてほしい PR が見られなくなる。
