---
id: ADR-2898
title: /code-review は draft PR に当て、CodeRabbit の初回レビューは ready にした時点の 1 回にする
status: accepted
date: 2026-09-26
topic: build
authors: [kompiro]
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
  - "file: .claude/skills/coderabbit-converge/SKILL.md"
---

# ADR-2898: /code-review は draft PR に当て、CodeRabbit の初回レビューは ready にした時点の 1 回にする

- **日付**: 2026-09-26
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2898](https://github.com/kompiro/karasu/issues/2898)
  - [ADR-2643](2643-stacked-pr-workflow.md): draft では分単位の CI を止め、CodeRabbit も draft をレビューしない
  - [ADR-2716](2716-coderabbit-request-changes-workflow.md): CodeRabbit の approve までラウンドを回す運用
  - `docs/process.md`, `.claude/skills/coderabbit-converge/SKILL.md`

## 背景

CodeRabbit（Essentials、1 seat）の rate limit にほぼ毎日当たるようになった。
2026-09-26 時点のダッシュボード（直近 7 日）は次のとおり。

- review event 136 回、うち 52 回が rate limit で止められた（usage-based での継続は 0 回）
- PR 40 本、PR あたり 3.4 回。review event の 90% が 2 回以上レビューされた PR に付いている
- 補充レートは 1 回/時

上限は公称の 5 回/時ではない。CodeRabbit の adaptive fair-use は直近 7 日の利用量に
応じて補充レートを段階的に下げ、Essentials は 60 回以上で「1 回/時、同時に 1 本」まで
落ちる。枠は開発者単位で、karasu 以外のリポジトリ（hato など）とも共有される。

プランを上げても、この利用量では効かない。同じ 64 回/週だと Team は 2 回/時、
Advanced は 4 回/時になる。止められた分を usage-based（1 reviewed file あたり $0.25）で
すべて続けると、月 $250 前後かかる見込みになる。効くのは review event の回数そのもので
ある。

回数を押し上げていた原因は手順の順序にあった。ready の PR への push は、自動レビューが
走るたびに review event を 1 回使う（rate limit で弾かれた push は使わない）。これまでの手順は PR を ready で開いてから（stack なら
最下層の draft を外してから）`/code-review` を当てていたので、

1. PR を開いた時点で、`/code-review` がこれから直すコードに 1 回使う
2. `/code-review` の修正の push でもう 1 回使う
3. そのあとで CodeRabbit のラウンドが始まる

という形になっていた。

## 決定

**PR は draft で作り、`/code-review` とその修正の push を draft のうちに済ませてから
`gh pr ready` で 1 回だけ ready にする。** CodeRabbit の初回レビューは `/code-review`
の修正を反映したコードに当たる。

stacked PR でも同じで、最下層に `/code-review` を当ててから draft を外す。

CodeRabbit のラウンド中は、main の取り込みを単独で push しない。取り込みが要るときは
そのラウンドの修正と一緒に 1 回の push にまとめる。

## 理由

- **追加の仕組みが要らない。** `.coderabbit.yaml` の `auto_review.drafts: false` で
  CodeRabbit は draft をレビューせず、ADR-2643 で分単位の CI も draft では skip される。
  draft は `/code-review` を回すための、枠を使わない置き場としてすでに成立している
- **PR あたり少なくとも 1 回減る。** `/code-review` の修正が 1 回の push で済む場合でも、
  PR を開いた時点の 1 回がなくなる
- **CodeRabbit の指摘が減る見込みがある。** `/code-review` が拾う誤りを CodeRabbit が
  先に指摘して、ラウンドが 1 回増える形がなくなる
- **fair-use の段階が上がれば、今のプランのまま上限が戻る。** 週 30 回を下回れば
  Essentials でも 5 回/時になる

## 却下した案

- **Team / Advanced に上げる**: 背景のとおり、今の利用量ではどちらも 2〜4 回/時に落ちる。
  回数を減らしたあとに、週 30〜40 回の範囲で Essentials（3〜4 回/時）と Team（8 回/時）の
  差が効くようになったら改めて検討する
- **usage-based だけで止められた分を続ける**: 月 $250 前後の見込みで、プラン変更より高い。
  月額上限を小さく設定した逃がし弁としては併用する（設定はダッシュボード側で、本 ADR の
  決定には含めない）
- **`auto_incremental_review: false` にする**: push ごとの自動レビューが止まるだけで、
  `/coderabbit-converge` はラウンドごとに `@coderabbitai review` を投げることになり、
  それも 1 回ずつ枠を使う。回数は減らず、ラウンドを回す手間だけが増える
- **`/code-review` を PR を開く前にローカルのブランチ差分へ当てる**: 枠を使わない点は
  同じだが、stacked PR の手順（PR 番号で `/code-review` を当てる）と揃わない。draft PR に
  当てる形なら通常の PR と stack で手順が 1 つで済む
