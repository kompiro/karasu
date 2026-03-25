---
name: start-dev
description: >
  機能ブランチ開発ワークフロー: Issue作成 → worktree作成 → 計画 → 実装 → コミット → PR作成。
  セッション内で worktree を管理する。
  Trigger when the user says: "feature開発", "開発開始", "新機能開発", "PRワークフロー",
  "start dev", "start feature", "new feature", or similar phrases requesting to start development.
---

# Feature Development Workflow

セッション内で worktree を作成・管理し、計画 → 実装 → コミット → PR作成の流れで開発を進める。

## 前提条件

- `gh auth status` で GitHub 認証済みであること

## 手順

### 1. Issue 作成

1. 対象の機能ドキュメント（`docs/features/planned/` または `docs/features/ideas/`）を読む
2. `gh issue create` で GitHub Issue を作成する
   - タイトル: 機能の簡潔な説明
   - 本文: 機能ドキュメントの内容を転記（概要、要件、未決定事項）
   - ラベル: `enhancement`
3. Issue 番号を控える（PR との紐付けに使用）

### 2. Worktree 作成

`git worktree` コマンドで隔離された作業環境を作成する。

1. main を最新化する: `git fetch origin main`
2. ブランチ命名規則に従って worktree を作成する:
   ```
   git worktree add .worktrees/<機能名> -b <branch-name> origin/main
   ```
   - `feat/<機能名>` — 新機能
   - `fix/<修正名>` — バグ修正
   - `docs/<ドキュメント名>` — ドキュメントのみ
   - `chore/<タスク名>` — ビルド、CI、ツール設定
   - `refactor/<対象名>` — リファクタリング
3. worktree に移動し、依存関係をインストールする:
   ```
   cd .worktrees/<機能名>
   npm ci
   ```

> 以降のすべての作業は worktree ディレクトリ内で行う。

### 3. 計画（Plan モード）

1. 関連するドキュメントを確認する:
   - 機能ドキュメント: `docs/features/planned/`
   - 設計ドキュメント: `docs/design/`
   - 仕様: `docs/spec/`
2. 実装計画を作成する。計画には以下を含める:
   - 変更対象ファイル
   - 実装手順
   - アクセプタンステスト（`docs/acceptance/`）の項目
3. ユーザーにレビューを依頼し、承認を得てから次のステップに進む

### 4. 実装

1. 承認された計画に基づいて実装を進める
2. テストを書き、通過を確認する: `npm test`
3. コード品質を確認する: `npm run lint` / `npm run format:check`

### 5. コミット

`/commit` スキルを使用して、関心事ごとに Conventional Commits 形式でコミットする。

### 6. PR 作成

1. `git push -u origin <branch-name>` でリモートにプッシュする
2. `gh pr create` で PR を作成する。PR には以下を含める:
   - **目的**: `Closes #<Issue番号>` で Issue と紐付け
   - **概要**: 変更内容の要約（1-3行）
   - **変更内容**: 主要な変更のリスト
   - **手動検証チェックリスト**: CI では検証できない項目
   - **関連ドキュメント**: 更新した docs/acceptance/ 等へのリンク
3. PR の URL をユーザーに通知する

### 7. CI 確認

1. `gh pr checks <pr-number>` で CI の状態を確認する
2. CI が失敗した場合は修正し、追加コミットをプッシュする
3. CI が通過したらユーザーに手動検証を依頼する

> ここで Claude の作業は一旦完了。
> レビューと PR マージは GitHub 上でユーザーが行う。

### 8. クリーンアップ

ユーザーから「マージした」「クリーンアップして」等の指示を受けたら実行する。

1. PR の状態を確認する: `gh pr view <pr-number> --json state`
2. マージ済みであることを確認してから worktree を削除する:
   ```
   cd /workspaces/karasu
   git worktree remove .worktrees/<機能名>
   git branch -d <branch-name>
   ```

リモートブランチは GitHub 上で PR マージ時に自動削除される設定を推奨。
