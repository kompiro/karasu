# AT: `karasu diff` CLI command

- **日付**: 2026-04-29
- **関連 Issue**: [#1020](https://github.com/kompiro/karasu/issues/1020)
- **対象ファイル**:
  - `packages/cli/src/diff.ts`（新規）
  - `packages/cli/src/index.ts`
- **関連 ADR**: ADR-20260420-02（graphical diff viewer）, ADR-20260422-06（paste diff input）, ADR-20260422-07（OPFS snapshot diff）

## 受け入れ条件

- [x] `karasu diff <before> <after>` が 2 つの `.krs` ファイルを比較して `data-diff-state` 属性付きの SVG を stdout に出力する
  > ✅ Automated — `packages/cli/src/diff.test.ts` › `same content yields no-change SVG` / `added node surfaces in SVG`

- [x] before / after どちらの引数も `-` で stdin から読み取れる（git external-diff からのパイプ用）
  > ✅ Automated — `packages/cli/src/diff.e2e.test.ts` › `reads the before side from stdin when first arg is -` / `reads the after side from stdin when second arg is -`

- [x] 両方の引数が `-` の場合はエラーで exit 1
  > ✅ Automated — `packages/cli/src/diff.test.ts` › `rejects when both sides are stdin`

- [x] 存在しないファイルが指定された場合はどちらの側でも明示的なエラーで exit 1
  > ✅ Automated — `packages/cli/src/diff.test.ts` › `exits 1 when before file does not exist` / `exits 1 when after file does not exist`

- [x] `-o, --output <path>` で SVG をファイルに書き出せる（stdout には何も出さない）
  > ✅ Automated — `packages/cli/src/diff.test.ts` › `writes to file when --output is supplied`

- [x] `--view system | deploy | org` で view を切り替えられる（既定: `system`）
  > ✅ Automated — `packages/cli/src/diff.test.ts` › `compiles a deploy-view diff`

- [x] 既存の `compileSystemDiff` / `compileDeployDiff` / `compileOrgDiff` を利用しており、独自の diff レンダリングを持たない
  > ✅ Automated — `packages/cli/src/diff.ts` の実装が `@karasu-tools/core` の compile 関数を直接呼び出していること（コードレビューで確認、テストでは生成 SVG が `data-diff-state` を含むことで間接的に保証）

- [ ] `karasu diff --help` の Examples セクションに git diff driver / external-diff 設定例が記載されている
  > 🧑 Manual — `karasu diff --help` を実行し、`.gitconfig` 用の snippet が表示されることを目視確認する。

- [ ] git の external diff として実際に動作する（`GIT_EXTERNAL_DIFF=karasu-diff-wrapper git diff` で SVG を吐く wrapper script を書き、想定通りに動作する）
  > 🧑 Manual — wrapper script を書いて手動検証。

## 補足

- Stdin → tempfile shim: `-` が指定された側は stdin を読み込んで対側のディレクトリ（無ければ OS 標準 tempdir）に `before.krs` / `after.krs` の名前で一時保存する。これにより stdin 側の relative `@import` も対側のプロジェクトルートから解決される。tempfile は finally で削除する。
- All-views 統合 SVG（`buildAllViewsSvgProject` の diff 版）は未実装。3 種類の view を 1 ファイルに束ねる需要が出たら follow-up。
