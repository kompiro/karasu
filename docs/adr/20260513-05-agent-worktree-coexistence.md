---
id: ADR-20260513-05
title: ユーザー作成 worktree は `.claude/worktrees/<branch>` 配下に置き、Claude Code Agent の自動 worktree と共存させる
status: accepted
date: 2026-05-13
topic: build
related_to:
  - ADR-20260513-04
assumptions:
  - "grep: .gitignore :: .claude/worktrees/"
  - "grep: CLAUDE.md :: .claude/worktrees/<branch-name>"
---

# ADR-20260513-05: ユーザー作成 worktree は `.claude/worktrees/<branch>` 配下に置き、Claude Code Agent の自動 worktree と共存させる

- **日付**: 2026-05-13
- **ステータス**: 決定済み
- **関連**:
  - 親 Issue: [#1075](https://github.com/kompiro/karasu/issues/1075)（skills plugin 切り出しトラッキング）
  - 検証 Issue: [#1085](https://github.com/kompiro/karasu/issues/1085) — `.claude/worktrees/<branch>` と Agent 自動 worktree の共存検証
  - 検証レポート PR: [#1116](https://github.com/kompiro/karasu/pull/1116)（旧 `docs/design/agent-worktree-coexistence-verification.md` — 本 ADR に集約して削除）
  - 適用先: [#1086](https://github.com/kompiro/karasu/issues/1086)（skill の worktree パス変更）, [#1087](https://github.com/kompiro/karasu/issues/1087)（karasu 側 `.gitignore` 更新）
  - 関連 ADR: [ADR-20260513-04](20260513-04-skills-plugin-portability.md)（skills plugin portability — worktree path 統一の根拠）

## 背景

`kompiro/hane` plugin（ADR-20260513-04）の前提として、ユーザーが手動で作る永続 worktree の配置先を統一する必要があった。候補は次の二つ:

1. `.worktrees/<branch-name>` — 従来 karasu で使っていた配置
2. `.claude/worktrees/<branch-name>` — `.claude/` 配下に寄せて Claude Code 関連の生成物と同居させる

公式ドキュメントには Claude Code の `Agent` ツール（`isolation: "worktree"`）が作る自動 worktree の配置先が明記されておらず、後者を採用したときに `Agent` の自動 worktree とパスが衝突したり、Agent のクリーンアップが手動 worktree を巻き込む懸念があった。Plugin の README で安全に「`.claude/worktrees/<branch>` を使ってください」と書くには、この前提を実証で確認しておく必要がある。

## 決定

**ユーザー作成 worktree は `.claude/worktrees/<branch-name>` 配下に置く。** plugin はこのパスを前提に動作する。karasu repo の `.gitignore` には `.claude/worktrees/` を含める。

実証で確認した事実:

- `Agent` ツールの自動 worktree は `.claude/worktrees/agent-<16桁hex>/` に作られる（ブランチ名は `worktree-agent-<同じhex>`）。
- 自動生成 worktree は `git worktree list` で `locked` 表示。
- Agent がファイルを変更せずに終了した場合、worktree ディレクトリ・git worktree 登録・ブランチがすべて自動削除される（ファイル変更があった場合はパス・ブランチを返却して保持）。
- Agent 実行中・終了後とも、手動で作った `.claude/worktrees/test-coexist` には影響しない（Agent は自身が作った worktree のみクリーンアップ対象）。
- 命名空間が `agent-<hex>` に固定されているため、ユーザーが `feat/` / `fix/` / `chore/` 等の慣習で命名する手動 worktree と衝突しない。

## 理由

- **plugin の前提として安全**: パス衝突・誤削除のリスクが共に無いことを実証で確認した。plugin の README に「`.claude/worktrees/<branch-name>` を使う」と書ける根拠になる
- **`.claude/` 配下の一貫性**: skills / settings / hooks など Claude Code 関連の成果物は `.claude/` 配下に集約されており、worktree も同居させることでホスト repo の root を汚さない
- **Agent 自動 worktree との命名空間分離**: `agent-<hex>` 形式は user-facing なブランチ命名と衝突しない。Plugin 側で特殊なロックや命名回避を入れる必要がない
- **karasu の前提条件は最小**: `.gitignore` に `.claude/worktrees/` を 1 行追加するだけ。これは Stop hook の `git status --short` untracked 検査が誤発火するのを防ぐためにも必須

## 却下した案

- **`.worktrees/<branch>` を維持する**: ホスト repo の root にディレクトリが増える。Claude Code 関連の生成物を `.claude/` に集約する方針と分かれてしまう。安全性は同等だが、配置先のばらつきが plugin 採用者に対して説明コストになる。却下
- **plugin 内で Agent 自動 worktree との衝突回避を実装する（例: 配置先を `.claude/worktrees/user/<branch>` のように一段深くする）**: 実証で衝突しないことが確認できたため不要。階層を深くすると人間が `cd` で扱う際の摩擦が増える。却下

## 影響範囲

- **karasu 側**: `.gitignore` に `.claude/worktrees/` を追加済み（#1087）。`CLAUDE.md` の worktree 規約も `.claude/worktrees/<branch-name>` に統一済み
- **plugin 側**: `kompiro/hane` の `start-dev` / `ship` / cleanup 処理は `.claude/worktrees/<branch>` を前提に動く（#1086 で適用済み）
- **採用 repo の前提**: 採用 repo は `.claude/worktrees/` を `.gitignore` に追加する必要がある。plugin README で必須前提として明記する
