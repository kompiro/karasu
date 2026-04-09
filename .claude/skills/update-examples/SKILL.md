---
name: update-examples
description: >
  Edit examples/ec-platform/ files and sync examples.ts in one commit.
  Trigger when the user says: "examples を更新", "update examples", "edit example",
  "サンプルを更新", "サンプルを編集", or similar phrases requesting to edit ec-platform examples.
---

# Update Examples Skill

`examples/ec-platform/` のファイルを編集し、`packages/core/src/builtins/examples.ts` を同期して1コミットにまとめる。

## 前提

- このスキルは worktree 内（`feat/` ブランチ）で実行することを想定する
- 直接 `main` ブランチで実行しない。worktree がなければ `/start-dev` スキルで作成してから着手する
- ファイルマッピングは `.claude/rules/examples-sync.md` を参照する

## 手順

### 1. 変更対象の確認

ユーザーの指示から以下を特定する：

- **対象ファイル**: どの `examples/ec-platform/` ファイルを変更するか（例: `01-system.krs`）
- **変更内容**: どのような編集を行うか

不明な点があればユーザーに確認する。

### 2. `.claude/rules/examples-sync.md` を読む

マッピング表を確認して、対象 `.krs` ファイルに対応する `examples.ts` 内のエントリ（配列インデックスとフィールド）を特定する。

### 3. `examples/ec-platform/` ファイルを編集する

対象の `.krs` ファイルに変更を加える。

### 4. `packages/core/src/builtins/examples.ts` を更新する

ステップ2で特定したエントリの `content` フィールドを、ステップ3で編集した `.krs` ファイルの内容と完全に一致するように更新する。

> **注意**: `content` フィールドの文字列はテンプレートリテラル（バッククォート）で記述されている。
> インデント・改行・末尾の空白も含めて `.krs` ファイルと完全一致させること。

### 5. 差分を確認する

`git diff` で両ファイルの変更内容を確認し、`.krs` ファイルと `examples.ts` の `content` が一致していることを検証する。

### 6. `/commit` スキルでコミットする

両ファイルを**同一コミット**に含める。コミットメッセージの例：

```
chore(examples): update ec-platform/01-system.krs and sync examples.ts
```

## エラーケース

| 状況 | 対処 |
|---|---|
| 対象ファイルが `examples-sync.md` のマッピングに存在しない | ユーザーに確認し、登録が必要な場合は `examples-sync.md` の「新しい examples ディレクトリを追加する場合」の手順を案内する |
| `examples.ts` の対応エントリが見つからない | ファイルを読んで手動で対応箇所を特定し、ユーザーに確認する |
| 複数ファイルを一度に変更する場合 | 各ファイルについてステップ3〜4を繰り返し、すべての変更を1コミットにまとめる |
