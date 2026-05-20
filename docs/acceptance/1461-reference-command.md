# AT: References パネルをコマンドパレットから開く

- **日付**: 2026-05-20
- **関連 Issue**: [#1461](https://github.com/kompiro/karasu/issues/1461)
- **対象ファイル**: `packages/app/src/components/PreviewColumn.tsx`
- **関連**: コマンドパレット [ADR-20260520-01](../adr/20260520-01-app-command-palette.md) / キーボードショートカット基盤 [ADR-20260519-02](../adr/20260519-02-app-keyboard-shortcuts.md)

## 受け入れ条件

`packages/app/src/components/PreviewColumn.test.tsx` でカバーされる。

- [x] `Show Reference` コマンドがコマンドパレット用に登録される（専用キーバインドなし）

  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `registers a palette-only 'Show Reference' command (no keybinding)`

- [x] コマンドを実行すると References パネルが開く

  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `opens the References panel when the command runs`

- [x] `PreviewColumn` のアンマウントでコマンドが登録解除される

  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `unregisters the command when PreviewColumn unmounts`

- [x] `? Reference` ツールバーボタンは引き続き表示される

  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `shows Reference button for all active views`

## 手動確認チェックリスト

`examples/getting-started/index.krs` を Preview UI（Project モード）で開いて確認する。

- [ ] `Ctrl/Cmd+Shift+P` でコマンドパレットを開くと、一覧に `Show Reference` が表示される
- [ ] `Show Reference` を選択すると References パネルが開く
- [ ] `? Reference` ツールバーボタンを押しても従来どおりパネルが開く
- [ ] 開いた References パネルが Esc キー・`×` ボタン・パネル外側クリックのいずれでも閉じる
