---
id: ADR-20260520-03
title: コマンドパレットのコマンド名は当面 i18n せず、解説追加時にまとめて対応する
status: accepted
date: 2026-05-20
topic: app-ui
related_to: [ADR-20260520-01, ADR-20260519-02]
scope:
  packages: [app]
  concerns: [i18n]
assumptions:
  - "symbol: packages/app/src/keyboard/command-types.ts :: Command"
  - "file: packages/app/src/components/CommandPalette.tsx"
---

# ADR-20260520-03: コマンドパレットのコマンド名は当面 i18n せず、解説追加時にまとめて対応する

- **日付**: 2026-05-20
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1463](https://github.com/kompiro/karasu/issues/1463)
  - PR [#1467](https://github.com/kompiro/karasu/pull/1467)（TranslateDialog の i18n 対応の中で本決定に至った）
  - 関連 ADR: [ADR-20260520-01](20260520-01-app-command-palette.md)（コマンドパレット）, [ADR-20260519-02](20260519-02-app-keyboard-shortcuts.md)（キーボードショートカット基盤）
  - i18n ポリシー: `docs/spec/i18n.md`

## 背景

PR #1467 で `TranslateDialog` の全文字列（タイトル・ラベル・aria 属性・ボタン）を `@karasu-tools/i18n` の翻訳テーブルに移した。その際、コマンドパレットに登録されるコマンドの `title`（`"Translate Infra Config to .krs…"` など）も i18n すべきか検討した。

現状、`useCommand` に渡すコマンド `title` はすべて英語リテラルで、i18n を通っていない（`"Toggle Sidebar"`, `"Show System View"`, `"Show All Commands"` など）。`Command` 型（`packages/app/src/keyboard/command-types.ts`）は `title` を持つが `description` は持たない。

将来、コマンドパレットの各コマンドに **解説（`description`）** を表示する計画がある。

## 決定

コマンドパレットのコマンド `title` は当面 i18n せず英語リテラルのままとする。コマンドに `description` を追加する作業を行うタイミングで、`title` と `description` をまとめて i18n 化する。

## 理由

- コマンド名は短い動詞句で、CLI サブコマンド名や開発者向け語彙に近い。コマンドパレット自体が `Ctrl/Cmd+Shift+P` で開くパワーユーザー向けの導線であり、英語で一貫させても実害が小さい。
- コマンドの `description`（ユーザー向けの説明文）を追加する計画があり、解説文は i18n が必須になる。`description` を入れる作業では `Command` 型の拡張・コマンドレジストリ／パレット側の i18n 配線が必要で、そのタイミングで `title` も同時に i18n 化すれば API 変更を 1 回で済ませられる。
- いま `title` だけ先行して i18n すると、`description` 追加時に同じ配線を再度いじる二度手間になり、移行が 2 段階に分かれる。
- 本 ADR が据え置くのはコマンド `title` という限定領域のみ。ダイアログ・パネルの本文（`TranslateDialog` 等）は従来どおり i18n 必須で、`docs/spec/i18n.md` のポリシーは変わらない。

## 却下した案

- **いま全コマンドの `title` を i18n する**: `description` 追加時に `Command` 型と i18n 配線を再度変更することになり、移行が 2 回に分かれる。翻訳テーブルにも将来まとめ直すキーが増える。`description` とセットで一度に対応するほうが総コストが小さい。
