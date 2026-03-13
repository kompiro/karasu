---
name: commit
description: >
  Generate a Conventional Commits message from staged git changes and commit.
  Trigger when the user says: "commit", "コミット", "変更をコミット",
  "コミットメッセージを作って", "commit changes", or similar phrases
  requesting to create a git commit.
---

# Conventional Commit Skill

staged された変更を分析し、Conventional Commits 形式のコミットメッセージを生成してコミットする。

## 手順

1. `git status` と `git diff --cached` を実行してステージ済み変更を確認する
2. ステージ済みの変更がない場合は `git add -A` で全変更をステージする
3. それでも変更がない場合はその旨を伝えて終了する
4. 変更内容を分析して Conventional Commits 形式のメッセージを生成する
5. 確認を求めずにそのままコミットする
6. コミットした内容をユーザーに通知する

## Conventional Commits 形式

```
<type>(<scope>): <subject>

[body]

[footer]
```

### type の選択基準

| type       | 使う場面                                       |
| ---------- | ---------------------------------------------- |
| `feat`     | 新機能の追加                                   |
| `fix`      | バグ修正                                       |
| `docs`     | ドキュメントのみの変更                         |
| `style`    | コードの意味に影響しない変更（フォーマット等） |
| `refactor` | バグ修正でも機能追加でもないコード変更         |
| `test`     | テストの追加・修正                             |
| `chore`    | ビルドプロセス・補助ツール・設定の変更         |
| `perf`     | パフォーマンス改善                             |
| `ci`       | CI 設定の変更                                  |
| `build`    | ビルドシステムや外部依存の変更                 |
| `revert`   | 過去のコミットの取り消し                       |

### ルール

- `subject` は命令形・現在形で、先頭を小文字に、末尾にピリオドを付けない
- `scope` はオプション。変更対象のモジュール・パッケージ名（例: `core`, `app`, `parser`）
- 破壊的変更は `!` を type の後に付ける（例: `feat!:`）か、footer に `BREAKING CHANGE:` を記載
- subject は英語で記述する（body/footer は日本語可）
- 複数の独立した変更が混在する場合は、最も主要な変更を type に選び、body で補足する

## コミット実行

以下の形式でコミット後、コミットした内容をユーザーに通知する：

```bash
git commit -m "$(cat <<'EOF'
<type>(<scope>): <subject>

<body（必要な場合）>
EOF
)"
```
