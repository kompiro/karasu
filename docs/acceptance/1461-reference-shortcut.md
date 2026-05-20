# AT: References パネルを開くキーボードショートカット

- **日付**: 2026-05-20
- **関連 Issue**: [#1461](https://github.com/kompiro/karasu/issues/1461)
- **対象ファイル**: `packages/app/src/components/PreviewColumn.tsx`
- **関連**: キーボードショートカット基盤 [ADR-20260519-02](../adr/20260519-02-app-keyboard-shortcuts.md) / TPL-20260519-01

## 受け入れ条件

`packages/app/src/components/PreviewColumn.test.tsx` でカバーされる。

- [x] `Ctrl/Cmd+Shift+/` で References パネルが開く

  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `opens the References panel on mod+shift+? (Ctrl/Cmd+Shift+/)`

- [x] テキスト入力／エディタにフォーカスがあるときショートカットは無視される（TPL-20260519-01）

  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `is ignored while a text input is focused (TPL-20260519-01)`

- [x] `PreviewColumn` のアンマウントでコマンドが登録解除される（TPL-20260519-01）

  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `unregisters the command when PreviewColumn unmounts (TPL-20260519-01)`

- [x] `? Reference` ツールバーボタンは引き続き表示される

  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `shows Reference button for all active views`

## 手動確認チェックリスト

`examples/getting-started/index.krs` を Preview UI（Project モード）で開いて確認する。

- [ ] エディタ・サイドバー以外（プレビュー等）にフォーカスがある状態で `Ctrl/Cmd+Shift+/` を押すと References パネルが開く
- [ ] Monaco エディタにフォーカスを置いた状態で `Ctrl/Cmd+Shift+/` を押してもパネルは開かず、エディタの入力（`/` の打鍵）を妨げない
- [ ] `? Reference` ツールバーボタンを押しても従来どおりパネルが開く
- [ ] 開いた References パネルが Esc キー・`×` ボタン・パネル外側クリックのいずれでも閉じる
