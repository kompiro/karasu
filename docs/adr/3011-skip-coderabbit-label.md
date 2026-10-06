---
id: ADR-3011
title: 正否が差分だけで決まる小さな PR は、人間の承認を得て skip-coderabbit ラベルで CodeRabbit から外す
status: accepted
date: 2026-10-01
topic: build
authors: [kompiro]
related_to: [ADR-2949, ADR-2898, ADR-2716]
assumptions:
  - "grep: .coderabbit.yaml :: !skip-coderabbit"
  - "grep: docs/process.md :: skip-coderabbit"
---

# ADR-3011: 正否が差分だけで決まる小さな PR は、人間の承認を得て skip-coderabbit ラベルで CodeRabbit から外す

- **日付**: 2026-10-01
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3011](https://github.com/kompiro/karasu/issues/3011)
  - [ADR-2949](2949-coderabbit-skips-adr-auto-merge.md)（ADR-only PR をラベルで外す。本 ADR は同じ仕組みで別の対象を外す）
  - [ADR-2898](2898-draft-first-code-review.md)（draft を先に作る。CodeRabbit の review 枠は利用量に応じて補充が遅くなる）
  - [ADR-2716](2716-coderabbit-request-changes-workflow.md)（CodeRabbit の approve はマージ許可ではない）
  - `.coderabbit.yaml`、`docs/process.md`「CodeRabbit を外す小さな PR」

## 背景

README の DeepWiki リンクの修正や、karasu-nest への favicon の追加のような PR も、CodeRabbit のラウンドを回して approve を待っていた。こうした差分は見れば正否が分かり、レビューで得るものが無い。それでも review 枠を 1 回以上使い、マージまでの時間も延びる。

ラベルで外す仕組みは `adr-auto-merge`（ADR-2949）だけで、対象は ADR-only PR に限られていた。

## 決定

**`skip-coderabbit` ラベルの付いた PR を CodeRabbit の自動レビュー対象から外す。ラベルは、差分の正否が差分そのものと外部の事実（リンク先・画像・綴り）だけで決まり、実行時の振る舞いを変えない PR にだけ、Claude の提案を人間が承認してから付ける。**

- `.coderabbit.yaml` の `reviews.auto_review.labels` に `"!skip-coderabbit"` を置く。
- 判定基準と、基準を合わせるための具体例の表は `docs/process.md`「CodeRabbit を外す小さな PR」に置く。
- 行数の上限は設けない。
- ラベルを付けた PR では `/coderabbit-converge` を回さず、CodeRabbit の approve を待たずに人間のレビューへ進む。

基準は、判断が分かれそうな例を並べたインタビューで合わせた。

| 差分 | 判定 |
| --- | --- |
| README のリンク切れ修正 | 外す |
| nest の favicon（静的アセットと `<link rel="icon">`） | 外す |
| 同じ favicon を Worker の新しいルートで返す | 外さない |
| i18n テーブルにある UI 文言の typo 修正 | 外す |
| `examples/` の .krs の typo 修正 | 外す |
| コードコメント・JSDoc の修正 | 外さない |
| `docs/process.md` の 1 行修正 | 外さない |
| テストだけの追加 | 外さない |
| `.github/workflows` の action バージョン更新 | 外さない |
| core の 1 行のバグ修正 | 外さない |

## 理由

- **基準を、レビューが価値を生む理由の裏返しにした。** コメントや process.md の修正は小さくても、コードや運用についての主張なので、周辺と照合して初めて正否が決まる。そこは CodeRabbit が `path_instructions` と `code_guidelines` で照合してくれる面である。リンクや綴りは照合する相手が差分の外の事実だけなので、レビューは何も足さない。
- **表示文字列の修正は振る舞いの変更に数えない。** UI 文言の typo 修正はユーザーに見える変更だが、正否は綴りで決まる。振る舞いとして数えるのは、コードの経路・ルーティング・CI の動きのように、正否を確かめるのに実行や周辺コードの理解が要るものに限る。
- **人間の承認を挟む。** `adr-auto-merge` は diff で機械的に判定できる条件なので Claude が付ける。こちらの基準は「周辺を読まずに判断できるか」という判断を含むので、外す判断の責任を人間が持つ。マージ判断が人間にあることとも揃う。

## 却下した案

### 行数の上限を判定に入れる

機械的に判定できるが、上限の前後で判定が恣意的になる。インタビューで、1 行のバグ修正は外さず、ミラー同期を含む examples の修正は外すと決めた時点で、効いているのは差分の性質であって行数ではないと分かった。

### Claude の判断だけで付ける

`adr-auto-merge` と同じ運用で手間は最小になる。しかし基準が判断を含む以上、誤ってラベルを付ければレビューが丸ごと消える。PR を出した本人が外すことを自分で決める形にもなる。

### PR 本文の `@coderabbitai ignore` や `@coderabbitai pause` で外す

CodeRabbit 側で既に使える。しかし PR の性質として残らず、どの PR を外したかを後から一覧できない。ラベルなら `gh pr list --label skip-coderabbit` で外した PR と基準の運用を振り返れる。
