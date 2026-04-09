---
name: start-dev
description: >
  機能ブランチ開発ワークフロー: Issue/DesignDoc確認 → worktree作成 → 計画 → 実装 → コミット → PR作成。
  セッション内で worktree を管理する。
  Trigger when the user says: "feature開発", "開発開始", "新機能開発", "PRワークフロー",
  "start dev", "start feature", "new feature", or similar phrases requesting to start development.
---

# Feature Development Workflow

セッション内で worktree を作成・管理し、計画 → 実装 → コミット → PR作成の流れで開発を進める。

## 前提条件

- `gh auth status` で GitHub 認証済みであること

## 手順

### 1. Issue の確認

開発の起点は以下のいずれか。スキル起動時の引数や会話の文脈から判断する。

**A. Issue 番号が指定された場合（例: `#61`）**
- `gh issue view <N>` で内容を確認する
- Issue 本文に Design Doc へのリンクがあれば読む
- Issue 番号を控える（PR との紐付けに使用）
- Issue のラベルを `status: implementing` に更新する:
  ```
  gh issue edit <N> --remove-label "status: ready" --remove-label "status: blocked" --add-label "status: implementing"
  ```

**B. Issue 番号が指定されていない場合**
- `gh issue list --state open` を表示してユーザーに確認する
- Issue なしで進む場合はそのまま次のステップへ
- Issue を選択した場合は A と同様にラベルを `status: implementing` に更新する

> Issue がない場合もある。Design Doc だけを起点に開発を始めることも、
> Issue も Design Doc もなく着手するケースもある。

### 2. Design Doc の確認

`docs/design/` に関連する設計ドキュメントがあれば読む。

- Issue 本文や会話に Design Doc への言及があれば優先的に読む
- 明示的な言及がなければ `docs/design/` を一覧して関連しそうなものを確認する
- Design Doc が見つかれば内容を把握してステップ3へ進む
- Design Doc が存在しない場合は、ステップ4（計画）で必要性を判断する

### 3. Worktree 作成

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
   pnpm install
   ```

> 以降のすべての作業は worktree ディレクトリ内で行う。

### 4. 計画（Plan モード）

1. Design Doc が存在しない場合、以下の基準で作成の要否を判断する:
   - **作成する**: アーキテクチャ上の選択肢があり、意思決定の根拠を残すべき場合
   - **スキップ**: バグ修正・軽微な変更・決定事項がすでに明確な場合
   - 作成する場合は `/design-doc` スキルを使用し、ユーザーのレビューを得てから次へ進む
   - Issue がある場合はラベルを `status: designing` に更新する:
     ```
     gh issue edit <N> --remove-label "status: implementing" --add-label "status: designing"
     ```

2. Design Doc を作成した場合は、PR を作成して承認の証跡を残す:
   1. DesignDoc ファイルのみをコミットする（`/commit` スキルを使用）。**コミット完了後はユーザーの返答を待たず即座に次へ進む。**
   2. `git push -u origin <branch-name>` でリモートにプッシュする
   3. PR 本文に Design Doc のサマリーと Purpose を記述して `gh pr create` で作成する（Issue がある場合は `Refs #N` で紐付け。`Closes #N` は実装完了 PR で使用する）
   4. ユーザーに PR URL を通知し、**マージを依頼する**
   5. ユーザーから「マージした」との確認を得てから次へ進む
   6. Issue がある場合はラベルを `status: designed` に更新する:
      ```
      gh issue edit <N> --remove-label "status: designing" --add-label "status: designed"
      ```
   7. 実装用の新しい worktree とブランチを作成し直す（ステップ3の手順に従う）
   8. Issue がある場合はラベルを `status: implementing` に更新する:
      ```
      gh issue edit <N> --remove-label "status: designed" --add-label "status: implementing"
      ```

3. 収集した情報（Issue・Design Doc・`docs/spec/`・`docs/acceptance/`）をもとに実装計画を作成する
4. 計画には以下を含める:
   - 変更対象ファイル
   - 実装手順
   - アクセプタンステスト（`docs/acceptance/`）の項目
5. ユーザーにレビューを依頼し、承認を得てから次のステップに進む

### 5. 実装

1. 承認された計画に基づいて実装を進める
2. テストを書き、通過を確認する: `pnpm test`
3. コード品質を確認する: `pnpm run lint` / `pnpm run format:check`

### 6. コミット

`/commit` スキルを使用して、関心事ごとに Conventional Commits 形式でコミットする。
**コミット完了後はユーザーの返答を待たず、即座にステップ7（PR作成）へ進む。**

### 7. PR 作成

1. `git push -u origin <branch-name>` でリモートにプッシュする
2. PR 本文を生成する。`.github/PULL_REQUEST_TEMPLATE.md` のセクション構成に従い、コメントを実際の内容で埋める:
   - **Purpose**: `Closes #N` で Issue と紐付け。Issue がない場合は変更の目的を1行で記述
   - **Summary**: コミット履歴と差分から1-3行で要約
   - **Changes**: 主要な変更をリストで記述（コミット単位ではなく意味のある変更単位でまとめる）
   - **Manual Verification Checklist**: CI では検証できない項目。なければ `N/A — all covered by automated tests`
   - **Related Docs**: 更新した docs/ 内のファイル。なければ `N/A`
3. `gh pr create` で PR を作成し、URL をユーザーに通知する

### 8. CI 確認

1. `gh pr checks <pr-number> --watch` で CI の完了を待つ
2. CI が失敗した場合は修正し、追加コミットをプッシュする
3. CI が通過したらステップ 8.5 のポストチェックへ進む

### 8.5. ポストチェック

CI 通過後、以下のチェックを順に実行する。

1. **コンフリクト確認**: `gh pr view <pr-number> --json mergeable` で確認する
   - `CONFLICTING` の場合はユーザーに通知し、コンフリクト解消を案内する
   - `MERGEABLE` または `UNKNOWN` の場合は次へ進む
2. **PR Description の言語確認**: `gh pr view <pr-number> --json title,body` で取得し、タイトルと本文が英語であることを確認する
   - 日本語やその他の非英語テキストが含まれている場合は警告し、修正を提案する
3. **コードレビュー**: `/review` を実行して PR の変更内容をレビューし、GitHub にレビューコメントを投稿する

すべてのチェック完了後、Issue がある場合はラベルを `status: in-review` に更新する:

   ```
   gh issue edit <N> --remove-label "status: implementing" --add-label "status: in-review"
   ```

ユーザーに手動検証を依頼する。
動作確認用に Preview URL を表示する。`cloudflare/wrangler-action` は PR コメントではなく GitHub Deployment ステータスを作成するため、ブランチ名から URL を構築する。Cloudflare Pages はブランチ名の `/` を `-` に変換するので注意すること:

   ```
   # ブランチ名の / を - に変換して URL を構築する
   # 例: feat/my-feature → https://feat-my-feature.karasu.pages.dev
   BRANCH=$(git rev-parse --abbrev-ref HEAD | sed 's/\//-/g')
   echo "Preview URL: https://${BRANCH}.karasu.pages.dev"
   ```

   取得した URL をユーザーに表示する:

   ```
   Preview URL: https://<sanitized-branch>.karasu.pages.dev
   ```

> ここで Claude の作業は一旦完了。
> レビューと PR マージは GitHub 上でユーザーが行う。

### 9. クリーンアップ

ユーザーから「マージした」「クリーンアップして」等の指示を受けたら実行する。

1. PR の状態を確認する: `gh pr view <pr-number> --json state`
2. マージ済みであることを確認してから worktree を削除する:
   ```
   cd /workspaces/karasu
   git worktree remove .worktrees/<機能名>
   git branch -d <branch-name>
   ```
3. main ブランチを最新化する:
   ```
   git checkout main
   git pull origin main
   ```
4. Issue のラベルを更新する（Issue 紐付けがある場合）:
   - PR で `Closes #N` した Issue は GitHub が自動で close するため、ラベル操作は不要
   - 依存していた Issue（`status: blocked` のもの）があれば `status: ready` に更新する:
     ```
     gh issue edit <blocked-issue> --remove-label "status: blocked" --add-label "status: ready"
     ```
   - 依存関係の判断: Issue 本文や会話の文脈から判断する（例: #204 は #203 に依存）

リモートブランチは GitHub 上で PR マージ時に自動削除される設定を推奨。
