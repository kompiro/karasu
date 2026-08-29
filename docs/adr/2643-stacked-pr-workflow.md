---
id: ADR-2643
title: stacked PR は最下層 1 本だけをレビュー対象にし、draft では分単位の CI を止める
status: accepted
date: 2026-08-28
topic: build
scope:
  packages: []
  concerns:
    - ci
related_to:
  - ADR-953
  - ADR-1866
  - ADR-2640
assumptions:
  - "file: .claude/rules/stacked-pr.md"
  - "file: scripts/ci/workflow-draft-gate.test.ts"
  - "grep: .github/workflows/ci.yml :: ready_for_review"
  - "grep: .github/workflows/ci.yml :: github.event.pull_request.draft != true"
  - "grep: .coderabbit.yaml :: drafts: false"
---

# ADR-2643: stacked PR は最下層 1 本だけをレビュー対象にし、draft では分単位の CI を止める

- **日付**: 2026-08-28
- **ステータス**: 決定済み
- **関連**:
  - Issue #2643
  - ADR-953（Required Check は paired stub workflow で docs-only PR を成功扱いにする）
  - ADR-1866（Playwright を Required status check にする）
  - ADR-2640（PR の一次レビューに CodeRabbit を入れる）
  - `docs/process.md`「Stacked PR の進め方」、`.claude/rules/stacked-pr.md`

## 背景

1 つの仕事を依存順のブランチ列に割り、各層を 1 PR にする運用（`gh stack`）は
すでに使っている（#2578 のギャラリー: #2600 から #2606 までの 6 段）。運用が
セッション内の口約束のままだったため、3 つの穴が観測できる状態で残っていた。

- **どの PR がレビュー対象か、どこにも書かれていない。** スタックの全 PR が同じ顔で
  並ぶので、読む側は最初の 1 本を選べない。CodeRabbit は実際には base branch で
  gate されていて（上位 PR は `Review skipped: reviews are disabled for this base
  branch` を報告する）、その事実は PR 一覧を見る人からは読めない。
- **`gh stack sync` 1 回で段数分の CI を焼く。** sync はスタックの全ブランチを
  force-push し、PR ワークフローは draft でも base が `main` でなくても走る
  （#2603 では force-push のたびに `Check` / `Playwright` / `Validate` が再実行されて
  いた）。6 段なら、誰も読まない層の検証に 6 倍払う。
- **`gh stack sync` が既存ルールと矛盾する。** `docs/process.md`「ブランチ戦略」は
  「PR を出す前に main を取り込む、rebase は使わない」と書いているが、`gh stack sync`
  は rebase + force-push そのものである。例外を名指ししない限り既定ルールが勝ち、
  ツールの標準動作が違反に見え続ける。

## 決定

**stacked PR のレビュー対象は最下層（base が `main`）の 1 本だけとし、上位の層は
draft のまま置く。draft PR では分単位のジョブを job-level の `if:` で skip し、
`ready_for_review` を trigger に加えて、draft を外した時点で本番の CI を走らせる。**

段ごとの手順（0 から 7）は `docs/process.md`「Stacked PR の進め方」が正本。

## 理由

- **レビューと検証の対象が一致する。** CodeRabbit は `.coderabbit.yaml` の
  `auto_review.drafts: false`（ADR-2640）と base branch の 2 つで最下層に絞られる。
  CI も同じ 1 本に絞れば、「今読むべき diff」と「今検証されている diff」が同じになる。
  上位層に出た赤は、その層が降りてくるまで誰も対応しないので、出さないほうが正しい。
- **コストが段数に比例しなくなる。** 検証は「その層がマージされる直前に 1 度」で
  足りる。sync のたびに全段を焼くのは、同じ差分を何度も検証しているだけ。
- **draft は人にも機械にも読める信号。** `gh stack merge` は open かつ draft でない
  ことしか見ないので、draft はマージ事故に対する最後の物理的な歯止めにもなる。
- **rebase 禁止ルールの例外が成立する。** 元の禁止（#1804）は「古い `main` の上に
  手で rebase して、他 PR のマージ済み成果を巻き添えで revert した」事故に由来する。
  `gh stack sync` は fetch した trunk に対して rebase し、squash-merge 済みの層を
  検出して飛ばす。同じ失敗モードにならないので、スタック内に限って rebase を許す。

## トレードオフ

上位層は最下層に降りてくるまで CI を一度も通らない。壊れていても、その層が
レビュー対象になるまで表面化しない。受け皿は 3 つ置く。

- 実装中のローカル実行（`pnpm test` / `pnpm lint`）
- nightly の E2E（`e2e-nightly.yml`）
- マージ前に必ず 1 度は本番の CI を通ること（draft を外した時点で走る）

秒で終わる検証（ADR / TPL validate、reference docs、AT coverage）と gitleaks は
draft でも走り続ける。止めて得られるものが無く、秘密の混入だけは早いほうがよいため。

## 却下した案

- **全 PR を ready のまま運用する（現状維持）。** レビュー対象が読めない問題が残る。
  加えて CodeRabbit は base branch で skip するので、上位 PR を ready にしても
  レビューは始まらない。ready の意味が層によって変わる状態は説明できない。
- **workflow レベル（`on:` の条件）で draft を止める。** workflow ごと発火しないと
  Required check は pending のまま残り、PR がマージできなくなる（ADR-953 の
  paired stub が必要になったのと同じ罠）。job-level の `if:` なら skip は success と
  して報告されるので、この問題が起きない。
- **draft でも全部走らせたまま、`gh stack sync` の回数を減らす。** sync の頻度は
  マージのたびに 1 回で既に最小で、削る余地がない。

## 実装上の注意

job-level の `if:` で skip された job は **Required check に success を報告する**。
`types:` の `ready_for_review` と対で置かないと、draft を外した瞬間に「一度も
走っていない green」でマージできてしまう。両者のズレは
`scripts/ci/workflow-draft-gate.test.ts` が落とす。観点としては
[TPL-2643](../test-perspectives/TPL-2643-skip-reports-success-without-running.md)。
