# Agent Worktree Coexistence Verification

- **日付**: 2026-05-03
- **ステータス**: 完了
- **関連**: #1075（親）, #1085（このタスク）, #1086（このレポートを使う decouple ステップ）, [skills-plugin-portability-audit](skills-plugin-portability-audit.md)

## 目的

`.claude/worktrees/<branch-name>` をユーザー作成の永続 worktree 配置先として採用したとき、Claude Code の `Agent` ツール（`isolation: "worktree"`）が同ディレクトリ配下に作る自動 worktree と安全に共存できることを実証する。

## 結論

**共存に問題なし**。Plugin 化の前提として `.claude/worktrees/<branch>` を採用してよい。ただしホスト repo に **`.claude/worktrees/` を `.gitignore` に追加する**ことが Stop hook 等の untracked 検査と両立する前提条件。

## 検証方法

公式ドキュメントには Agent worktree の挙動が記載されていない（[agent-sdk/overview](https://code.claude.com/docs/en/agent-sdk/overview.md) 等にも明記なし）ため、本リポジトリで `Agent` ツールを `isolation: "worktree"` で起動し、観察した。

### 観測した挙動

1. **配置先**: `/workspaces/karasu/.claude/worktrees/agent-<hex16>/`
   - 親 repo の `.claude/worktrees/` 配下に作成される。
2. **命名**: `agent-<16桁hex>`（例: `agent-add7d227b3536a429`）
   - ブランチ名は `worktree-agent-<同じhex>` で、ユーザーが `feat/`, `fix/`, `chore/` 等で命名する慣習と衝突しない。
3. **ロック**: 自動生成 worktree は `git worktree list` で `locked` 表示。
4. **クリーンアップ**: Agent が **ファイルを変更せずに終了した場合**、worktree ディレクトリ・git worktree 登録・ブランチがすべて自動削除される（Agent ツール定義の `isolation: "worktree"` の説明と一致: "the worktree is automatically cleaned up if the agent makes no changes; otherwise the path and branch are returned in the result"）。
5. **他 worktree への干渉**: なし。Agent 実行中に手動作成した `.claude/worktrees/test-coexist` を観察 → Agent 実行後も手動 worktree は touched せず残存。

### 検証ログ抜粋

#### Agent worktree 自動生成・自動クリーンアップ

```
# Agent 起動前
$ ls -la /workspaces/karasu/.claude/worktrees/
(empty)

# Agent 実行中（中で git worktree list を実行）
/workspaces/karasu/.claude/worktrees/agent-add7d227b3536a429  c6c2206 [worktree-agent-add7d227b3536a429] locked

# Agent 終了後
$ ls -la /workspaces/karasu/.claude/worktrees/
(empty)
```

#### 手動 worktree との共存

```
# 手動 worktree を作成
$ git worktree add .claude/worktrees/test-coexist -b chore/test-coexist origin/main

# Agent 実行中（ls /workspaces/karasu/.claude/worktrees/）
agent-a39c73307df188740   ← Agent 自動生成
test-coexist              ← 手動作成（無傷）

# Agent 終了後（無変更で終了）
test-coexist              ← 手動作成のみ残る、Agent 自動分は消滅
```

## 副次的な発見: Stop hook と untracked 検出

karasu の `.claude/settings.json` には `git status --short` で未コミット/untracked を検出してブロックする Stop hook が定義されている。

```
$ git status --short
?? .claude/worktrees/
```

`.claude/worktrees/` をホスト repo の `.gitignore` に **追加していない場合**、worktree 配下が untracked として扱われ Stop hook が誤発火する。`.gitignore` への追加で:

```
$ git status --short
(空)
```

→ 完全に解消する。Plugin の README で必須前提として明記する。

## Plugin 化への含意

| 項目 | 結論 |
|---|---|
| `.claude/worktrees/<branch>` 採用 | ✅ 安全 |
| 自動 worktree とのパス衝突リスク | なし（命名空間が `agent-<hex>` で分離） |
| Agent による手動 worktree の誤削除 | なし（自身が作ったもののみクリーンアップ） |
| ホスト repo 必須前提 | `.claude/worktrees/` を `.gitignore` に追加 |
| Plugin 内で実装すべき配慮 | なし（特殊なロックや命名回避は不要） |

## 次ステップ

#1086（decouple）で skill 内の worktree パスを `.worktrees/<branch>` から `.claude/worktrees/<branch>` に切り替える。`.gitignore` 更新は #1087（karasu housekeeping）で対応する。
