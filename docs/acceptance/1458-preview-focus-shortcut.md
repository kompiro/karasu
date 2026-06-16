# AT: プレビュー Focus モード切替キーボードショートカット

- **日付**: 2026-05-20
- **関連 Issue**: [#1458](https://github.com/kompiro/karasu/issues/1458)
- **対象ファイル**: `packages/app/src/components/PreviewFocusShortcut.tsx`
- **関連**: キーボードショートカット基盤 [ADR-20260519-02](../adr/20260519-02-app-keyboard-shortcuts.md) / TPL-20260519-01

## 受け入れ条件

`packages/app/src/components/PreviewFocusShortcut.test.tsx` でカバーされる。

- [x] `Ctrl/Cmd+Shift+F` でプレビューの Focus モードがトグルされる

  > ✅ Automated — `packages/app/src/components/PreviewFocusShortcut.test.tsx` › `mod+shift+f toggles the preview focus mode`

- [x] テキスト入力／エディタにフォーカスがあるときショートカットは無視される（TPL-20260519-01）

  > ✅ Automated — `packages/app/src/components/PreviewFocusShortcut.test.tsx` › `ignores the shortcut while a text input is focused`

- [x] コンポーネントのアンマウントでコマンドが登録解除される（TPL-20260519-01）

  > ✅ Automated — `packages/app/src/components/PreviewFocusShortcut.test.tsx` › `stops resolving the shortcut after the component unmounts`

## 手動確認チェックリスト

`examples/ja/getting-started/index.krs` を Preview UI（Project モード）で開いて確認する。

- [ ] エディタ・サイドバー以外（プレビュー等）にフォーカスがある状態で `Ctrl/Cmd+Shift+F` を押すと、エディタが畳まれてプレビューが全幅表示になる（ツールバーの `↗ Focus` ボタンを押したときと同じ挙動）
- [ ] Focus モード中にもう一度 `Ctrl/Cmd+Shift+F` を押すと、元のレイアウト（エディタ＋サイドバー）に戻る
- [ ] Monaco エディタにフォーカスを置いた状態で `Ctrl/Cmd+Shift+F` を押しても Focus モードは切り替わらず、エディタの入力／キーバインドを妨げない
- [ ] コマンドパレット（`Ctrl/Cmd+Shift+P`）に `Toggle Preview Focus` が表示され、選択すると Focus モードがトグルされる
