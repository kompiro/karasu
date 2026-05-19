# AT: Files/Outline サイドバービュー切替ショートカット

- **日付**: 2026-05-19
- **関連 Issue**: [#1422](https://github.com/kompiro/karasu/issues/1422)
- **対象ファイル**: `packages/app/src/components/EditArea.tsx`

## 受け入れ条件

`packages/app/src/components/EditArea.test.tsx` でカバーされる。

- [x] `mod+shift+o` でサイドバーが Outline ビューに切替わる

  > ✅ Automated — `EditArea.test.tsx` › `switches the sidebar to the Outline view with the mod+shift+O shortcut`

- [x] `mod+shift+e` でサイドバーが Files ビューに切替わる

  > ✅ Automated — `EditArea.test.tsx` › `switches the sidebar back to the Files view with the mod+shift+E shortcut`

- [x] サイドバー折りたたみ時にビュー切替ショートカットを押すと展開しつつ切替わる

  > ✅ Automated — `EditArea.test.tsx` › `expands a collapsed sidebar when a view shortcut fires`

- [x] テキスト入力／エディタにフォーカスがあるときビュー切替ショートカットは無視される（TPL-20260519-01）

  > ✅ Automated — `EditArea.test.tsx` › `ignores the view shortcuts while a text input is focused`

- [x] Outline ビューが存在しないとき `mod+shift+o` は no-op

  > ✅ Automated — `EditArea.test.tsx` › `does not register the Outline shortcut when outlineContent is absent`

## 手動確認チェックリスト

`examples/getting-started/index.krs` を Preview UI（Project モード）で開いて確認する。

- [ ] エディタ・サイドバー以外（プレビュー等）にフォーカスがある状態で `Ctrl+Shift+E`（macOS は `Cmd+Shift+E`）を押すとサイドバーが Files ビューになる
- [ ] `Ctrl/Cmd+Shift+O` を押すとサイドバーが Outline ビューになる
- [ ] サイドバーを閉じた状態で `Ctrl/Cmd+Shift+O` を押すとサイドバーが開き Outline ビューが表示される
- [ ] Monaco エディタにフォーカスを置いた状態で `Ctrl/Cmd+Shift+O` を押してもサイドバーは切替わらず、Monaco の Go to Symbol も発火しない（エディタの入力を妨げない）
