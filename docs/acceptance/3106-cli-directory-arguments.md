---
type: product
---

# AT: パスを取る CLI コマンドに、ディレクトリを渡したときの扱い（#3106）

- **日付**: 2026-10-17
- **関連 Issue**: [#3106](https://github.com/kompiro/karasu/issues/3106)
- **Related TPLs**: [TPL-2942](../test-perspectives/TPL-2942-path-argument-exists-is-not-readable-file.md)
- **対象ファイル**: `packages/cli/src/path-arg.ts`（`pathKindOrExit` / `fileArgumentOrExit`）、`packages/cli/src/find-files.ts`（`resolveTargets`）、`packages/cli/src/diff.ts`、`packages/cli/src/compile-system-view.ts`（`resolveKrsFileOrExit`）

> #2942 で直した 6 コマンド以外は、ディレクトリを渡すと生の `EISDIR`、Node のスタックトレース、または存在するのに "File not found" を出していた。ファイルを歩くコマンドはディレクトリの配下を歩き、`diff` は `render` と同じく `index.krs` を読み、1 ファイルを書き換える・読むコマンドは「ディレクトリである」と言って止める。

## 受け入れ条件

### AC-1: ファイルを歩くコマンドは、ディレクトリの配下を歩く

- [x] AT-A: `karasu fmt <dir>` が配下（入れ子を含む）の `.krs` をすべて整形する。`.krs.style` と `DEFAULT_SKIP_DIRS` の中は対象にしない。`tidy-style` / `lint-style` も同じ規則で `.krs.style` を歩く

  > ✅ Automated — `packages/cli/src/directory-argument.test.ts` › `a directory argument` › `fmt formats every .krs file under the directory`
  >
  > ✅ Automated — `packages/cli/src/find-files.test.ts` › `resolveTargets` › `expands a directory argument to the matching files under it`

- [x] AT-B: 対象が 1 つも無いディレクトリでは、スタックトレースではなく `No .krs files found.` を出して終わる

  > ✅ Automated — `packages/cli/src/directory-argument.test.ts` › `a directory argument` › `fmt on an empty directory reports no files instead of a stack trace`

- [x] AT-C: 存在しないパスを渡すと、スタックトレースではなく `Error: File not found: <path>` で止まる

  > ✅ Automated — `packages/cli/src/find-files.test.ts` › `resolveTargets` › `reports an argument that is not there as not found`

### AC-2: `diff` はディレクトリの `index.krs` を読む

- [x] AT-D: `karasu diff <dir> <dir>` が各ディレクトリの `index.krs` を比べて SVG を出す

  > ✅ Automated — `packages/cli/src/directory-argument.test.ts` › `a directory argument` › `diff reads each directory's index.krs`

- [x] AT-E: `index.krs` の無いディレクトリは「見つからない」ではなく `Error: <dir> has no index.krs; pass the entry .krs file` で止まり、stdin 側の一時ファイルを残さない

  > ✅ Automated — `packages/cli/src/directory-argument.test.ts` › `a directory argument` › `diff says a directory without index.krs has none, not that it is missing`
  >
  > ✅ Automated — `packages/cli/src/directory-argument.test.ts` › `a directory argument` › `diff resolves the file side before reading stdin, so an early exit leaves no tempfile`

- [x] AT-H: after 側がディレクトリのとき、after の警告はディレクトリではなく `<dir>/index.krs` を名指しする

  > ✅ Automated — `packages/cli/src/directory-argument.test.ts` › `a directory argument` › `diff names a directory's index.krs, not the directory, in the after side's warnings`

### AC-3: 1 ファイルを書き換える・読むコマンドは、ディレクトリだと言って止める

- [x] AT-F: `remove` / `insert` / `apply` / `append` は `Error: <dir> is a directory; pass a .krs file` で止まり、何も書かない。`insert` / `apply` / `append` は stdin より先にパスを確かめるので、stdin が空でも同じ文言になる

  > ✅ Automated — `packages/cli/src/directory-argument.test.ts` › `a directory argument` › `remove says the path is a directory`
  >
  > ✅ Automated — `packages/cli/src/directory-argument.test.ts` › `a directory argument` › `insert says the path is a directory`
  >
  > ✅ Automated — `packages/cli/src/directory-argument.test.ts` › `a directory argument` › `apply says the path is a directory, and writes nothing`
  >
  > ✅ Automated — `packages/cli/src/directory-argument.test.ts` › `a directory argument` › `append says the path is a directory, and writes nothing`
  >
  > ✅ Automated — `packages/cli/src/directory-argument.test.ts` › `a directory argument` › `%s checks the path before stdin, so empty stdin still reports the directory`

- [x] AT-G: `translate` は `Error: <dir> is a directory; pass a file` で止まる（"File not found" ではない）

  > ✅ Automated — `packages/cli/src/directory-argument.test.ts` › `a directory argument` › `translate says the source is a directory, not that it is missing`

## 手動確認

N/A — 自動テストですべて覆っている
