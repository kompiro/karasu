# AT: VS Code のプレビューを共有 viewer で動かす（スライス B）

- **日付**: 2026-10-23
- **関連 Issue**: [#3312](https://github.com/kompiro/karasu/issues/3312)（スライス B）／親 [#2996](https://github.com/kompiro/karasu/issues/2996)／[#3252](https://github.com/kompiro/karasu/issues/3252)（edge の hover）
- **設計**: 親 Issue [#2996](https://github.com/kompiro/karasu/issues/2996) の決めること 1, 2, 4〜7, 9（ADR 昇格後はその ADR を参照する）
- **関連 TPL**: [TPL-2996](../test-perspectives/TPL-2996-preview-reads-editor-buffers.md)（保存前のバッファから読む）、[TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)（webview からの要求は信頼境界の入力）、[TPL-1024](../test-perspectives/TPL-1024-dev-vs-packaged-mode-parity.md)（`.vsix` でも動く）、[TPL-3137](../test-perspectives/TPL-3137-bundled-notices-cover-workspace-deps.md)（同梱物の notices）
- **対象ファイル**:
  - `packages/app/src/viewer/vscode/main.tsx`、`packages/app/src/viewer/vscode/host-fs.ts`、`packages/app/src/viewer/vscode/protocol.ts`、`packages/app/vite.vscode-webview.config.ts`
  - `packages/vscode/src/preview-panel.ts`、`packages/vscode/src/host-files.ts`、`packages/vscode/src/webview-html.ts`、`packages/vscode/src/message-validation.ts`、`packages/vscode/src/extension.ts`
  - `packages/vscode/scripts/stage-webview.ts`、`packages/vscode/scripts/assert-webview-staged.mjs`

## 受け入れ条件

- [x] AT-A: 保存前の編集が図に出る。entry だけでなく import 先のファイルも、開いていればバッファから読む

  > ✅ Automated — `packages/vscode/src/host-files.test.ts` › `reads an open file from its buffer, unsaved edits included` ／ `packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts` › `TPL-2996: an unsaved edit reaches the preview and keeps the drilled view`

- [x] AT-B: drill した状態で編集しても、drill の位置が保たれる

  > ✅ Automated — `packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts` › `TPL-2996: an unsaved edit reaches the preview and keeps the drilled view` ／ `packages/app/src/viewer/mount-viewer.test.tsx` › `re-reads a changed file and keeps the drill position`

- [x] AT-C: Cmd/Ctrl+クリックと詳細パネルの「Jump to editor」で、エディタがノードの定義の行に移る

  > ✅ Automated — `packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts` › `TC-03: Cmd/Ctrl+Click on a parent node moves the editor cursor without drilling` ／ `packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts` › `TC-03: Jump to editor button moves the .krs editor cursor and leaves the panel open` ／ `packages/app/src/viewer/mount-viewer.test.tsx` › `hands the host the node and the file that defines it`

- [x] AT-D: エディタのカーソル位置のノードが highlight される

  > ✅ Automated — `packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts` › `AT-0037-9: editor cursor on a node identifier highlights the matching SVG node`

- [x] AT-E: ページは VS Code のテーマと表示言語で描き始め、viewer は外からテーマを切り替えられる

  > ✅ Automated — `packages/vscode/src/webview-html.test.ts` › `paints in the editor's theme and language before the script runs` ／ `packages/app/src/viewer/mount-viewer.test.tsx` › `switches theme and language without losing the view`

- [x] AT-F: VS Code のツールバーに Icon Mode のトグルと Cmd/Ctrl+クリックの案内があり、共有・書き出し・全層表示・Docs は出ない

  > ✅ Automated — `packages/app/src/viewer/vscode/VscodeToolbarExtras.test.tsx` › `toggles icon cards in the webview, showing the state with aria-pressed` ／ `packages/app/src/components/PreviewColumn.test.tsx` › `omits exactly the controls a host lists in hide`

- [x] AT-G: edge の hover の規則が webview に届いている（#3252）。hover した edge が太くなり他が薄くなる挙動そのものは app の E2E が見る

  > ✅ Automated — `packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts` › `#3252: the preview carries the edge hover rules`

- [x] AT-H: エラーを入れても、同じ対象の最後の正常な図が残る

  > ✅ Automated — `packages/app/src/hooks/useSystemView.test.tsx` › `retains previous valid svg when updated source has errors`

- [x] AT-I: `.vsix` を入れた環境で preview が描かれる。build は viewer を `out/webview/` に置き、置かれていなければ失敗する

  > ✅ Automated — `packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts` › `TC-01: shows the hint text on the root view`（ExTester は build した `.vsix` を入れて動かす）／ `packages/vscode/src/marketplace-manifest.test.ts` › `builds and stages the preview bundle, and fails the build without it` ／ `packages/vscode/scripts/stage-webview.test.ts` › `copies the webview bundle into the staged directory`

- [x] AT-J: webview からの読み出しは、ワークスペース（entry が外にあればその directory）の中の `.krs` / `.krs.style` だけに答える。`..`・符号化した区切り・NUL・外を指す symlink は拒否し、許可ルートの中の絶対パスは受ける

  > ✅ Automated — `packages/vscode/src/host-files.test.ts` › `refuses %s` ／ `refuses a symlink inside the root that points outside it` ／ `adds the entry's directory when the entry lies outside every folder` ／ `packages/vscode/src/message-validation.test.ts` › `refuses %s`

- [x] AT-K: 変更の通知や entry の切替の後に届いた古い読み出しの応答はキャッシュに入らず、閉じた後の応答は何も更新しない

  > ✅ Automated — `packages/app/src/viewer/vscode/host-fs.test.ts` › `does not cache a reply that arrives after filesChanged, and reads the new text next` ／ `fails what is waiting on dispose, ignores later replies, and asks nothing more`

- [x] AT-L: ページの CSP は既定で拒否し、拡張の外には出ない。script は nonce 付きの 1 本だけ

  > ✅ Automated — `packages/vscode/src/webview-html.test.ts` › `denies by default and reaches nothing outside the extension` ／ `runs no inline script`

## 手動確認

拡張を手元の checkout から起動して（F5、または `pnpm --filter karasu-vscode run package` で作った `.vsix`）確かめる。

- [ ] アクティブな `.krs` エディタを別のファイルに切り替えると、preview がそのファイルの図に変わる
- [ ] 別ファイルに定義されたノード（`import` したもの）を Cmd/Ctrl+クリックすると、そのファイルが開いて定義の行に移り、preview はもとの図のまま
- [ ] VS Code の配色テーマを light / dark で切り替えると、図とツールバーが追従する。表示言語を日本語にして再読み込みすると、ツールバーと詳細パネルの文言が日本語になる
