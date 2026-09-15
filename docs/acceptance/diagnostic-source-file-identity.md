---
type: product
---

# AT: 診断の位置が、それを含むファイルと行を指す（#2715）

- **日付**: 2026-09-14
- **関連 Issue**: [#2715](https://github.com/kompiro/karasu/issues/2715)
- **Related TPLs**: [TPL-2715](../test-perspectives/TPL-2715-source-position-carries-its-document.md)（位置は指す文書と対でしか運べない）, [TPL-2221](../test-perspectives/TPL-2221-merge-only-facts-decided-on-merged-model.md)（マージ後にしか見えない事実はマージ後のモデルで判定する）
- **対象ファイル**:
  - `packages/core/src/types/tokens.ts`（`SourceRange.file`）
  - `packages/core/src/parser/parser.ts` / `packages/core/src/parser/style-parser.ts`（range を作る場所でファイルを載せる）
  - `packages/core/src/fs/import-resolver.ts`（各ファイルのパスをパーサーに渡す）
  - `packages/cli/src/compile-system-view.ts`（`formatDiagLoc`）/ `packages/cli/src/diff.ts`
  - `packages/app/src/utils/diagnostic-location.ts` / `packages/app/src/components/PreviewPane.tsx` / `packages/app/src/components/WarningPanel.tsx`
- **仕様**: `docs/spec/diagnostics.md` の「Source locations」節

> 診断の `loc` は行と列しか持たず、消費側はそれをエントリファイルの位置として読んでいた。import 先の構文エラーや
> マージ後のモデルで判定した診断は、エントリに存在しない行を指した。加えて CLI は 1 始まりの位置にさらに 1 を
> 足しており、単一ファイルでも行と列が 1 ずつずれていた。`.krs.style` の構文エラーは位置を持たず、
> 取り込んだ `.krs` のエラーとして出ていた。

## 受け入れ条件

### AC-1: プロジェクトを解決して得た診断は、位置が指すファイルを持つ

- [x] TC-A1: import 先ファイルの構文診断が、そのファイルを名指す

  > ✅ Automated — `packages/core/src/fs/import-resolver.test.ts` › ImportResolver > diagnostic file identity (#2715) › names the imported file on a per-file parse diagnostic (TC-A1)

- [x] TC-A2: マージ後のモデルで判定した診断（`node-id-multiple-locations` / `duplicate-facet-id`）が、宣言したファイルを名指す

  > ✅ Automated — `packages/core/src/fs/import-resolver.test.ts` › ImportResolver > diagnostic file identity (#2715) › names the declaring file on verdicts decided on the merged model (TC-A2)

- [x] TC-A3: `loc` を持つ診断は全件ファイルを持ち、そのファイルの本文で offset から求めた行・列が診断の行・列と一致する（コード単位ではなく全件で判定する）

  > ✅ Automated — `packages/core/src/fs/import-resolver.test.ts` › ImportResolver > diagnostic file identity (#2715) › gives every located diagnostic a file whose text resolves its position (TC-A3)

- [x] TC-A4: resolver の後で判定される compile 段階の診断（`duplicate-edge-id`）も、それぞれの宣言ファイルを名指す

  > ✅ Automated — `packages/core/src/fs/import-resolver.test.ts` › ImportResolver > diagnostic file identity (#2715) › names each file on a compile-stage verdict that spans files (TC-A4)

- [x] TC-A5: `.krs.style` の構文診断が位置を持ち、シートを名指す

  > ✅ Automated — `packages/core/src/fs/import-resolver.test.ts` › ImportResolver > diagnostic file identity (#2715) › names the style sheet, with a position, on its parse diagnostics (TC-A5)

- [x] TC-A6: プロジェクトの compile が返す `loc` 付きの warning も全件ファイルを持ち、そのファイルの本文で位置が解決できる

  > ✅ Automated — `packages/core/src/fs/import-resolver.test.ts` › ImportResolver > diagnostic file identity (#2715) › gives every located warning of a project compile a file whose text resolves its position (TC-A6)

- [x] TC-A7: `.krs` とスタイルシートを両方テキストで受け取る compile（`compile` / `buildAllViewsSvg`）では、シートの parse 診断が位置を持たない（モデルの行として読まれない）

  > ✅ Automated — `packages/core/src/fs/import-resolver.test.ts` › ImportResolver > diagnostic file identity (#2715) › gives a string-compiled style sheet's parse errors no position to misread (TC-A7)

### AC-2: ファイル識別は、パスを渡した parse でだけ付く

- [x] TC-B1: パスを渡した `.krs` の parse はノードと診断の range にパスを載せ、渡さなければキー自体を作らない

  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › Parser source file identity › stamps the path onto node ranges and diagnostic ranges alike / leaves the key off entirely when no path is given (TC-B1)

- [x] TC-B2: `.krs.style` の 4 つの構文診断が問題のトークンの位置を持ち、シート id をファイルと取り違えない

  > ✅ Automated — `packages/core/src/parser/style-parser.test.ts` › StyleParser source positions › locates <code> at the offending token, in the sheet's file / never takes the sheet id for a file (TC-B2)

### AC-3: `karasu render` が印字する位置は、そのファイルの実在する行を指す

- [x] TC-C1: import 先で判定された警告が、import 先ファイルのパスで印字され、その行に宣言がある

  > ✅ Automated — `packages/cli/src/render.e2e.test.ts` › karasu render: diagnostic locations name their file (#2715) › prints a merged-model verdict at the imported file's line (TC-C1)

- [x] TC-C2: import 先ファイルの構文エラーが、そのファイルの該当行で印字される

  > ✅ Automated — `packages/cli/src/render.e2e.test.ts` › karasu render: diagnostic locations name their file (#2715) › prints an imported file's parse error at that file's line (TC-C2)

- [x] TC-C3: 単一ファイルで 4 行 1 列の問題が `4:1` と印字される（以前は `5:2`）

  > ✅ Automated — `packages/cli/src/render.e2e.test.ts` › karasu render: diagnostic locations name their file (#2715) › prints a single-file position without shifting it (TC-C3)

- [x] TC-C4: スタイルシートの構文エラーが、シートのパスと行で印字される

  > ✅ Automated — `packages/cli/src/render.e2e.test.ts` › karasu render: diagnostic locations name their file (#2715) › prints a style sheet's parse error at the sheet's line (TC-C4)

- [x] TC-C5: エントリ自身の位置はユーザーが打った綴りで印字し（相対形・symlink 越しでも同一と判定する）、ほかのファイルは作業ディレクトリからの相対パスで印字する

  > ✅ Automated — `packages/cli/src/compile-system-view.test.ts` › diagLocFormatter › keeps the user's spelling when the file is the entry reached another way / folds a relative entry onto its absolute form without touching the disk / names any other file relative to the working directory / keeps the entry and other files apart across one report (TC-C5)

- [x] TC-C6: `karasu diff` が印字する位置もずれない（5 行 3 列の警告が `5:3`）

  > ✅ Automated — `packages/cli/src/diff.e2e.test.ts` › karasu diff: printed positions are not shifted (#2715) › prints a warning at the declaration's own line and column (TC-C6)

### AC-4: app のプレビューバナーが、開いている文書以外の位置にファイル名を付ける

- [x] TC-D1: 開いている文書の位置は `Line N`（日本語 UI では `N 行目`）、別ファイルの位置は `<プロジェクト相対パス>:N` と表示する

  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › PreviewPane > diagnostic banner location › shows the open document's positions as a line of it / spells the line label in the UI locale / names the file when the position is in another one (TC-D1)

- [x] TC-D2: 同じ行・同じメッセージの診断が 2 ファイルにあっても、ファイル名で区別される

  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › PreviewPane > diagnostic banner location › keeps same-line diagnostics from different files apart (TC-D2)

- [x] TC-D3: プロジェクトルートの外にあるファイルや、ルートと接頭辞だけ共有する兄弟ディレクトリは短縮しない

  > ✅ Automated — `packages/app/src/utils/diagnostic-location.test.ts` › diagnosticLocationLabel (#2715) › shows the full path when the file is not under the display root / does not shorten a sibling directory that merely shares the root's prefix (TC-D3)

- [x] TC-D4: warning パネルも同じ規則で表示する（開いている文書は `Line N`、別ファイルはパス付き、2 ファイルの同じ offset の warning を別項目にする）

  > ✅ Automated — `packages/app/src/components/WarningPanel.test.tsx` › WarningPanel location › keeps `Line N` for a warning in the open document / spells the line label in the UI locale / names the file for a warning in another one / lists same-offset warnings from two files as two items (TC-D4)

- [x] TC-D5: 比較中のスナップショットは撮影元のプロジェクト上のパスで、プロジェクトの無いモード（memory / serve）はエントリのディレクトリからの相対パスで示す

  > ✅ Automated — `packages/app/src/utils/diagnostic-location.test.ts` › diagnosticLocationLabel (#2715) › names a compared snapshot's file by its project-relative path / displayRootFor (#2715) › falls back to the entry's directory without a project (TC-D5)

### AC-5: LSP の単一文書診断

- [x] TC-E1: スタイル文書の構文エラーが、文書の先頭ではなく問題のトークンの行に置かれる

  > ✅ Automated — `packages/lsp/src/diagnostics.test.ts` › computeDiagnostics — style documents (.krs.style) › places a style parse error on the offending token's line (TC-E1)

## 手動確認

N/A — 自動テストですべて覆っている
