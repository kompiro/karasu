---
id: ADR-3326
title: draft を外す前に CodeRabbit CLI を base ブランチとの差分へ 1 回だけ当て、指摘 0 件までは回さない
status: accepted
date: 2026-10-22
topic: build
authors: [kompiro]
depends_on:
  - ADR-3052
related_to:
  - ADR-2716
  - ADR-2643
scope:
  packages: []
  concerns:
    - ci
assumptions:
  - "grep: docs/process.md :: coderabbit review --agent --deep --base origin/main --committed"
  - "grep: .claude/skills/coderabbit-converge/SKILL.md :: ラウンド中に CLI は回さない"
---

# ADR-3326: draft を外す前に CodeRabbit CLI を base ブランチとの差分へ 1 回だけ当て、指摘 0 件までは回さない

- **日付**: 2026-10-22
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3326](https://github.com/kompiro/karasu/issues/3326)
  - [ADR-3052](3052-review-branch-diff-before-draft-pr.md): ready の前に base との差分へ `/engineering:code-review` を当てる順序。本 ADR はその直後に 1 手順を足す
  - [ADR-2716](2716-coderabbit-request-changes-workflow.md): CodeRabbit の approve までラウンドを回す運用
  - [ADR-2643](2643-stacked-pr-workflow.md): draft では CodeRabbit も分単位の CI も走らない
  - `docs/process.md`, `.claude/rules/stacked-pr.md`, `.claude/skills/coderabbit-converge/SKILL.md`

## 背景

CodeRabbit の PR レビューは review 枠を使い、枠の補充レートは直近 7 日の利用量が増えるほど
下がる（最後は 1 回/時）。ready にした後のラウンド数が、そのまま PR が人間に渡るまでの待ち時間になる。

CodeRabbit CLI（`coderabbit review`）は PR とは別の枠で数えられる。手元の API キーでは
1 時間の移動窓で 10 回（`coderabbit usage` で確認、2026-10-22）。`--deep` を付けると PR レビューと
同じ方針でレビューする。

それでも CLI はほとんど使われていなかった。2026-10-01 以降に PR を作った・ready にした
セッション約 290 本のうち、`coderabbit review` を実行したのは 1 本（隣の repo の tpl-tools）だけだった。
CLI を回す手順はローカルのエージェント用メモにしかなく、セッションが従う `docs/process.md`・
`.claude/rules/stacked-pr.md`・`/coderabbit-converge` の前提には書かれていなかった。

tpl-tools PR #28 では、CLI を指摘 0 件になるまで回してから ready にした。それでも PR 側では
minor の指摘が 2 件、次のラウンドでも 1 件出た。CLI 自体も、同じ差分で実行ごとに違う指摘を返した。

## 決定

**ready にする前に、`/engineering:code-review` と同じ base との差分へ
`coderabbit review --agent --deep --base origin/main --committed` を 1 回だけ当て、
対応すると決めた指摘を直してから draft を外す。修正後に CLI を回し直さず、
`/coderabbit-converge` のラウンド中も CLI は回さない。**

## 手順への反映

- 通常の PR: `/engineering:code-review` → CLI を 1 回 → 修正をコミット → `gh pr create --draft` → `gh pr ready`（`docs/process.md` PR ワークフローの手順 9）
- stacked PR: 最下層のブランチで同じ 2 つを当て、修正を push してから最下層の draft を外す
- CLI が使えない環境（未インストール・未認証・枠切れ）では CLI の手順を飛ばす。CLI は PR レビューの前段であって、代わりではない
- 指摘の対応可否は `/engineering:code-review` と同じ基準（記録済みの決定を変えるものだけ人に確認する）

## 理由

- **PR の review 枠を使わずに 1 ラウンド分の指摘を先に拾える。** CLI の枠は PR とは別なので、
  PR の枠が 1 回/時に絞られていても使える
- **1 回で止めるのは、0 件まで回すと待ちが ready の前に移るだけだから。** 1 回の実行に数分かかり、
  同じ差分でも実行ごとに違う指摘が出るので、0 件という終わりが安定しない。tpl-tools #28 でも
  CLI 0 件の後に PR で指摘が出ており、ready 後の PR レビューは結局走る
- **手順書の番号付きの手順に置く。** メモに書いても、番号付きの手順の間には割り込めなかった
  （背景の実測）。セッションが実際に従う 3 か所に同じ手順を書く

## 却下した案

- **CLI を指摘 0 件になるまで回してから ready にする**: 上の理由のとおり、PR のラウンドと
  同じ種類のボトルネックを ready の前に作る。0 件になっても PR レビューの指摘はゼロにならない
- **`/coderabbit-converge` の各ラウンドで、push の前に CLI を回す**: ラウンドごとに数分の待ちが
  増える。ラウンド中の指摘は PR のレビューが返すので、CLI を重ねても枠の節約にならない
- **CLI を手順に入れず、エージェント用メモのままにする**: 背景のとおり、ほぼ実行されなかった
