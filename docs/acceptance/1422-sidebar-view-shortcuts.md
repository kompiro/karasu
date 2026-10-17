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

- [x] テキスト入力／エディタにフォーカスがあるときビュー切替ショートカットは無視される（TPL-1419）

  > ✅ Automated — `EditArea.test.tsx` › `ignores the view shortcuts while a text input is focused`

- [x] Outline ビューが存在しないとき `mod+shift+o` は no-op

  > ✅ Automated — `EditArea.test.tsx` › `does not register the Outline shortcut when outlineContent is absent`

## 手動確認チェックリスト

`examples/ja/getting-started/index.krs` を Preview UI（Project モード）で開いて確認する。

- [x] エディタ・サイドバー以外（プレビュー等）にフォーカスがある状態で `Ctrl+Shift+E`（macOS は `Cmd+Shift+E`）を押すとサイドバーが Files ビューになる

  > ✅ Automated — `packages/e2e/tests/at-1422-sidebar-view-shortcuts.spec.ts` › `Ctrl/Cmd+Shift+O and Ctrl/Cmd+Shift+E switch between Outline and Files`

- [x] `Ctrl/Cmd+Shift+O` を押すとサイドバーが Outline ビューになる

  > ✅ Automated — `packages/e2e/tests/at-1422-sidebar-view-shortcuts.spec.ts` › `Ctrl/Cmd+Shift+O and Ctrl/Cmd+Shift+E switch between Outline and Files`

- [x] サイドバーを閉じた状態で `Ctrl/Cmd+Shift+O` を押すとサイドバーが開き Outline ビューが表示される

  > ✅ Automated — `packages/e2e/tests/at-1422-sidebar-view-shortcuts.spec.ts` › `Ctrl/Cmd+Shift+O reopens a collapsed sidebar on the Outline view`

- [x] Monaco エディタにフォーカスを置いた状態で `Ctrl/Cmd+Shift+O` を押してもサイドバーは切替わらない（エディタの入力を妨げない）

  > ✅ Automated — `packages/e2e/tests/at-1422-sidebar-view-shortcuts.spec.ts` › `Ctrl/Cmd+Shift+O is ignored while the editor has focus`（Chromium の Monaco は EditContext の div にフォーカスする。[#3207](https://github.com/kompiro/karasu/issues/3207) までこの経路ではショートカットが発火していた）

- [ ] Monaco エディタにフォーカスを置いた状態で `Ctrl/Cmd+Shift+O` を押しても、Monaco の Go to Symbol が開かない

  > Monaco 側の挙動なので手動で確認する。
