---
id: ADR-3342
title: ブランチでローカルの CLI レビューが済むまで、Claude のセッションの gh で gh pr ready を拒否する
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
  - ADR-3504
scope:
  packages: []
  concerns:
    - ci
assumptions:
  - "file: scripts/bin/gh"
  - "file: scripts/coderabbit/ready-gate.sh"
  - "grep: .claude/settings.json :: scripts/coderabbit/session-path.sh"
---

# ADR-3342: ブランチでローカルの CLI レビューが済むまで、Claude のセッションの gh で gh pr ready を拒否する

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
余分な回のうち 3 回は、ローカルのレビューで拾えたはずの 1 つの種類の問題を 1 か所ずつ直したものだった。
文章の手順だけでは、飛ばすことを止められなかった。

## 決定

**Claude のセッションでは、PATH の先頭に置いた gh のラッパー（`scripts/bin/gh`）を通して gh を
実行する。ラッパーは、このブランチで完了した CodeRabbit CLI のローカルレビューが無いあいだは
`gh pr ready` を拒否し、`--draft` の無い `gh pr create` も拒否する。それ以外の gh の呼び出しは、
そのまま本物の gh に渡す。**

## 仕組み

- **PATH に入れる**: SessionStart フック（`scripts/coderabbit/session-path.sh`）が
  `$CLAUDE_ENV_FILE` に、`scripts/bin` を PATH の先頭に足す行を書く。Claude Code は Bash の
  コマンドを実行するたびにこのファイルを読み込む。SessionStart は resume・`/clear`・compaction でも
  走るので、行は重複しても PATH に 1 つだけ入る形にする。ユーザーのターミナルには入らない
- **ラッパー**: `scripts/bin/gh` は、PATH の上でラッパー自身を除いた最初の `gh` を本物とみなす。
  `gh pr ready` / `gh pr create` のときだけ `scripts/coderabbit/ready-gate.sh` に gh の引数を渡し、
  拒否の理由が返れば stderr に出して終了コード 1 で終わる。それ以外は本物の gh を `exec` する
- **「済んでいる」の判定**: CLI はローカルのレビューごとに `~/.coderabbit/reviews/` の下へ
  1 ディレクトリを残し、レビューしたコミットを `git.json` の `head` に、完了の状態を
  `.session-complete-v2` の `state` に持つ。完了したレビューのうち、レビューしたコミットが
  PR の head の祖先で、かつ base ブランチにまだ無いもの（このブランチの作業）が 1 つあれば通す。
  CLI の後に入れた修正のコミットは、CLI を回し直さなくてよい（ADR-3326 の「1 回だけ」と両立する）
- **拒否しない場合**: CodeRabbit を外した PR（`skip-coderabbit` / `adr-auto-merge` ラベル、
  または本文の ignore コマンド）、draft でない PR、`--undo`、`--repo` / `-R`（手元の checkout が
  その repo を持つとは限らない）
- **意図して飛ばす**: CLI が使えない環境（未インストール・未認証・枠切れ）では、
  `KARASU_LOCAL_REVIEW_SKIPPED=<理由> gh pr ready <n>` で実行する。理由が空なら飛ばさない。
  飛ばしたことが transcript に残る
- **分からないときは通す**: gh が PR を読めない、レビューの記録はあるが 1 つも読めない
  （CLI の形式が変わった）、のどちらでも拒否しない。ゲート自身の故障で作業を止めない
- 拒否の理由には、`/engineering:code-review` と CLI の 2 つの手順と、飛ばし方を書く
- テスト（`ready-gate.test.ts`）は、偽の「本物の gh」と一時 repo で、ラッパー経由の判定を固定する

## 理由

- **実行される gh の引数そのものを見る。** コマンドの文字列を実行前に読む方式では、`eval` や
  文字列の連結で組み立てたコマンド、スクリプトファイルの中、`xargs` の先で実行される gh を
  捉えられない。シェルの構文（引用・heredoc・キーワード・ラッパーとそのオプション・代入）を
  解析する必要も無くなる
- **ready の直前に毎回効く。** 文章の手順は飛ばせたが、gh そのものを通る判定は飛ばせない
- **CLI の記録はローカルに残るので、機械で確かめられる。** ブランチの祖先関係で判定するので、
  CLI の後の修正コミットや main の取り込みで判定が崩れない
- **拒否しすぎない。** CodeRabbit を外した PR と、判定できない状態は通す

## 却下した案

- **PreToolUse フックで、Bash のコマンド文字列を解析して止める**: 最初はこの形で実装した
  （#3343 の初期のコミット）。文字列の検索、続いてシェルの小さなトークナイザで判定したが、
  CodeRabbit のレビューのたびに、解析の穴（heredoc の後ろのコマンド、`then` の後ろ、
  `env -u FOO` のようにオプションが値を取るラッパー、最後の代入が空のスキップの印）が
  別の角度から見つかり続けた。前置きの列挙に際限がなく、そもそも `eval` やスクリプトファイルの中の
  gh は原理的に見えない
- **CLI のレビューが HEAD そのものを見たことを求める**: CLI の後に修正をコミットすると必ず拒否され、
  修正のたびに CLI を回し直すことになる。ADR-3326 が却下した「0 件まで回す」と同じ待ちを生む
- **`/engineering:code-review` が済んだことも確かめる**: スキルは読める記録を残さない。
  セッションに印を書かせる形は自己申告で、確かめたことにならない。拒否の理由に手順として書くだけにした
- **lefthook など git の層に置く**: `gh pr ready` は git の操作ではない
- **`.claude/settings.json` の `env` で PATH を足す**: `env` の値はシェルで展開されないので、
  既存の `$PATH` に足せない
- **CLI が使えない環境では黙って通す**: 未認証や枠切れは、手元では CLI を回さない理由として
  いつでも使えてしまう。飛ばすときは理由を書かせ、記録に残す

## 確かめられないこと

- `/engineering:code-review` を飛ばして CLI だけを回した場合は拒否しない
- `/usr/bin/gh` のように絶対パスで呼んだ gh と、GitHub の MCP ツールで draft を外した場合は
  ラッパーを通らない。どちらも手順どおりの呼び方ではない
- サブエージェントの Bash に `$CLAUDE_ENV_FILE` が効くかは、ドキュメントで確認できていない
