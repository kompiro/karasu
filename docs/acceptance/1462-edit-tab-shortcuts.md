# AT: エディットペインのタブ切替キーボードショートカット

- **日付**: 2026-05-20
- **関連 Issue**: [#1462](https://github.com/kompiro/karasu/issues/1462)
- **対象ファイル**: `packages/app/src/components/EditTabShortcuts.tsx`
- **関連**: キーボードショートカット基盤 [ADR-20260519-02](../adr/20260519-02-app-keyboard-shortcuts.md) / TPL-20260519-01

## 受け入れ条件

`packages/app/src/components/EditTabShortcuts.test.tsx` および
`packages/app/src/keyboard/chord.test.ts` でカバーされる。

- [x] `Ctrl/Cmd+Shift+1` でエディットペインのタブが Editor に切替わる

  > ✅ Automated — `packages/app/src/components/EditTabShortcuts.test.tsx` › `mod+shift+1 selects the "editor" tab`

- [x] `Ctrl/Cmd+Shift+2` でエディットペインのタブが Chat に切替わる

  > ✅ Automated — `packages/app/src/components/EditTabShortcuts.test.tsx` › `mod+shift+2 selects the "chat" tab`

- [x] テキスト入力／エディタにフォーカスがあるときもショートカットが発火する（`whenTextInputFocused: "allow"` / TPL-20260519-01）

  > ✅ Automated — `packages/app/src/components/EditTabShortcuts.test.tsx` › `fires the shortcuts even while a text input is focused (TPL-20260519-01)`

- [x] コンポーネントのアンマウントでコマンドが登録解除される（TPL-20260519-01）

  > ✅ Automated — `packages/app/src/components/EditTabShortcuts.test.tsx` › `stops resolving the shortcuts after the component unmounts (TPL-20260519-01)`

- [x] `Ctrl/Cmd+Shift+<数字>` の chord が `event.code` から正規化され、`shift` で記号化されない（TPL-20260519-01）

  > ✅ Automated — `packages/app/src/keyboard/chord.test.ts` › `normalizes a digit-row key via `code`, so shift does not yield a symbol`

## 手動確認チェックリスト

`examples/getting-started/index.krs` を Preview UI（Project モード）で開いて確認する。

- [ ] Monaco エディタにフォーカスを置いた状態で `Ctrl/Cmd+Shift+2` を押すと、エディットペインが Chat タブに切替わる（エディタの入力は妨げられない）
- [ ] Chat タブの入力欄にフォーカスを置いた状態で `Ctrl/Cmd+Shift+1` を押すと、Editor タブに戻る
- [ ] すでにアクティブなタブのショートカットを押しても何も起きない（無害な no-op）
- [ ] コマンドパレット（`Ctrl/Cmd+Shift+P`）に `Show Editor` / `Show Chat` が表示され、選択するとそれぞれのタブに切替わる
- [ ] `EditTabBar` のタブを直接クリックする従来の操作も引き続き動作する
