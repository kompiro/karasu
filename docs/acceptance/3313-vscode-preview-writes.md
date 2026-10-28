# AT: VS Code のプレビューからの書き込みをエディタのバッファに適用する（スライス C）

- **日付**: 2026-10-23
- **関連 Issue**: [#3313](https://github.com/kompiro/karasu/issues/3313)（スライス C）／親 [#2996](https://github.com/kompiro/karasu/issues/2996)
- **設計**: 親 Issue [#2996](https://github.com/kompiro/karasu/issues/2996) の決めること 4 と 8（ADR 昇格後はその ADR を参照する）
- **関連 TPL**: [TPL-1207](../test-perspectives/TPL-1207-text-as-single-source-of-truth.md)（書き込みは `.krs` テキストに収束させる）、[TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)（webview からの要求は信頼境界の入力）
- **対象ファイル**:
  - `packages/vscode/src/preview-panel.ts`（`WorkspaceEdit` での適用）、`packages/vscode/src/host-files.ts`（書き込みの判定）、`packages/vscode/src/text-edit.ts`（置き換える範囲）、`packages/vscode/src/message-validation.ts`
  - `packages/app/src/viewer/vscode/host-fs.ts`、`packages/app/src/viewer/vscode/main.tsx`、`packages/app/src/viewer/vscode/protocol.ts`

プレビューの書き込みは、edge の右クリックで選ぶ向き（`edge#… { direction: … }`）だけである。CRUD 行列は表示だけで書き込みを持たない。

## 受け入れ条件

- [x] AT-A: preview で edge の向きを選ぶと、エディタのバッファに書かれ、保存されない。スタイルファイルが無ければ `.krs` に `@import` が入り、新しいスタイルファイルが作られる。ディスク上の `.krs` は変わらない

  > ✅ Automated — `packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts` › `#3313: an edge direction picked in the preview lands in the buffer, unsaved`

- [x] AT-B: 書き込みは変わった範囲だけを置き換える（追記と先頭への `@import` は挿入になる）

  > ✅ Automated — `packages/vscode/src/text-edit.test.ts` › `replaces only an appended rule` ／ `replaces only an @import inserted at the top` ／ `never cuts a surrogate pair in half`

- [x] AT-C: viewer が読んだ後に利用者がそのファイルを編集していたら、ホストは書き込まずに断る。断られた書き込みは viewer のキャッシュを変えない

  > ✅ Automated — `packages/app/src/viewer/vscode/host-fs.test.ts` › `writes with the last-read text as base, then serves the written text` ／ `keeps the cache as it was when the host refuses the write`

- [x] AT-D: 書き込めるのはワークスペース（entry が外にあればその directory）の中の `.krs` / `.krs.style` だけで、実パスで判定する。外を指す symlink、名前だけ `.krs` の別ファイル、他の拡張子、ワークスペースの外のモデルファイルへの書き込みは断る。まだ無いファイルは親ディレクトリの実パスで判定する

  > ✅ Automated — `packages/vscode/src/host-files.test.ts` › `refuses a symlink inside the workspace that points out of it` ／ `refuses a .krs name whose real file is something else` ／ `refuses another extension: %s` ／ `refuses a model file outside the workspace, though the preview may read it` ／ `creates a new style sheet in a directory inside the workspace` ／ `refuses a new file under a directory link that points out of the workspace`

- [x] AT-E: 書き込みの要求は形を検査し、本文の長さに上限を置く

  > ✅ Automated — `packages/vscode/src/message-validation.test.ts` › `refuses %s` ／ `accepts %o`

## 手動確認

拡張を手元の checkout から起動して（F5、または `pnpm --filter karasu-vscode run package` で作った `.vsix`）確かめる。

- [ ] edge の向きを選んだ後、`.krs` とスタイルファイルのエディタで undo すると書き込みが取り消される
- [ ] `@import` 済みのスタイルファイルがあるモデルで向きを選ぶと、そのファイルの末尾に規則が足され、図の edge の向きが変わる
