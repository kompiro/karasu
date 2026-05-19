# AT: Ctrl/Cmd+B サイドバートグルとキーボードショートカット基盤

- **日付**: 2026-05-19
- **関連 Issue**: [#1411](https://github.com/kompiro/karasu/issues/1411)
- **対象ファイル**: `packages/app/src/keyboard/`、`packages/app/src/components/EditArea.tsx`

## 受け入れ条件

`packages/app/src/keyboard/chord.test.ts`、
`packages/app/src/keyboard/keyboard-shortcuts.test.tsx`、
`packages/app/src/components/EditArea.test.tsx` でカバーされる。

- [x] keydown イベントを `mod+key` の chord 文字列へ正規化する（修飾子順 mod, alt, shift, key）

  > ✅ Automated — `packages/app/src/keyboard/chord.test.ts` › `eventToChord`

- [x] input / textarea にフォーカスがあると `isTextInputFocused` が true を返す

  > ✅ Automated — `packages/app/src/keyboard/chord.test.ts` › `isTextInputFocused`

- [x] 登録コマンドの chord 押下で `run` が呼ばれる

  > ✅ Automated — `packages/app/src/keyboard/keyboard-shortcuts.test.tsx` › `runs a command when its chord is pressed`

- [x] `whenTextInputFocused: "skip"` のコマンドはテキスト入力中に発火しない

  > ✅ Automated — `packages/app/src/keyboard/keyboard-shortcuts.test.tsx` › `skips a 'skip' command while a text input is focused`

- [x] `whenTextInputFocused: "allow"` のコマンドはテキスト入力中でも発火する

  > ✅ Automated — `packages/app/src/keyboard/keyboard-shortcuts.test.tsx` › `runs an 'allow' command even while a text input is focused`

- [x] コンポーネントのアンマウントでコマンドが登録解除される

  > ✅ Automated — `packages/app/src/keyboard/keyboard-shortcuts.test.tsx` › `stops resolving a command after its component unmounts`

- [x] `Ctrl/Cmd+B` でサイドバーが折りたたみ⇄展開する

  > ✅ Automated — `packages/app/src/components/EditArea.test.tsx` › `toggles the sidebar with the mod+B shortcut`

- [x] テキスト入力／エディタにフォーカスがあるとき `Ctrl/Cmd+B` は無視される

  > ✅ Automated — `packages/app/src/components/EditArea.test.tsx` › `ignores the mod+B shortcut while a text input is focused`

- [x] ショートカットでの折りたたみ→展開後、直前の sidebarView が復元される

  > ✅ Automated — `packages/app/src/components/EditArea.test.tsx` › `restores the previously active sidebar view after a shortcut collapse/expand`

## 手動確認チェックリスト

`examples/getting-started/index.krs` を Preview UI（Project モード）で開いて確認する。

- [ ] エディタ・サイドバー以外（プレビュー等）にフォーカスがある状態で `Ctrl+B`（macOS は `Cmd+B`）を押すとサイドバーが閉じる
- [ ] もう一度 `Ctrl/Cmd+B` を押すとサイドバーが開く
- [ ] Outline ビューを表示した状態で `Ctrl/Cmd+B` で閉じ→開くと Outline ビューのまま復元される
- [ ] Monaco エディタにフォーカスを置いた状態で `Ctrl/Cmd+B` を押してもサイドバーは開閉しない（エディタの入力を妨げない）
