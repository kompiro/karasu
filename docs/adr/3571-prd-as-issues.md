---
id: ADR-3571
title: PRD は docs/prd に置かず prd ラベルの Issue にし、展開した Epic をその sub-issue にする
status: accepted
date: 2026-11-03
topic: build
authors: [kompiro]
related_to: [ADR-1827, ADR-1828, ADR-2331, ADR-2348, ADR-2687, ADR-2901]
assumptions:
  - "grep: docs/process.md :: PRD Issue（prd ラベル）"
  - "grep: CLAUDE.md :: GitHub Issues（`prd` ラベル）"
---

# ADR-3571: PRD は docs/prd に置かず prd ラベルの Issue にし、展開した Epic をその sub-issue にする

- **日付**: 2026-11-03
- **ステータス**: 決定済み
- **関連**:
  - Issue #3571（起点）
  - Issue #3572（keystone PRD。PR #1825 の `docs/prd/keystone-primary-path.md` を移したもの）
  - Issue #3573（first-run PRD。PR #3567 の `docs/prd/first-run-experience.md` を移したもの。PR はマージせずに閉じた）
  - [ADR-2348](2348-at-records-point-at-issues.md)（Issue は消えないアドレス。閉じた PRD Issue も参照先として使える根拠）
  - [ADR-2687](2687-adr-body-is-immutable.md)（ADR の本文は書き換えない。`docs/prd/` を指す既存 ADR の本文はそのまま残す）

## 背景

`docs/prd/` は PR #1825 で、製品の要件・方針（何を・なぜ）を残す場所として作った。ADR に昇格して消える `docs/design/` と違い、PRD は ADR にせず残し、要件を Issue に展開する、という位置づけだった。決めた ADR は無く、CLAUDE.md の表と `docs/prd/README.md` だけが規約を持っていた。

PR #1825（2026-06）以来、使われたのは 2 件（keystone と、マージ前の first-run）で、製品の方針はそれ以外ではすでに Issue（Epic、Brainstorm、planning）に置かれていた。first-run（#3563）で、ファイルを Epic と並べて持つ費用がまとめて表に出た。

- **2 か所の内容が重なる。** Epic #3563 の本文が PRD の「Out of scope」と計測の注記を写していた。
- **マージの順序が逆転する。** 実装 PR #3568 が PRD の PR #3567 より先にマージされ、`main` の `docs/acceptance/first-run-experience.md` が存在しないファイルを指した。
- **言語が分かれる。** PRD ファイルは日本語（docs の規約）、Issue は英語なので、Epic は同じ内容の英訳の要約を持つことになる。
- **使う機会が少なく、規約が定着しない。** `docs/process.md` のライフサイクルに `docs/prd/` は出てこず、テンプレートも検査も無かった。

## 決定

`docs/prd/` を廃止する。PRD は `prd` ラベルの Issue に英語で書き、そこから展開した Epic をその sub-issue にする。Epic のスライスはこれまでどおり Epic の sub-issue にする。

```
PRD Issue（prd）        何を・なぜ。後のフェーズ、成功指標、非目標
  └ Epic（sub-issue）    1 フェーズの範囲と ## Slice status
      └ スライス（sub-issue） 実装 PR が Closes する
```

- PRD Issue を立てるのは、方針が 1 つの Epic より長く使われるときだけ。Epic 1 本で完結する要件は Epic の本文に書く。
- Epic の本文は PRD Issue を指すだけで、内容を写さない。
- 方針を変えたら、PRD の本文の `## Revisions` に日付付きで足す。議論はコメントで行う。
- `epic:` ラベルは Epic とスライスに付け、PRD Issue には付けない。
- PRD Issue は、そこから起票する Epic が残っているあいだ open にする。全フェーズを終えたか、別の PRD に置き換えたら閉じる。

## 理由

- **置き場が 1 つになる。** 状態（open/closed）と進捗（sub-issue）を GitHub が持ち、Epic とのあいだで内容が食い違わない。
- **順序の逆転が起きない。** PRD の PR が無いので、実装 PR より後に PRD がマージされる状態がそもそも生まれない。
- **言語が揃う。** Issue は英語という規約に乗り、PRD と Epic で同じ内容を 2 言語で持たない。
- **使う流れの中にある。** Epic と sub-issue は毎日使う仕組みで、`pnpm program:slices` は `prd` ラベルの親を検査から外す（PRD の sub-issue は Epic で、`## Slice status` 表は各 Epic が持つ）ので、階層が 1 段増えても Epic の検査はそのまま動く。GitHub の sub-issue は 8 階層・親 1 件あたり 100 件まで持てるので、3 階層は余裕の範囲に収まる。
- **参照先として消えない。** 閉じた Issue も削除されないアドレスなので（ADR-2348）、AT・TPL・roadmap から指したまま残せる。

## 却下した案

- **`docs/prd/` を残し、「Epic より長く使われる方針だけファイルにする」と判断基準を足す。** 2 か所の重複と順序の逆転は、件数が少なくても PRD を書くたびに起きる。言語の分裂も残る。
- **PRD Issue だけ日本語を許す。** 例外を 1 つ作ると、どの Issue が例外に当たるかの境界がまた揺れる。PRD は英語で書き、作者の日本語の下書きは Issue を起票する前の材料にする。
- **PRD の内容を Epic の本文に統合する（PRD Issue を立てない）。** Epic はフェーズ単位で閉じるので、Phase 2 / 3 のような「まだ起票しない先の話」や成功指標を置く場所が無くなる。

## 帰結

- `docs/prd/README.md` と `docs/prd/keystone-primary-path.md` を削除し、内容は #3572 に英訳して移した。ファイルの最終版は Git の履歴に残る。
- 参照（glossary、roadmap、TPL-2005、AT 2 件、app のコメント、`epic:` ラベルの説明）は PRD Issue に張り替え、`.claude/rules/adr.md` と `.coderabbit.yaml` の例示から `docs/prd/` を外した。
- `scripts/program-slices.ts` は `prd` ラベルの親を検査から外す。
- `docs/prd/` を指す ADR-1827・ADR-1828・ADR-2901 の本文は ADR-2687 に従って書き換えない。これらの ADR 本文の dead path は CI が追わない（`scripts/lint/record-source-paths.ts` は `docs/adr/**` を走査しない）。
- ADR-2331 と ADR-2348 にある `docs/prd/` の記述は、当時の事実の記録として残す。
