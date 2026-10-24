---
id: ADR-3335
title: main へのコミットは lefthook の pre-commit / pre-merge-commit で拒否し、main checkout の未コミット変更を見る Stop フックは廃止する
status: accepted
date: 2026-10-24
topic: build
authors: [kompiro]
related_to:
  - ADR-1085
scope:
  packages: []
  concerns:
    - ci
assumptions:
  - "file: scripts/git/refuse-commit-on-main.sh"
  - "grep: lefthook.yml :: bash scripts/git/refuse-commit-on-main.sh"
---

# ADR-3335: main へのコミットは lefthook の pre-commit / pre-merge-commit で拒否し、main checkout の未コミット変更を見る Stop フックは廃止する

- **日付**: 2026-10-24
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3335](https://github.com/kompiro/karasu/issues/3335)
  - [ADR-1085](1085-agent-worktree-coexistence.md): worktree を `.claude/worktrees/<branch>` に置く決定。Stop フックに触れているのは理由の 1 行だけ
  - `lefthook.yml`, `scripts/git/refuse-commit-on-main.sh`, `.claude/settings.json`, `docs/process.md`

## 背景

`main` への直接コミットは禁止で、作業は `.claude/worktrees/<branch>` の worktree で行う
（CLAUDE.md、`docs/process.md`「ブランチ戦略」）。それでも、あるセッションがプロジェクトルート
（main checkout）で変更を入れ、そのまま `main` にコミットした。ローカルの `main` が
`origin/main` からずれ、手で戻す必要があった。この事故を防ぐために `.claude/settings.json` の
Stop フックが使われていた。

Stop フックの経緯は ADR に無く、commit にだけ残っていた。

| 日付 | 変更 | 中身 |
| --- | --- | --- |
| 2026-03-18 | 66e7eb34 | plan の実行後に `/commit` を自動で起動する Stop フックとして追加 |
| 2026-04-01 | #214 / #223 | prompt 型をやめ、`git status` で判定するコマンドにした |
| 2026-04-14 | #628 | 判定をセッションの cwd に絞った |
| 2026-08-02 | #2268 | 判定を main checkout に固定し、理由文から「`/commit` せよ」を外した |

この形には 2 つの問題があった。

- **コミットを止めない。** Stop フックはセッションが終わるときに未コミットの変更を報告するだけで、
  防ぎたかった `main` へのコミットそのものは止めない。セッションの外（人間・別のツール）の
  コミットにも効かない
- **解消できない誤検知でループする。** main checkout にある未コミットの変更なら、そのセッションが
  作ったものでなくても止める。2026-10-24 には、maintainer の動作確認の残りの 1 行でセッションが
  止まり続け、セッションに取れる行動では解消できなかった。#2268 が直したのも同じ種類のループ
  （別の worktree にある他のセッションの変更で止まる）だった

## 決定

**`main` の上でのコミットを、lefthook の `pre-commit` と `pre-merge-commit` で拒否する。
`.claude/settings.json` の Stop フックは削除する。**

## 仕組み

- `scripts/git/refuse-commit-on-main.sh` は、`git symbolic-ref --short HEAD` が `main` のとき
  exit 1 で止め、worktree のブランチで作業するよう案内する
- `pre-commit` は通常のコミット、`pre-merge-commit` はマージコミット（fast-forward にならない
  `git pull` など）を止める。fast-forward の取り込みはコミットを作らないので通る
- detached HEAD（rebase・bisect）はブランチを持たないので通す
- git のフックは `.git/hooks` 1 か所で、すべての worktree が共有する。プロジェクトルートでも
  どの worktree でも、誰がコミットしても同じ判定になる。インストールは `pnpm install` 時の
  lefthook の postinstall が行う
- CI のリリース（`release-prepare.yml`）は `chore/release-<日付>` ブランチでコミットするので影響しない
- テスト（`refuse-commit-on-main.test.ts`）は一時 repo で main・ブランチ・detached HEAD を確かめ、
  `lefthook.yml` の 2 つのフックに登録されていることも確かめる

## 理由

- **事故の本体であるコミットを、起きる前に止める。** Stop フックの報告は事後で、止める力がなかった
- **経路を問わない。** Claude のセッションでも人間の手作業でも、Bash でも別のツールでも、
  コミットは git のフックを通る
- **誤検知のループが無くなる。** コミットしようとした本人だけが止まり、変更をブランチに移せば
  解消できる。他人の未コミットの変更は誰も止めない
- **仕組みが増えない。** この repo は既に lefthook で pre-push のチェックを回している

## 却下した案

- **Stop フックを残し、「このセッションが作った変更」だけを見るように狭める**: SessionStart で
  ルートの状態を記録し、差分だけで止める形。誤検知は減るが、コミットを止めない点は変わらない
- **Claude Code の PreToolUse フックで、main checkout への Edit / Write と `git commit` を止める**:
  Claude のツール呼び出しにしか効かず、Bash の書き込み（`sed -i`、リダイレクト）はコマンド文字列から
  見分けきれない。コミットを止めるなら git の層の方が確実で、人間の手作業にも効く
- **GitHub の branch protection だけに頼る**: リモートの `main` への push は既に止まるが、
  事故はローカルの `main` がずれることで、push の前に起きている

## 失うもの

Claude がプロジェクトルートに未コミットの変更を置いたまま終わったとき、それを知らせる仕組みは
無くなる。コミットしようとした時点で止まるので `main` はずれないが、変更はルートに残る。

## 止められないもの

使い捨ての clone で確かめた（2026-10-24）。変更をステージした `git commit`（過去の事故の形）と、
`main` の上のマージコミットは止まる。次は止まらない。

- `git cherry-pick`: git の仕様で `pre-commit` を通らない
- ステージした変更が無いコミット（`--allow-empty`、`commit --amend` だけ）: lefthook はステージした
  ファイルが無いと `pre-commit` のコマンドを skip する
- `--no-verify`: フックを明示的に飛ばす。process.md はフックの回避を認めていない

これらまで塞ぐなら、`reference-transaction` フックで `refs/heads/main` の更新そのものを見る形になる。
fast-forward の `git pull` を通す判定（新しい値が `origin/main` から辿れるか）が要り、今回は見送った。
