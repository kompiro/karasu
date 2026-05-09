---
type: product
---

# AT-1177: Tidy Style command — surface integration

- **日付**: 2026-05-09
- **関連 Issue**: [#1177](https://github.com/kompiro/karasu/issues/1177)
- **対象ファイル**:
  - CLI: `packages/cli/src/tidy-style.ts`、`packages/cli/src/tidy-style.test.ts`、`packages/cli/src/index.ts`
  - App: `packages/app/src/components/EditPaneToolbar.tsx`、`packages/app/src/components/EditPane.tsx`、`packages/app/src/components/EditArea.tsx`、`packages/app/src/components/AppShell.tsx`、`packages/app/src/components/EditPaneToolbar.test.tsx`、`packages/app/src/styles/app.css`
  - VS Code: `packages/vscode/src/style-formatter.ts`、`packages/vscode/src/extension.ts`、`packages/vscode/package.json`
- **関連 Design Doc**: [`docs/design/tidy-style-and-trivia.md`](../design/tidy-style-and-trivia.md)（Phase 2 計画 — 本 PR は step 3 of 3）
- **依存**: [#1183](https://github.com/kompiro/karasu/pull/1183)（PR-A: AST trivia）、[#1188](https://github.com/kompiro/karasu/pull/1188)（PR-B: tidy core）

## 受け入れ条件

- [x] AT-A: `karasu tidy-style <file>` が非 tidy な `.krs.style` を上書きし、`<file>: tidied` を stdout に出す
  > ✅ Automated — `packages/cli/src/tidy-style.test.ts` › `tidyStyle() with explicit files › rewrites a non-tidy file in place`

- [x] AT-B: 既に tidy なファイルは触らず、stdout も無音
  > ✅ Automated — `packages/cli/src/tidy-style.test.ts` › `... leaves an already-tidy file untouched and prints nothing`

- [x] AT-C: 重複ルールはデフォルトでマージされる
  > ✅ Automated — `packages/cli/src/tidy-style.test.ts` › `... merges duplicate rules by default`

- [x] AT-D: `--no-merge` で重複ルールが残る
  > ✅ Automated — `packages/cli/src/tidy-style.test.ts` › `... preserves duplicate rules when --no-merge is passed`

- [x] AT-E: `--check` モードは差分があれば exit 1 + stderr に `would be tidied` を出し、ファイルは触らない
  > ✅ Automated — `packages/cli/src/tidy-style.test.ts` › `tidyStyle() --check mode › exits 1 when a file would change ...`

- [x] AT-F: `--stdin` は標準入力 → 標準出力で動く
  > ✅ Automated — `packages/cli/src/tidy-style.test.ts` › `tidyStyle() --stdin mode › reads stdin and writes tidied output to stdout`

- [x] AT-G: 引数なしでターゲット 0 件のとき `No .krs.style files found.` を出して exit 0
  > ✅ Automated — `packages/cli/src/tidy-style.test.ts` › `... reports 'No .krs.style files found.' and exits 0`

- [x] AT-H: App の edit-pane toolbar は、`.krs.style` を開いている時のみ ✨ Tidy ボタンを表示する
  > ✅ Automated — `packages/app/src/components/EditPaneToolbar.test.tsx` › `... renders Tidy button on editor tab when onTidyStyle is provided` / `... does not render Tidy button when onTidyStyle is not provided`

- [x] AT-I: Tidy ボタンを click すると `onTidyStyle` が呼ばれる
  > ✅ Automated — `packages/app/src/components/EditPaneToolbar.test.tsx` › `... clicking Tidy button calls onTidyStyle`

- [ ] AT-J（manual）: App の `pnpm --filter @karasu-tools/app dev` Preview で `.krs.style` を開き、`✨ Tidy` を押す。**サイドバーや preview のリロードを挟まずに** バッファが整形される（軸グループ順で再配置、コメント保持）
  > 🧑 Manual — ObservableFileSystemProvider 経由のリロードまで含めて目視確認

- [ ] AT-K（manual）: `.krs` を開いている時、`✨ Tidy` ボタンは現れない（誤誘導しない）
  > 🧑 Manual — `currentFilePath` が `.krs.style` で終わる時のみ AppShell が `onTidyStyle` を渡す挙動の目視確認

- [ ] AT-L（manual）: VS Code 拡張で `.krs.style` を開き、`Karasu: Tidy Style` パレットコマンドを実行すると tidy され、保存されていないバッファに反映される
  > 🧑 Manual — `vscode.languages.registerDocumentFormattingEditProvider` 経由

- [ ] AT-M（manual）: VS Code で `editor.formatOnSave` を有効化したワークスペース設定で `.krs.style` を保存すると、保存と同時に tidy される
  > 🧑 Manual — formatter プロバイダの format-on-save パスが効いていることを確認

- [ ] AT-N（manual）: VS Code で `.krs` ファイルを開いた状態で `editor.action.formatDocument` を実行しても、Tidy Style は走らない（`krs-style` のみに registered）
  > 🧑 Manual — formatter スコープが正しく `krs-style` に限定されていることを確認

## 補足

- 本 PR は Phase 2 の **step 3 of 3** に対応。step 1 (AST trivia) と
  step 2 (tidy core) を combine することで、この PR ではコアロジックを
  書かず surface 接続のみに集中している
- VS Code 側は `Karasu: Tidy Style` パレットコマンドが内部的に
  `editor.action.formatDocument` を呼ぶ薄いラッパ。format-on-save と
  パレットコマンドはコード経路を共有する
