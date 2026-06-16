# AT: References パネルをコマンドパレットから開閉する

- **日付**: 2026-05-20
- **関連 Issue**: [#1461](https://github.com/kompiro/karasu/issues/1461)
- **対象ファイル**: `packages/app/src/components/PreviewColumn.tsx`
- **関連**: コマンドパレット [ADR-20260520-01](../adr/20260520-01-app-command-palette.md) / キーボードショートカット基盤 [ADR-20260519-02](../adr/20260519-02-app-keyboard-shortcuts.md)

> **更新（#1548）**: References はモーダルパネルから**別ウィンドウのポップアウト**に変更された（参照しながらエディタ操作するため）。コマンドはパネルの開閉ではなく reference ウィンドウを開く。

## 受け入れ条件

`packages/app/src/components/PreviewColumn.test.tsx` でカバーされる。

- [x] `Open Reference` コマンドがコマンドパレット用に登録される（専用キーバインドなし）

  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `registers a palette-only 'Open Reference' command (no keybinding)`

- [x] コマンドを実行すると、アクティブビューを引き継いだ reference ウィンドウが開く

  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `opens the reference in a new window seeded with the active view`

- [x] `PreviewColumn` のアンマウントでコマンドが登録解除される

  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `unregisters the command when PreviewColumn unmounts`

- [x] `↗ Reference` ツールバーボタンは引き続き表示される

  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `shows Reference button for all active views`

## 手動確認チェックリスト

`examples/ja/getting-started/index.krs` を Preview UI（Project モード）で開いて確認する。

- [ ] `Ctrl/Cmd+Shift+P` でコマンドパレットを開くと、一覧に `Open Reference` が表示される
- [ ] `Open Reference` を選択すると reference が別ウィンドウで開く
- [ ] `↗ Reference` ツールバーボタンを押しても別ウィンドウで開く
- [ ] reference ウィンドウを開いたまま、メインウィンドウのエディタにタイプできる（フォーカスが奪われない）
- [ ] reference ウィンドウの View セレクタで system / deploy / org を切り替えると内容が変わる
