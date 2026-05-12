---
name: update-examples
description: >
  Edit any examples/ file. For ec-platform and feature-samples files, also sync examples.ts in the same commit.
  Trigger when the user says: "examples を更新", "update examples", "edit example",
  "サンプルを更新", "サンプルを編集", or similar phrases requesting to edit example files.
---

# Update Examples Skill

`examples/` 配下のファイルを編集する。`ec-platform/` と `feature-samples/` のファイルは `packages/core/src/builtins/examples.ts` への同期も行い、同一コミットにまとめる。

## 前提

- このスキルは worktree 内（`feat/` ブランチ）で実行することを想定する
- 直接 `main` ブランチで実行しない。worktree がなければ `/start-dev` スキルで作成してから着手する
- `examples.ts` への同期が必要かどうかは `.claude/rules/examples-sync.md` のマッピング表で判断する

## 手順

### 1. 変更対象の確認

ユーザーの指示から以下を特定する：

- **対象ファイル**: どの `examples/` ファイルを変更するか（例: `ec-platform/01-system.krs`、`hr-tool/index.krs`）
- **変更内容**: どのような編集を行うか

不明な点があればユーザーに確認する。

### 2. `.claude/rules/examples-sync.md` を読む

マッピング表を確認して、対象ファイルが `examples.ts` に登録されているかどうかを判断する。

- **登録済み**（現在は `ec-platform/` と `feature-samples/`）→ ステップ3〜5へ進む
- **未登録**（`hr-tool/` など）→ ステップ3のみ実行し、ステップ4・5はスキップしてステップ6へ進む

### 3. `examples/` ファイルを編集する

対象の `.krs` ファイルに変更を加える。

### 4. `packages/core/src/builtins/examples.ts` を更新する（登録済みファイルのみ）

ステップ2で特定したエントリの `content` フィールドを、ステップ3で編集した `.krs` ファイルの内容と完全に一致するように更新する。

> **注意**: `content` フィールドの文字列はテンプレートリテラル（バッククォート）で記述されている。
> インデント・改行・末尾の空白も含めて `.krs` ファイルと完全一致させること。

### 5. 差分を確認する（登録済みファイルのみ）

`git diff` で両ファイルの変更内容を確認し、`.krs` ファイルと `examples.ts` の `content` が一致していることを検証する。

### 6. `/commit` スキルでコミットする

変更したファイルをすべて**同一コミット**に含める。コミットメッセージの例：

```
# ec-platform / feature-samples の場合（examples.ts も同期）
chore(examples): update ec-platform/<target-file>.krs and sync examples.ts

# 未登録ディレクトリの場合（examples.ts の更新なし）
chore(examples): update <directory>/<target-file>.krs
```

## エラーケース

| 状況 | 対処 |
|---|---|
| `examples.ts` に登録すべきかどうか不明 | ユーザーに確認する。登録が必要な場合は `examples-sync.md` の「新しい examples ディレクトリを追加する場合」の手順を案内する |
| `examples.ts` の対応エントリが見つからない | ファイルを読んで手動で対応箇所を特定し、ユーザーに確認する |
| 複数ファイルを一度に変更する場合 | 各ファイルについてステップ3〜4を繰り返し、すべての変更を1コミットにまとめる |
