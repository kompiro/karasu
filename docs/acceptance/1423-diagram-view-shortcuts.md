# AT: ダイアグラムビュー切替キーボードショートカット

- **日付**: 2026-05-19
- **関連 Issue**: [#1423](https://github.com/kompiro/karasu/issues/1423)
- **対象ファイル**: `packages/app/src/components/DiagramViewShortcuts.tsx`
- **関連**: キーボードショートカット基盤 [ADR-20260519-02](../adr/20260519-02-app-keyboard-shortcuts.md) / TPL-20260519-01

## 受け入れ条件

`packages/app/src/components/DiagramViewShortcuts.test.tsx` でカバーされる。

- [x] `Ctrl/Cmd+1` で System ビューに切り替わる

  > ✅ Automated — `packages/app/src/components/DiagramViewShortcuts.test.tsx` › `mod+1 switches the active view to "system"`

- [x] `Ctrl/Cmd+2` で Deploy ビューに切り替わる

  > ✅ Automated — `packages/app/src/components/DiagramViewShortcuts.test.tsx` › `mod+2 switches the active view to "deploy"`

- [x] `Ctrl/Cmd+3` で Org ビューに切り替わる

  > ✅ Automated — `packages/app/src/components/DiagramViewShortcuts.test.tsx` › `mod+3 switches the active view to "org"`

- [x] `Ctrl/Cmd+4` で Matrix（CRUD）ビューに切り替わる

  > ✅ Automated — `packages/app/src/components/DiagramViewShortcuts.test.tsx` › `mod+4 switches the active view to "matrix"`

- [x] テキスト入力／エディタにフォーカスがあるときショートカットは無視される（TPL-20260519-01）

  > ✅ Automated — `packages/app/src/components/DiagramViewShortcuts.test.tsx` › `ignores the shortcuts while a text input is focused`

- [x] コンポーネントのアンマウントでコマンドが登録解除される（TPL-20260519-01）

  > ✅ Automated — `packages/app/src/components/DiagramViewShortcuts.test.tsx` › `stops resolving the shortcuts after the component unmounts`

## 手動確認チェックリスト

`examples/ja/getting-started/index.krs` を Preview UI（Project モード）で開いて確認する。

- [ ] エディタ・サイドバー以外（プレビュー等）にフォーカスがある状態で `Ctrl/Cmd+1〜4` を押すと、それぞれ System / Deploy / Org / CRUD タブに切り替わる
- [ ] Monaco エディタにフォーカスを置いた状態で `Ctrl/Cmd+1〜4` を押してもビューは切り替わらず、エディタの入力／キーバインドを妨げない
- [ ] macOS で `Cmd+1〜4`（ブラウザのタブ切替）を押したとき、ブラウザのタブが切り替わらず karasu のビュー切替に使われる（`preventDefault` 済み）
- [ ] deploy ブロックを持たない `.krs` を開いた状態で `Ctrl/Cmd+2` を押すと、空の Deploy ビューが表示されるだけでエラーにならない
