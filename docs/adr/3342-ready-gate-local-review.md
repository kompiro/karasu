---
id: ADR-3342
title: ブランチでローカルの CLI レビューが済むまで、PreToolUse フックで gh pr ready を止める
status: accepted
date: 2026-10-24
topic: build
authors: [kompiro]
depends_on:
  - ADR-3326
related_to:
  - ADR-3333
  - ADR-3011
  - ADR-3117
scope:
  packages: []
  concerns:
    - ci
assumptions:
  - "file: scripts/coderabbit/require-review-before-ready.sh"
  - "grep: .claude/settings.json :: scripts/coderabbit/require-review-before-ready.sh"
---

# ADR-3342: ブランチでローカルの CLI レビューが済むまで、PreToolUse フックで gh pr ready を止める

- **日付**: 2026-10-24
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3342](https://github.com/kompiro/karasu/issues/3342)
  - [ADR-3326](3326-coderabbit-cli-once-before-ready.md): ready の前に CLI を 1 回だけ当てる。本 ADR はそれを機械的な前提条件にする
  - [ADR-3333](3333-converge-after-ready-hook.md): ready の後に converge へ引き継ぐフック。本 ADR は ready の前を受け持つ
  - [ADR-3011](3011-skip-coderabbit-label.md) / [ADR-3117](3117-coderabbit-ignore-command-for-skip.md): CodeRabbit を外す PR
  - Issue [#3340](https://github.com/kompiro/karasu/issues/3340) / [#3341](https://github.com/kompiro/karasu/issues/3341): ラウンド数を減らす残りの 2 つ

## 背景

ADR-3326 で、ready の前に `/engineering:code-review` と CLI のレビューを 1 回当てる手順を
`docs/process.md` に書いた。その翌日、あるセッションが `/engineering:code-review` を飛ばして
#3336 を ready にした。#3336 は CodeRabbit のレビューを 6 回使った。最小なら 2 回で済んだはずで、
余分な回のうち 3 回は、ローカルのレビューで拾えたはずの 1 つの種類の問題（テストの一時 repo が
呼び出し側の git 環境を受け継ぐ）を 1 か所ずつ直したものだった。

文章の手順だけでは、飛ばすことを止められなかった。`.claude/rules/README.md` の層の表では、
ツール実行の直前に毎回届くのはフックの層だけである。

## 決定

**`.claude/settings.json` に PreToolUse フック（matcher `Bash`）を置き、このブランチで完了した
CodeRabbit CLI のローカルレビューが無いあいだは `gh pr ready` を止める。`--draft` の無い
`gh pr create` も止める。**

## 仕組み

- `scripts/coderabbit/require-review-before-ready.sh` は、コマンドの先頭位置にある
  `gh pr ready` / `gh pr create` だけを見る。heredoc の本文（最初の `<<` から後）と、
  引用の中に書かれた文字列は対象外にする。ready の前に止めるため、#3334 のように gh の出力は
  使えず、コマンド文字列から読む
- **「済んでいる」の判定**: CLI はローカルのレビューごとに `~/.coderabbit/reviews/` の下へ
  1 ディレクトリを残し、レビューしたコミットを `git.json` の `head` に、完了の状態を
  `.session-complete-v2` の `state` に持つ。完了したレビューのうち、レビューしたコミットが
  PR の head の祖先で、かつ base ブランチにまだ無いもの（このブランチの作業）が 1 つあれば通す。
  CLI の後に入れた修正のコミットは、CLI を回し直さなくてよい（ADR-3326 の「1 回だけ」と両立する）
- **止めない PR**: CodeRabbit を外した PR（`skip-coderabbit` / `adr-auto-merge` ラベル、
  または本文の ignore コマンド）と、draft でない PR
- **意図して飛ばす**: CLI が使えない環境（未インストール・未認証・枠切れ）では、コマンドの先頭に
  `KARASU_LOCAL_REVIEW_SKIPPED=<理由>` を付けると通す。飛ばしたことが transcript に残る
- **分からないときは通す**: gh が PR を読めない、`--repo` で別の repo を指している、
  レビューの記録はあるが 1 つも読めない（CLI の形式が変わった）、のどれでも止めない。
  フック自身の故障で作業を止めない
- 止めるときの理由には、`/engineering:code-review` と CLI の 2 つの手順と、飛ばし方を書く
- `gh pr create` は `--draft` / `-d` が無ければ止める。draft を経ずに ready の PR を作ると、
  このフックを素通りするため。この repo の手順は、ADR の auto-merge も含めてすべて draft から始まる
- フックの判定は、stub の gh と一時 repo を使うテスト（`require-review-before-ready.test.ts`）で固定する

## 理由

- **ready の直前に毎回届く。** 文章の手順は飛ばせたが、ツールの呼び出しを止めるフックは飛ばせない
- **CLI の記録はローカルに残るので、機械で確かめられる。** ブランチの祖先関係で判定するので、
  CLI の後の修正コミットや main の取り込みで判定が崩れない
- **止めすぎない。** CodeRabbit を外した PR と、判定できない状態は通す

## 却下した案

- **CLI のレビューが HEAD そのものを見たことを求める**: CLI の後に修正をコミットすると必ず止まり、
  修正のたびに CLI を回し直すことになる。ADR-3326 が却下した「0 件まで回す」と同じ待ちを生む
- **`/engineering:code-review` が済んだことも確かめる**: スキルは読める記録を残さない。
  セッションに印を書かせる形は自己申告で、確かめたことにならない。止めるときの理由に手順として書くだけにした
- **lefthook など git の層に置く**: `gh pr ready` は git の操作ではないので、git のフックでは捉えられない
- **CLI が使えない環境では黙って通す**: 未認証や枠切れは、手元では CLI を回さない理由として
  いつでも使えてしまう。飛ばすときは理由をコマンドに書かせ、記録に残す

## 確かめられないこと

`/engineering:code-review` を飛ばして CLI だけを回した場合、このフックは止めない。
