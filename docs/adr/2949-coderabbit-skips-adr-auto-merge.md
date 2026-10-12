---
id: ADR-2949
title: auto-merge する ADR-only PR は CodeRabbit の自動レビュー対象から外す
status: superseded
superseded_by: ADR-3117
date: 2026-09-27
topic: build
related_to: [ADR-2716, ADR-2331, ADR-2898]
assumptions:
  - "grep: .coderabbit.yaml :: !adr-auto-merge"
  - "grep: .claude/rules/adr.md :: adr-auto-merge"
---

# ADR-2949: auto-merge する ADR-only PR は CodeRabbit の自動レビュー対象から外す

- **日付**: 2026-09-27
- **ステータス**: Superseded by [ADR-3117](3117-coderabbit-ignore-command-for-skip.md)（外す手段のみ。外す範囲は引き継がれている）
- **関連**:
  - Issue [#2949](https://github.com/kompiro/karasu/issues/2949)
  - [ADR-2716](2716-coderabbit-request-changes-workflow.md)（CodeRabbit の運用と自動レビューの除外対象。本 ADR は除外対象を 1 つ足す）
  - [ADR-2331](2331-adr-automerge-scope.md)（ADR PR の auto-merge 例外は差分の性質で判定する。本 ADR はその判定をラベルとして残す）
  - [ADR-2898](2898-draft-first-code-review.md)（draft を先に作る。draft は CodeRabbit がレビューしない）
  - `.coderabbit.yaml`、`.claude/rules/adr.md`「ADR PR の auto-merge」

## 背景

ADR-only の PR は、ADR-2331 の適用条件を満たせば作成直後に auto-merge を有効化する。これまでは ready で作っていたので、CodeRabbit の自動レビューも走っていた。#2948（slice D の昇格 ADR）では、auto-merge でマージされる前に CodeRabbit がサマリを投稿しており、review 枠を 1 回使っていた。

このレビューは誰にも読まれない。PR はレビューを待たずにマージされ、差分は決定の記録と生成物、リンクの張り替えに限られている。CodeRabbit の review 枠は利用上限の対象なので、読まれないレビューに使う理由は無い。

## 決定

**`adr-auto-merge` ラベルの付いた PR を CodeRabbit の自動レビュー対象から外す。ラベルは、PR を draft で作り、auto-merge の適用条件を diff で確認したあとにだけ付ける。**

- `.coderabbit.yaml` の `reviews.auto_review.labels` に `"!adr-auto-merge"` を置く。
- ADR PR の手順は、draft で作成 → 適用条件を確認 → ラベル付与 → `gh pr ready` → `gh pr merge --auto` の順にする。CodeRabbit は draft をレビューしないので、ready にした時点でラベルが既に付いている。
- 適用条件を満たさない `docs(adr):` PR にはラベルを付けず、通常どおりレビューを受ける。

## 理由

- **何を外すかを、auto-merge の判定そのものと一致させる。** ADR-2331 は例外を「場所ではなく差分の性質」で判定すると決めた。ラベルはその判定結果をそのまま記録したものなので、外れる範囲と auto-merge する範囲がずれない。
- **ADR 向けの `path_instructions` が効く PR が残る。** 採番の誤りや既存 ADR 本文の書き換えを見つける指示は、条件を満たさない `docs(adr):` PR（既存 ADR の本文に触れた PR など）で必要になる。それらはラベルが付かないのでレビューを受け続ける。
- **draft を先に作る運用（ADR-2898）に乗るので、ラベルとレビューの競合が起きない。** ready で作ってからラベルを付けると、ラベルが届く前にレビューが走りうる。

## 却下した案

### タイトルの keyword で外す（`ignore_title_keywords: ["docs(adr):"]`）

手順を変えずに済むが、auto-merge の条件を満たさない `docs(adr):` PR も一律に外れる。そこはまさに ADR の `path_instructions` が効いてほしい PR であり、ADR-2331 が退けた「場所（ここではタイトル）で判定する」形に戻ることになる。

### `docs/adr/**` を `path_filters` で外す

ADR を含む全ての PR から ADR の差分がレビューされなくなる。実装 PR に同梱された ADR や、既存 ADR の書き換えも見えなくなる。
