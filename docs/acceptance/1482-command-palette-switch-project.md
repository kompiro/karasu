# AT: コマンドパレットからのプロジェクト切り替え

- **日付**: 2026-05-21
- **関連 Issue**: [#1482](https://github.com/kompiro/karasu/issues/1482)
- **対象ファイル**: `packages/app/src/components/SwitchProjectCommand.tsx` / `packages/app/src/components/ProjectPicker.tsx`
- **関連**: コマンドパレット [AT #1421](1421-command-palette.md) / キーボードショートカット基盤 [ADR-1411](../adr/1411-app-keyboard-shortcuts.md) / TPL-1419 / TPL-1468

## 受け入れ条件

`packages/app/src/components/SwitchProjectCommand.test.tsx` および
`packages/app/src/components/ProjectPicker.test.tsx` でカバーされる。

- [x] コマンドパレットに `Switch Project…` コマンドが表示される

  > ✅ Automated — `packages/app/src/components/SwitchProjectCommand.test.tsx` › `registers a `Switch Project…` entry in the command palette`

- [x] `Switch Project…` を実行するとプロジェクト選択ピッカーが開く

  > ✅ Automated — `packages/app/src/components/SwitchProjectCommand.test.tsx` › `opens the project picker when the command runs`

- [x] ピッカーでプロジェクトを選ぶと当該プロジェクトに切り替わる

  > ✅ Automated — `packages/app/src/components/SwitchProjectCommand.test.tsx` › `switches to the picked project`

- [x] ピッカーは全プロジェクトを一覧表示し、入力に応じて絞り込まれる

  > ✅ Automated — `packages/app/src/components/ProjectPicker.test.tsx` › `lists every project and filters them as the user types`

- [x] Enter で選択中のプロジェクトに切り替わり、ピッカーが閉じる

  > ✅ Automated — `packages/app/src/components/ProjectPicker.test.tsx` › `selects the highlighted project on Enter and closes`

- [x] クリックでプロジェクトに切り替わり、ピッカーが閉じる

  > ✅ Automated — `packages/app/src/components/ProjectPicker.test.tsx` › `selects a project on click and closes`

- [x] 上下キーで選択が移動する

  > ✅ Automated — `packages/app/src/components/ProjectPicker.test.tsx` › `moves the selection with the arrow keys`

- [x] フィルタに一致しないとき空状態を表示する

  > ✅ Automated — `packages/app/src/components/ProjectPicker.test.tsx` › `shows an empty state when the filter matches nothing`

- [x] 現在のプロジェクトに `current` マークが付く

  > ✅ Automated — `packages/app/src/components/ProjectPicker.test.tsx` › `marks the current project and only that one`

- [x] プロジェクトが 1 件でもピッカーは開く

  > ✅ Automated — `packages/app/src/components/ProjectPicker.test.tsx` › `still opens with a single project`

## 手動確認チェックリスト

`examples/ja/getting-started/index.krs` を Preview UI（Project モード）で開いて確認する。
jsdom では描画の見た目・遷移を検証できないため、実ブラウザで確認する。

- [x] `Ctrl/Cmd+Shift+P` でコマンドパレットを開き、`Switch Project…` を選ぶとプロジェクトピッカーが開く（パレットは閉じる）

  > ✅ Automated — `packages/e2e/tests/at-1482-command-palette-switch-project.spec.ts` › `Switch Project… opens the picker; filter and Enter switch the project`

- [x] ピッカーの検索欄にフォーカスが当たり、文字を入力すると一覧が絞り込まれる

  > ✅ Automated — `packages/e2e/tests/at-1482-command-palette-switch-project.spec.ts` › `Switch Project… opens the picker; filter and Enter switch the project`

- [x] 上下キーでハイライトが視覚的に移動し、Enter またはクリックで対象プロジェクトに切り替わる

  > ✅ Automated — `packages/e2e/tests/at-1482-command-palette-switch-project.spec.ts` › `arrow keys and a click pick a project in the picker`。選択は `aria-selected` で検証し、Enter は `Switch Project… opens the picker; filter and Enter switch the project` が検証する

- [x] プロジェクト切り替え後、URL が `/projects/<id>` に更新され、エディタが当該プロジェクトの `index.krs` を開く

  > ✅ Automated — `packages/e2e/tests/at-1482-command-palette-switch-project.spec.ts` › `Switch Project… opens the picker; filter and Enter switch the project`

- [x] 現在のプロジェクトに `current` マークが表示される

  > ✅ Automated — `packages/e2e/tests/at-1482-command-palette-switch-project.spec.ts` › `Switch Project… opens the picker; filter and Enter switch the project`

- [ ] References パネルなど他の overlay を開いた状態でもピッカーが最前面に表示される（TPL-1468）
- [x] Esc キー、またはピッカー外側のクリックでピッカーが閉じる

  > 🟡 Partially automated — `packages/e2e/tests/at-1482-command-palette-switch-project.spec.ts` › `Esc closes the picker without switching`（外側クリックは手動）
