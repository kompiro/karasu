---
name: commit
description: >
  Generate a Conventional Commits message from staged git changes and commit.
  Trigger when the user says: "commit", "コミット", "変更をコミット",
  "コミットメッセージを作って", "commit changes", or similar phrases
  requesting to create a git commit.
---

# Conventional Commit Skill

変更を関心事ごとに分離し、それぞれ Conventional Commits 形式でコミットする。

## 手順

1. `git status` と `git diff`（ステージ済み＋未ステージ）を確認する
2. 変更がない場合はその旨を伝えて終了する
3. 変更内容を分析し、**関心事（concern）ごとにグループ分け**する
4. グループ分けの結果をユーザーに提示した後、**確認を待たずにそのままコミットを実行する**
5. グループごとに以下を繰り返す：
   a. 該当ファイルのみを `git add` でステージする
   b. Conventional Commits 形式のメッセージを生成する
   c. コミットを実行する
6. 全コミット完了後、結果一覧をユーザーに通知する

## 関心事の分離ルール

- **機能単位**: 同じ機能に関わるファイル群を1コミットにまとめる
- **レイヤー分離**: プロダクションコードとテストコードが同じ機能なら同一コミットでよい
- **設定変更**: ビルド設定・依存追加など基盤的な変更は独立コミットにする
- **ドキュメント**: ドキュメントのみの変更は独立コミットにする
- **リファクタ**: 機能変更を伴わないリファクタは独立コミットにする

### 判断に迷う場合

- 1ファイルの変更が複数の関心事にまたがる場合 → 最も主要な関心事に含める（hunk 分割はしない）
- 関心事が1つしかない場合 → 確認ステップをスキップしてそのままコミットする

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
- 複数の独立した変更が混在する場合は、関心事ごとにコミットを分離する

## コミット実行

グループごとに以下の形式でコミットする：

```bash
# 1. 該当ファイルのみステージ
git add <file1> <file2> ...

# 2. コミット
git commit -m "$(cat <<'EOF'
<type>(<scope>): <subject>

<body（必要な場合）>
EOF
)"
```

## 提示フォーマット

グループ分け結果をユーザーに提示する際の形式：

```
### コミット計画

1. `feat(parser): add token position tracking`
   - packages/core/src/lexer.ts
   - packages/core/src/parser.ts
   - packages/core/tests/lexer.test.ts

2. `chore(app): update vite config`
   - packages/app/vite.config.ts

```

計画を提示した後、ユーザーの返答を待たず即座にコミットを実行する。
