---
name: ship
description: >
  コミット済みの変更を PR 作成 → CI 確認 → クリーンアップまで進めるワークフロー。
  start-dev スキルを使わずに開発した場合にも対応する。
  Trigger when the user says: "ship", "ship it", "PRを作って", "PR作成",
  "プッシュしてPR", "出荷", "create PR", "push and PR", "submit PR",
  "マージまで", or similar phrases requesting to push, create a PR, or finish development.
---

# Ship Workflow

コミット済みの変更を PR 作成 → CI 確認 → クリーンアップまで進める。
`/start-dev` を使わずにブランチで直接開発した場合にも対応する。

## 前提条件

- `gh auth status` で GitHub 認証済みであること
- 現在のブランチが `main` でないこと（機能ブランチ上であること）
- コミット済みの変更があること

## 手順

### 0. 状態確認

スキル開始時に現在の状態を自動検出する。

1. 現在のブランチ名を取得する: `git branch --show-current`
2. `main` ブランチ上の場合はエラーメッセージを表示して終了する
3. 未コミットの変更を確認する: `git status --porcelain`
   - 未コミットの変更がある場合、`/commit` スキルを実行してコミットする
   - コミット完了後、後続の処理を続行する
4. main からの差分コミット一覧を取得する: `git log --oneline origin/main..HEAD`
   - コミットがない場合はエラーメッセージを表示して終了する
5. worktree 内かどうかを判定する: `git rev-parse --show-toplevel`
   - `.worktrees/` を含む場合は worktree 内と判定する
6. 関連 Issue を検出する:
   - ブランチ名からパターンマッチ（例: `feat/issue-42-xxx` → #42）
   - コミットメッセージ内の `#N` パターン
   - 見つからない場合はユーザーに Issue 番号を確認する（なしも可）

### 1. PR 作成

1. リモートにプッシュする:
   ```
   git push -u origin <branch-name>
   ```
2. `git log --oneline origin/main..HEAD` と `git diff origin/main...HEAD --stat` で変更内容を分析する
3. PR 本文を生成する。`.github/PULL_REQUEST_TEMPLATE.md` のセクション構成に従い、コメントを実際の内容で埋める:

   - **Purpose**: `Closes #N` で Issue と紐付け。Issue がない場合は変更の目的を1行で記述
   - **Summary**: コミット履歴と差分から1-3行で要約
   - **Changes**: 主要な変更をリストで記述（コミット単位ではなく意味のある変更単位でまとめる）
   - **Manual Verification Checklist**: CI では検証できない項目。なければ `N/A — all covered by automated tests`
   - **Related Docs**: 更新した docs/ 内のファイル。なければ `N/A`

4. PR タイトルを生成する:
   - Conventional Commits 形式に準拠する（例: `feat(core): add team property parsing`）
   - ブランチのコミット群の主要な変更を反映する
   - 70文字以内に収める
5. 生成した PR タイトルと本文をユーザーに提示し、確認を得る
6. 承認後、`gh pr create` で PR を作成する:
   ```
   gh pr create --title "<title>" --body "<body>"
   ```
7. PR の URL をユーザーに通知する

### 2. CI 確認

1. PR 番号を取得する（`gh pr create` の出力から）
2. CI の完了を待つ: `gh pr checks <pr-number> --watch`
3. CI の結果に応じて対応する:
   - **全て通過**: ユーザーに手動検証チェックリストの実施を依頼する
   - **失敗**: 失敗したジョブのログを確認し、修正を提案する
     - 修正が必要な場合: 修正 → `/commit` → `git push` → 再度 CI 確認
4. CI 通過後のメッセージ:

   ```
   CI が通過しました。
   手動検証チェックリストの項目を確認してください。
   確認完了後、GitHub 上で PR をマージしてください。

   マージ後に「クリーンアップして」と言っていただければ、
   ローカルブランチ（と worktree）を削除します。
   ```

> ここで Claude の作業は一旦完了。
> レビューと PR マージは GitHub 上でユーザーが行う。

### 3. クリーンアップ

ユーザーから「マージした」「クリーンアップして」等の指示を受けたら実行する。

1. PR の状態を確認する: `gh pr view <pr-number> --json state`
2. マージ済みでない場合は警告し、確認を求める
3. マージ済みの場合、環境に応じてクリーンアップする:

   **worktree 内の場合:**
   ```
   cd /workspaces/karasu
   git worktree remove .worktrees/<機能名>
   git branch -d <branch-name>
   ```

   **通常ブランチの場合:**
   ```
   git checkout main
   git pull origin main
   git branch -d <branch-name>
   ```

4. クリーンアップ完了をユーザーに通知する

リモートブランチは GitHub 上で PR マージ時に自動削除される設定を推奨。
