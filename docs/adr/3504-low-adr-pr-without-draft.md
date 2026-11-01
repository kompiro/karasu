---
id: ADR-3504
title: Low の ADR の PR は draft を経ずに作り、ゲートはその create を 1 つの形だけ通す
status: accepted
date: 2026-11-02
topic: build
authors: [kompiro]
refines:
  - ADR-3342
depends_on:
  - ADR-3286
related_to:
  - ADR-2331
  - ADR-3333
  - ADR-3326
  - ADR-3429
scope:
  packages: []
  concerns:
    - ci
assumptions:
  - "file: .github/workflows/review-request.yml"
  - "file: scripts/coderabbit/ready-gate.sh"
  - "grep: .github/workflows/review-request.yml :: sleep 30"
  - "grep: scripts/coderabbit/ready-gate.sh :: a Low PR needs the CLI review"
  - "grep: scripts/coderabbit/ready-gate.sh :: and no other tier label"
  - "grep: scripts/coderabbit/ready-gate.sh :: a Low PR without --draft is created from the checked-out branch"
  - "grep: .claude/rules/adr.md :: gh pr create --label \"risk: low\""
---

# ADR-3504: Low の ADR の PR は draft を経ずに作り、ゲートはその create を 1 つの形だけ通す

- **日付**: 2026-11-02
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3504](https://github.com/kompiro/karasu/issues/3504)、PR [#3515](https://github.com/kompiro/karasu/pull/3515)
  - [ADR-3342](3342-ready-gate-local-review.md): ローカルの CLI レビューが済むまで `gh pr ready` と `--draft` の無い `gh pr create` を拒否するゲート。本 ADR は create の拒否に Low の例外を 1 つ足して、その決定を狭める
  - [ADR-3326](3326-coderabbit-cli-once-before-ready.md): CLI を 1 回だけ当てる。ゲートが「対象コミットが HEAD の祖先で base に無い」で判定するのはこのため
  - [ADR-3429](3429-synthetic-edge-style-fixtures.md): draft のまま止まった ADR の PR（#3497）
  - [ADR-3286](3286-risk-based-review-tiers.md): 段階のラベルと Review tier。Low は CodeRabbit を回さず auto-merge する
  - [ADR-2331](2331-adr-automerge-scope.md): ADR の PR を auto-merge してよい差分の範囲
  - [ADR-3333](3333-converge-after-ready-hook.md): `gh pr ready` の後に converge を促すフック
  - Issue [#3514](https://github.com/kompiro/karasu/issues/3514): `gh pr ready` 側の `-R` での素通り（本 ADR の範囲外）

## 背景

ADR だけを記録する Low の PR は、draft で作ってすぐ `gh pr ready` で外し、auto-merge を有効にする手順だった。
draft にするのはレビューのためではなく、ラベルの競合を避けるためだけだった。`gh pr create --label` は PR を
開いた後の別の呼び出しでラベルを付ける。draft でない PR として開くと、ラベルの無い PR に `risk: high` を付ける
「Label untiered PRs High」（`review-request.yml`）が先に走り、CodeRabbit のレビューが始まって Low から外れうる。

この一瞬の draft が、セッションが止まる場所になった。#3497（ADR-3429）は CI が通った後も draft のまま残り、
誰も見る必要が無いのにマージされなかった。

さらに、ADR-3342 のゲートは `--draft` の無い `gh pr create` を CLI レビューの有無に関係なく拒否していたので、
手順から draft を外すにはゲートも変える必要があった。

## 決定

**Low の ADR の PR は `gh pr create --label "risk: low"` で draft を経ずに作り、続けて auto-merge を有効にする。
そのために、ラベルの無い PR に `risk: high` を付けるワークフローは開いた PR で 30 秒待ってからラベルを読み、
ゲートは `--draft` の無い create を、`risk: low` が唯一の段階のラベルで、このブランチの CLI レビューが済み、
gh がチェックアウト中のブランチを origin の repo へ push する形のときだけ通す。**

- **ワークフロー**: `opened` / `reopened` では 30 秒待つ。`ready_for_review` ではすぐ読む（draft のうちに
  ラベルが付いているため）。待った後もラベルが無ければ、これまでどおり `risk: high` を付ける
- **ゲートが通す形**: 次をすべて満たす create だけ
  - `risk: low` のラベルがあり、ほかの段階のラベル（`risk: design` / `risk: medium` / `risk: high`）が無い
  - 完了した CLI レビューの対象コミットが HEAD の祖先で、base に無い。記録が読めないときも通さない
  - `--head`・`--repo` / `-R`・`GH_REPO` / `GH_HOST`・origin 以外を選ぶ `gh repo set-default` のどれも無い
  - base（`--base`、ブランチの `gh-merge-base`、origin の既定ブランチの順）が origin にある。ローカルの
    同名ブランチでは判定しない
- **ゲートが拒否するもの**: 上に当てはまらない create はすべて拒否する。形を満たし CLI のレビューだけが無いときは、
  レビューを済ませて作り直すよう（CLI が使えなければ `risk: medium` で draft から作るよう）案内し、それ以外は
  `--draft` で作るよう案内する。`--draft` はどの場合も使えるので、
  拒否しても作業は止まらない
- **CLI を飛ばす指定（`KARASU_LOCAL_REVIEW_SKIPPED`）は Low の create では受け付けない**。Review tier は CLI を
  飛ばした Low の記録を通さないので、受け付けると auto-merge できない PR ができる。CLI が使えない環境では
  `risk: medium` に上げて draft から作る
- **auto-merge の適用条件は変えない。** タイトルが `docs(adr): ` で始まること、差分が ADR-2331 と
  `.claude/rules/adr.md`「適用条件」の許す範囲だけであること、`origin/main` を fetch した直後に分類器が `low` を
  出すことは、これまでどおり PR を作る前に確かめる。変わるのは、作成と auto-merge のあいだから draft の段階を
  抜くことだけである
- High・Design・Medium の PR はこれまでどおり draft で作り、`gh pr ready` と converge のフック（ADR-3333）を通る
- ADR-3342 のうち、`gh pr ready` のゲートと、それが分からないときに通す挙動は変えない

## 理由

- **draft が守っていたのはラベルの競合だけだった。** Low には CodeRabbit が走らず、CLI のレビューはゲートが
  create の時点で確かめ、ローカルレビューの記録は Review tier が確かめ、マージは Review tier を含む required
  check を待つ。競合をワークフローの側で消せば、draft の段階は何も守らなくなる
- **ゲートの目的は保たれる。** ADR-3342 のゲートは「ローカルの CLI レビューを済ませてから CodeRabbit の段階へ
  進む」ためのもので、draft という形そのものが目的ではない。draft でない create にも同じ条件を課せば、目的は
  そのまま守られる
- **受け付ける形を 1 つに絞る。** #3515 では、ゲートが `--head`・`--repo`・base を gh と同じように読もうとする
  たびに、レビューのラウンドごとに別のずれが見つかった（`<owner>:<branch>`、同じ repo を指す `--repo`、
  `gh-merge-base`、`GH_REPO`、`gh repo set-default`、force-push された remote の head、ローカルの同名 base）。
  gh の上書きを読み続ける形には終わりが無い。ADR の PR はいつもチェックアウト中のブランチから作るので、
  その形だけを通し、それ以外を拒否すれば、ずれの種類ごと無くなる
- **分からないものは拒否する。** ADR-3342 は、ゲート自身の故障で作業を止めないよう、分からないときは通す。
  この create では `--draft` という代わりの道が常にあるので、分からないときに拒否しても作業は止まらない。
  例外の側だけを厳しくする

## 却下した案

- **draft を残し、手順の文言で「止まらない」を強める**: 手順は以前から作成・ready・auto-merge を続けて行うと
  書いていた。止まったのは文言ではなく、余分な段階があったためである
- **CLI のレビューが済めば、段階を問わず draft なしの create を通す**: High・Design・Medium の PR が
  `gh pr ready` と、その後に converge を促すフック（ADR-3333）を飛ばす。draft を省いてよいのは、ready の後に
  何も続かない Low だけである
- **gh のラッパーで、draft でない create を draft の作成と ready に置き換える**: draft を隠すだけで競合は残り、
  Claude のセッション以外には効かない
- **maintainer の PR にはラベルを付けない**: GitHub の UI から開いた maintainer 自身の PR を High として扱う、
  というワークフローの目的が失われる
- **`--head`・`--repo`・base を gh と同じ規則で読む**: #3515 の途中まで採った方式。上の「理由」のとおり、
  ラウンドごとに新しいずれが見つかり収束しなかった
- **ゲートで `docs(adr):` のタイトルを確かめ、ADR の PR だけに限る**: 段階の判定は Review tier が差分から行い、
  Low でない変更に付いた `risk: low` はそこで落ちる。本当に Low の変更なら、draft は何も守らない。ゲートで
  タイトルを見るのは、分類器より弱い判定を二重に持つことになる
- **遅れて付いたラベルを `labeled` で直す**: 30 秒より遅れて `risk: low` が届くと、`risk: high` と両方が残る。
  ワークフローが付けた `risk: high` だけを外すには、`labeled` を受けて timeline からラベルを付けた actor を
  読む仕組みが要る。まれな競合のためにトリガーと照会を足すことになり、しかも次のとおり、競合しても安全側に倒れる。
  両方が残った PR を、その後に人が起こすイベント（`risk: low` の付与や auto-merge の有効化）で走る Review tier は
  厳しい方の High として扱い、auto-merge を止める。ワークフローが `GITHUB_TOKEN` で付けたラベルは Review tier を
  走らせないので、最後の Review tier がそのラベルより先にラベルを読んでいれば止まらないが、差分は Low なので、
  失うのは多くても CodeRabbit のレビュー 1 回分である。どちらの場合も、両方のラベルが残ったら
  `gh pr edit <N> --remove-label "risk: high"` で外す（`unlabeled` で Review tier が走り直し、Low として通る）
