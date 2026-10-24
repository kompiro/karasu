---
id: ADR-3333
title: Claude が gh pr ready を実行した直後に、PostToolUse フックで /coderabbit-converge へ引き継ぐ
status: accepted
date: 2026-10-24
topic: build
authors: [kompiro]
related_to:
  - ADR-2716
  - ADR-3052
  - ADR-3011
  - ADR-3117
scope:
  packages: []
  concerns:
    - ci
assumptions:
  - "file: scripts/coderabbit/converge-after-ready.sh"
  - "grep: .claude/settings.json :: scripts/coderabbit/converge-after-ready.sh"
---

# ADR-3333: Claude が gh pr ready を実行した直後に、PostToolUse フックで /coderabbit-converge へ引き継ぐ

- **日付**: 2026-10-24
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3333](https://github.com/kompiro/karasu/issues/3333)
  - [ADR-2716](2716-coderabbit-request-changes-workflow.md): CodeRabbit の approve までラウンドを回す運用
  - [ADR-3052](3052-review-branch-diff-before-draft-pr.md): ローカルのレビューを済ませてから ready にする順序
  - [ADR-3011](3011-skip-coderabbit-label.md) / [ADR-3117](3117-coderabbit-ignore-command-for-skip.md): CodeRabbit を外す PR の判定と手段
  - `.claude/settings.json`, `scripts/coderabbit/converge-after-ready.sh`, `docs/process.md`

## 背景

`docs/process.md` の PR ワークフローは、draft を外した後に `/coderabbit-converge` で
CodeRabbit の approve までラウンドを回すと定めている。しかし 2026-10-10 以降に
`gh pr ready <n>` を実行したセッション約 40 本のうち、converge を起動したのは 7 本ほどで、
ほとんどはユーザーが手で `/coderabbit-converge` と打ったものだった。

起動しなかったのは、ほぼすべて `/hane:start-dev` か `/hane:ship` で始めたセッションである。
どちらのスキルも「CI 確認 → `status: in-review` → ここで Claude の作業は一旦完了」で終わり、
converge に触れない。process.md の手順は、`gh pr ready` を打つ時点では文脈のずっと前にあり、
スキルの明示的な「完了」に負ける。

この運用では、draft を外すのはローカルのレビューを終えた Claude 自身である。
したがって Claude の `gh pr ready` のツール呼び出しが、converge に引き継ぐ確実な時点になる。

## 決定

**`.claude/settings.json` に PostToolUse フック（matcher `Bash`）を置き、Claude が
`gh pr ready <n>` で PR を draft から外した直後に、その PR で `/coderabbit-converge` を
始めるよう文脈へ差し込む。CodeRabbit を外した PR（`skip-coderabbit` / `adr-auto-merge`
ラベル、または本文の ignore コマンド）では何も差し込まない。**

## 仕組み

- `scripts/coderabbit/converge-after-ready.sh` は、コマンドに `pr ready` を含まないときは
  すぐ終わる（約 40ms）
- **対象の PR はコマンド文字列ではなく、gh 自身の成功メッセージから読む。** `gh pr ready` は
  draft を外すと stderr に `Pull request <owner>/<repo>#<n> is marked as "ready for review"` を出す。
  フックはツールの出力（`tool_response.stdout` / `stderr`）からこの行を探す。
  `grep "gh pr ready"` や heredoc のように文字列として含むだけのコマンドではこの行が出ないので
  反応しない。別の checkout で実行したときや `--repo` 付きでも、行に repo 名が入っているので
  取り違えない。すでに ready だった PR（`is already "ready for review"`）と `--undo` も対象外になる
- `gh pr view` で PR を読み、draft でないことと CodeRabbit を外していないことを確かめてから
  `hookSpecificOutput.additionalContext` を出す。PR を読めないときは何も出さない。直前の
  `gh pr ready` が GitHub に届いているので、読めないのは例外的な状態であり、推測で促さない
- どの失敗でも exit 0 で何も出さずに終わる。フックが Bash の呼び出しを壊さないことを優先する
- 却下: コマンド文字列から PR 番号を切り出す形。文字列として含むだけのコマンドで誤って反応し、
  別の repo の PR を karasu の同じ番号の PR と取り違える
- 差し込む文は「`CI green, status: in-review` で止まるスキルよりこちらを優先する」と明示する

## 理由

- **行動を変えたい直前に毎回届く。** `.claude/rules/README.md` の層の表で、ツール実行の直前直後に
  効くのはフックの層だけである。手順書やメモでは、スキルの「完了」の後ろに割り込めなかった
- **repo の中で完結する。** `.claude/settings.json` とスクリプトは PR でレビューでき、この repo の
  すべてのセッションに効く。hane のリリースを待たない
- **判定を機械で行う。** draft かどうか・外した PR かどうかを gh の出力で決めるので、Claude の
  自己判断に依存しない。テスト（`converge-after-ready.test.ts`）が gh のスタブで各分岐を固定する

## 却下した案

- **gh 自体にフックを掛ける**: gh には実行前後のフックの仕組みがない。`gh alias set` は組み込み
  コマンド（`pr`、`pr ready`）を上書きできず、extension も組み込みコマンドを上書きできない。
  `gh` という名前のラッパーを PATH に置く方法は、mise の shim より前に置く必要があり、repo の外の
  設定になり、他の repo の `gh pr ready` でも動く
- **GitHub Actions の `ready_for_review` イベント**: どの方法で draft を外しても発火するが、
  手元の Claude セッションには届かない。クラウドで converge を回すのは別の設計で、課金と、
  手元のセッションとの review 枠の取り合いが生じる
- **`/hane:start-dev` と `/hane:ship` を直す**: 他の repo にも効くが、hane のリリースが要る。
  本フックと両立するので、別に進めてよい
