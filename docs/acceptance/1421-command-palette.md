# AT: コマンドパレット

- **日付**: 2026-05-20
- **関連 Issue**: [#1421](https://github.com/kompiro/karasu/issues/1421)
- **対象ファイル**: `packages/app/src/components/CommandPalette.tsx`
- **関連**: キーボードショートカット基盤 [ADR-20260519-02](../adr/20260519-02-app-keyboard-shortcuts.md) / TPL-20260519-01

## 受け入れ条件

`packages/app/src/components/CommandPalette.test.tsx` および
`packages/app/src/keyboard/command-context.test.tsx` でカバーされる。

- [x] `Ctrl/Cmd+Shift+P` でパレットが開く。テキスト入力／エディタにフォーカスがあっても開く（TPL-20260519-01）

  > ✅ Automated — `packages/app/src/components/CommandPalette.test.tsx` › `opens on Ctrl/Cmd+Shift+P even while a text input is focused (TPL-20260519-01)`

- [x] 登録済みコマンドが一覧表示され、入力に応じて絞り込まれる

  > ✅ Automated — `packages/app/src/components/CommandPalette.test.tsx` › `lists registered commands and filters them as the user types`

- [x] Enter で選択中のコマンドが実行され、パレットが閉じる

  > ✅ Automated — `packages/app/src/components/CommandPalette.test.tsx` › `runs the selected command on Enter and closes the palette`

- [x] クリックでコマンドが実行され、パレットが閉じる

  > ✅ Automated — `packages/app/src/components/CommandPalette.test.tsx` › `runs a command on click and closes the palette`

- [x] 上下キーで選択が移動する

  > ✅ Automated — `packages/app/src/components/CommandPalette.test.tsx` › `moves the selection with the arrow keys`

- [x] Esc でパレットが閉じる

  > ✅ Automated — `packages/app/src/components/CommandPalette.test.tsx` › `closes on Escape`

- [x] パレット起動コマンド自身は一覧に表示されない

  > ✅ Automated — `packages/app/src/components/CommandPalette.test.tsx` › `excludes its own open command from the list`

- [x] フィルタに一致しないとき空状態を表示する

  > ✅ Automated — `packages/app/src/components/CommandPalette.test.tsx` › `shows an empty state when the filter matches nothing`

- [x] レジストリの `getCommands()` が登録済みコマンドを返す

  > ✅ Automated — `packages/app/src/keyboard/command-context.test.tsx` › `returns every registered command`

- [x] コンポーネントのアンマウントで `getCommands()` から当該コマンドが消える（TPL-20260519-01）

  > ✅ Automated — `packages/app/src/keyboard/command-context.test.tsx` › `drops a command once its component unmounts`

## 手動確認チェックリスト

`examples/getting-started/index.krs` を Preview UI（Project モード）で開いて確認する。
jsdom では描画の見た目を検証できないため、実ブラウザで確認する。

- [ ] `Ctrl/Cmd+Shift+P` でパレットが画面中央上部に表示され、検索入力にフォーカスが当たる
- [ ] Monaco エディタで編集中（テキスト入力にフォーカスがある状態）でも `Ctrl/Cmd+Shift+P` でパレットが開く
- [ ] macOS で `Cmd+Shift+P` を押したとき、ブラウザの操作（プライベートウィンドウ等）が発火せず karasu のパレットが開く（`preventDefault` 済み）
- [ ] 検索欄に文字を入力すると一覧が絞り込まれ、上下キーでハイライトが視覚的に移動する
- [ ] Enter またはクリックで選択コマンドが実行され、パレットが閉じる（例: `Toggle Sidebar` を選ぶとサイドバーが開閉する）
- [ ] Esc キー、またはパレット外側のクリックでパレットが閉じる
