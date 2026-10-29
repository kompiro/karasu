---
type: product
---

# AT: karasu serve のプレビューが import を解決する（#3258）

- **日付**: 2026-10-22
- **関連 Issue**: [#3258](https://github.com/kompiro/karasu/issues/3258)
- **Related TPLs**: [TPL-3258](../test-perspectives/TPL-3258-host-supplies-whole-import-graph.md), [TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md), [TPL-239](../test-perspectives/TPL-239-convenience-vs-principled-api.md), [TPL-1024](../test-perspectives/TPL-1024-dev-vs-packaged-mode-parity.md)
- **対象ファイル**: `packages/cli/src/serve.ts`、`packages/cli/src/watcher.ts`、`packages/app/src/ServeModeApp.tsx`、`packages/app/src/components/AppShell.tsx`

> `karasu serve` は開いたファイル 1 つだけをブラウザのメモリに `/serve/index.krs` として書いていたので、
> import 先がすべて `File not found` になり、import 先を保存しても描き直さなかった。配信ディレクトリの
> `.krs` と `.krs.style` をまるごと実際のパスでメモリに写し、どのファイルの変更でも取り直す。

## 受け入れ条件

### AC-1: server が配信ディレクトリをまるごと渡す

- [x] AT-A: `GET /api/project` が `.krs` と `.krs.style` を、入れ子のディレクトリを含む相対パス（`/` 区切り）と本文の組で返し、他の拡張子は返さない

  > ✅ Automated — `packages/cli/src/serve.test.ts` › `HTTP server` › `GET /api/project (#3258)` › `returns the .krs and .krs.style files with their paths and content`
  >
  > ✅ Automated — `packages/cli/src/serve.test.ts` › `collectProjectFiles` › `returns every .krs and .krs.style with its nested path and content`
  >
  > ✅ Automated — `packages/cli/src/serve.test.ts` › `collectProjectFiles` › `leaves out every other extension`

- [x] AT-B: 配信ディレクトリの中に、外を指す symlink（file と directory の両方）があっても、その中身を返さない。walk で一覧した後、読む前の確認より先に file や directory が symlink に差し替えられた場合も、その先を読まない（親ディレクトリを確認してから file を開くまでの間の差し替えは、Node に `openat` が無いため塞いでいない）

  > ✅ Automated — `packages/cli/src/serve.test.ts` › `collectProjectFiles` › `does not follow a symlinked file or directory out of the served directory`
  >
  > ✅ Automated — `packages/cli/src/serve.test.ts` › `collectProjectFiles` › `an entry swapped for a symlink after it was listed` › `does not read through either link`

### AC-2: 開いたファイルの import が `karasu render` と同じく解決される

- [x] AT-C: whole-file・named・directory（`import "dir/"`）・style（`@import "x.krs.style"`）の import がすべて解決され、`File not found` が出ない

  > ✅ Automated — `packages/app/src/ServeModeApp.test.tsx` › `ServeModeApp` › `import resolution (#3258)` › `mirrors the directory so whole-file, named, directory and style imports resolve`
  >
  > ✅ Automated — `packages/e2e/tests/at-3258-serve-import-resolution.spec.ts` › `AT-3258: karasu serve resolves imports` › `TC-01: whole-file, named, directory and style imports all resolve`

- [x] AT-D: サブディレクトリのファイルを `/<dir>/<name>` で開くと、その実際のパスから相対 import が解決される

  > ✅ Automated — `packages/app/src/ServeModeApp.test.tsx` › `ServeModeApp` › `import resolution (#3258)` › `opens a file in a subdirectory at its real path, so relative imports resolve`
  >
  > ✅ Automated — `packages/e2e/tests/at-3258-serve-import-resolution.spec.ts` › `AT-3258: karasu serve resolves imports` › `TC-02: a file in a subdirectory resolves its relative imports from its own folder`

- [x] AT-E: 配信ディレクトリに無いファイルを開くと、今までどおり `File not found: <name>.krs` を出す。文言は表示中の locale に従う

  > ✅ Automated — `packages/app/src/ServeModeApp.test.tsx` › `ServeModeApp` › `import resolution (#3258)` › `shows File not found when the opened file is not in the directory`
  >
  > ✅ Automated — `packages/app/src/ServeModeApp.test.tsx` › `ServeModeApp` › `import resolution (#3258)` › `says File not found in the active locale`
  >
  > ✅ Automated — `packages/e2e/tests/at-0032-cli-serve-mode.spec.ts` › `AT-0032: CLI serve mode` › `TC-06: a missing file shows File not found`

### AC-3: import グラフ内のどのファイルを保存しても描き直す

- [x] AT-F: watcher が `.krs.style` の変更も、拡張子付きの `path` を添えて通知する。`.krs` の通知は今までどおり拡張子なしの `file` も持つ

  > ✅ Automated — `packages/cli/src/watcher.test.ts` › `FileWatcher` › `.krs.style events` › `broadcasts change for a .krs.style with its path`
  >
  > ✅ Automated — `packages/cli/src/watcher.test.ts` › `FileWatcher` › `path field` › `carries the .krs path with its extension next to the extensionless file`
  >
  > ✅ Automated — `packages/cli/src/serve.e2e.test.ts` › `AT-0032 karasu serve — integration (real watcher)` › `emits an SSE event for a .krs.style and /api/project returns its new text`

- [x] AT-G: import 先の `.krs` を保存すると、開いている図が再読み込みなしで描き直される。開いたファイル自体の本文が変わらなければ、見ている階層はそのまま

  > ✅ Automated — `packages/app/src/ServeModeApp.test.tsx` › `ServeModeApp` › `import resolution (#3258)` › `refetches when an imported file changes, and recompiles without touching the entry`
  >
  > ✅ Automated — `packages/cli/src/serve.e2e.test.ts` › `AT-0032 karasu serve — integration (real watcher)` › `emits an SSE event for an imported .krs and /api/project returns its new text`
  >
  > ✅ Automated — `packages/e2e/tests/at-3258-serve-import-resolution.spec.ts` › `AT-3258: karasu serve resolves imports` › `TC-03: saving an imported .krs redraws the open diagram without a reload`

- [x] AT-H: import した `.krs.style` を保存すると描き直される

  > ✅ Automated — `packages/e2e/tests/at-3258-serve-import-resolution.spec.ts` › `AT-3258: karasu serve resolves imports` › `TC-04: saving the imported .krs.style redraws the open diagram`

- [x] AT-I: 開いたファイル自体を保存すると、本文を置き換えて描き直す（見ている階層は保つ）

  > ✅ Automated — `packages/app/src/ServeModeApp.test.tsx` › `ServeModeApp` › `import resolution (#3258)` › `updates the entry's text in place when the entry itself changes`

- [x] AT-J: import 先のファイルを消すと、メモリからも消え、その import に `File not found` が出る

  > ✅ Automated — `packages/app/src/ServeModeApp.test.tsx` › `ServeModeApp` › `import resolution (#3258)` › `removes a file from the mirror when it is deleted, so its import reports File not found`
  >
  > ✅ Automated — `packages/e2e/tests/at-3258-serve-import-resolution.spec.ts` › `AT-3258: karasu serve resolves imports` › `TC-05: deleting an imported file reports File not found for its import`

- [x] AT-K: SSE が切れて再接続したときに取り直す（最初の接続では取り直さない）

  > ✅ Automated — `packages/app/src/ServeModeApp.test.tsx` › `ServeModeApp` › `import resolution (#3258)` › `refetches on a reconnect, but not on the first open`

## 手動確認

N/A — 自動テストですべて覆っている
