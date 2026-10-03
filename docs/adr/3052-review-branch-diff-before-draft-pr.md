---
id: ADR-3052
title: /engineering:code-review は draft PR を作る前に base ブランチとの差分へ当て、CodeRabbit の初回レビューは ready にした時点の 1 回にする
status: accepted
date: 2026-10-03
topic: build
authors: [kompiro]
supersedes:
  - ADR-2898
related_to:
  - ADR-2643
  - ADR-2716
scope:
  packages: []
  concerns:
    - ci
assumptions:
  - "grep: .coderabbit.yaml :: drafts: false"
  - "grep: docs/process.md :: gh pr create --draft"
  - "grep: docs/process.md :: git diff origin/main\\.\\.\\.HEAD"
---

# ADR-3052: /engineering:code-review は draft PR を作る前に base ブランチとの差分へ当て、CodeRabbit の初回レビューは ready にした時点の 1 回にする

- **日付**: 2026-10-03
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3052](https://github.com/kompiro/karasu/issues/3052)
  - [ADR-2898](2898-draft-first-code-review.md): 本 ADR が置き換える。draft PR に `/code-review` を当ててから ready にする順序を決めた
  - [ADR-2643](2643-stacked-pr-workflow.md): draft では分単位の CI を止め、CodeRabbit も draft をレビューしない
  - [ADR-2716](2716-coderabbit-request-changes-workflow.md): CodeRabbit の approve までラウンドを回す運用
  - `docs/process.md`, `.claude/rules/stacked-pr.md`, `.claude/skills/coderabbit-converge/SKILL.md`

## 背景

ADR-2898 は、CodeRabbit の review 枠を PR あたり 1 回減らすために「PR を draft で作り、
`/code-review` とその修正の push を draft のうちに済ませてから `gh pr ready` で 1 回だけ
ready にする」と決めた。その際「PR を開く前にローカルのブランチ差分へ当てる」案は、
stacked PR の手順が PR 番号で `/code-review` を当てていたため、手順が 2 つに分かれるとして
却下した。

ready 前のレビューに使うスキルを `/code-review` から `/engineering:code-review`
（engineering plugin）に変えることにした。`/engineering:code-review` が受け取るのは
PR URL・diff・ファイルパスで、PR 番号を前提にしない。レビュー対象を「ブランチの base との
差分」と定義すれば、通常の PR も stack の最下層（base は `main`）も同じ言い方で指せる。
ADR-2898 が却下した理由はこれで成り立たなくなった。

## 決定

**ready にする前に、ブランチの base との差分（`git diff origin/main...HEAD`）へ
`/engineering:code-review` を当てて修正をコミットする。通常の PR はこれを draft PR を
作る前に済ませ、`gh pr ready` で 1 回だけ ready にする。**

## 手順への反映

- 通常の PR: base との差分をレビューして修正をコミット → `gh pr create --draft` → `gh pr ready`。
  修正は PR の最初の push に含まれる
- stacked PR: stack の PR は `gh stack submit` の時点で draft として存在するので、最下層の
  ブランチで `main` との差分をレビューし、修正を push してから最下層の draft を外す
- CodeRabbit の初回レビューは `/engineering:code-review` の修正を反映したコードに当たる
- CodeRabbit のラウンド中は、main の取り込みを単独で push しない（ADR-2898 から引き継ぐ）

## 理由

- **CodeRabbit の review 枠の使い方は ADR-2898 と変わらない。** ready にするのは修正を
  反映した後の 1 回だけで、draft への push も PR 作成前のコミットも枠を使わない
- **通常の PR と stack で手順が 1 つのまま。** どちらも「base との差分にレビューを当ててから
  ready にする」で書ける
- **レビューに PR が要らない。** 通常の PR では PR を作る前に修正が済むので、レビュー前の
  コードが remote に push されない（stack は `gh stack submit` の時点で push 済みなので、この利点はない）

## 却下した案

- **ADR-2898 のまま draft PR に `/engineering:code-review <PR URL>` を当てる**: 枠の使い方は
  同じだが、通常の PR ではレビュー前のコードを一度 push し、修正でもう一度 push することになる。
  PR を作る前に差分へ当てれば、修正は PR の最初の push にまとまる
