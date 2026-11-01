---
name: update-examples
description: >
  Edit any examples/ file, regenerate the bundled examples module with `pnpm gen:examples`, and commit both together.
  Trigger when the user says: "examples を更新", "update examples", "edit example",
  "サンプルを更新", "サンプルを編集", or similar phrases requesting to edit example files.
---

# Update Examples Skill

`examples/` 配下のファイルを編集し、同梱用の生成物 `packages/core/src/builtins/examples.generated.ts` を
`pnpm gen:examples` で作り直して、同一コミットにまとめる。

## 前提

- このスキルは worktree 内で実行することを想定する
- 直接 `main` ブランチで実行しない。worktree がなければ `/start-dev` スキルで作成してから着手する

## 手順

### 1. 変更対象の確認

ユーザーの指示から、どの `examples/` ファイルをどう変えるかを特定する。不明な点があればユーザーに確認する。

### 2. `.claude/rules/examples-sync.md` を読む

生成が見てくれないこと（feature-samples のカタログ、facet-styling の対、en/ja の両方を揃えること）を確認する。

### 3. `examples/` ファイルを編集する

### 4. `pnpm gen:examples` を実行する

対象が同梱されているかどうかは判定しなくてよい。同梱されていなければ生成物は変わらない。

### 5. `/commit` スキルでコミットする

`examples/` の変更と、生成物が変わっていれば `examples.generated.ts` を**同一コミット**に含める。コミットメッセージの例：

```
chore(examples): update ec-platform/<target-file>.krs
```

## エラーケース

| 状況 | 対処 |
|---|---|
| `pnpm gen:examples` が flat のディレクトリにサブディレクトリがあると言って失敗する | ファイルを上に移すか、ユーザーに staged として登録するか確認する |
| staged の段に入口ファイルが無い・2 つあると言って失敗する | `system.krs` か `main.krs` のどちらか 1 つにする |
| 新しいディレクトリを同梱したい | `examples-sync.md` の「新しいディレクトリを同梱する」の手順を案内する |
