---
type: product
---

# AT-1178: Style value-level diagnostics — surface integration

- **日付**: 2026-05-11
- **関連 Issue**: [#1178](https://github.com/kompiro/karasu/issues/1178)
- **対象ファイル**:
  - core: `packages/core/src/style/value-validator.ts`（PR-B でメイン実装、本 PR で `loc` enrichment を追加）
  - LSP: `packages/lsp/src/server.ts`
  - CLI: `packages/cli/src/lint-style.ts`、`packages/cli/src/lint-style.test.ts`、`packages/cli/src/index.ts`
- **関連 Design Doc**: [`docs/design/style-value-diagnostics.md`](../design/style-value-diagnostics.md)（Phase 3 計画 — 本 PR は step 3 of 3）
- **依存**: [#1244](https://github.com/kompiro/karasu/pull/1244)（PR-A: ValueNode AST）、[#1254](https://github.com/kompiro/karasu/pull/1254)（PR-B: validator + schema）

## 受け入れ条件

- [x] AT-A: CLI `karasu lint-style <file>` が enum-value typo を `error` として報告し、exit code 1 で終了する
  > ✅ Automated — `packages/cli/src/lint-style.test.ts` › `lintStyle() with explicit files › reports an enum-value error and exits 1`

- [x] AT-B: 無効な hex color が `style-invalid-hex-color` error として報告される
  > ✅ Automated — `packages/cli/src/lint-style.test.ts` › `... reports an invalid-hex-color error and exits 1`

- [x] AT-C: 未知の property は `warning` を出すが exit code 1 では終了しない
  > ✅ Automated — `packages/cli/src/lint-style.test.ts` › `... reports an unknown-property warning but does NOT exit 1`

- [x] AT-D: 整合性のとれたファイルは何も出力せず exit 0
  > ✅ Automated — `packages/cli/src/lint-style.test.ts` › `... emits nothing for a clean file`

- [x] AT-E: 複数ファイル指定で各ファイルの診断を `<file>:<line>:<col> <severity>: <message>` 形式で出力
  > ✅ Automated — `packages/cli/src/lint-style.test.ts` › `... emits errors from multiple files in ... form`

- [x] AT-F: `--stdin` モードで標準入力を読み、`stdin:<line>:<col> ...` 形式で報告する
  > ✅ Automated — `packages/cli/src/lint-style.test.ts` › `lintStyle() --stdin mode › reads stdin and reports diagnostics with 'stdin:' prefix`

- [x] AT-G: 引数なしでターゲット 0 件のとき `No .krs.style files found.` を出して exit 0
  > ✅ Automated — `packages/cli/src/lint-style.test.ts` › `lintStyle() with no targets › reports 'No .krs.style files found.' and exits 0`

- [x] AT-H: validator は各 diagnostic に `loc` を埋めて返す（LSP / CLI が即時に positional に表示できる）
  > ✅ Automated — `packages/core/src/style/value-validator.test.ts` (PR-B 由来) + 本 PR で loc enrichment を追加。LSP の `validateDocument` がそのまま `toLspPosition` に流す

- [ ] AT-I（manual）: VS Code 拡張で `.krs.style` を開き、`color: #zzzz` や `direction: dwon` を入力すると Monaco の squiggly が該当箇所に出る
  > 🧑 Manual — LSP の `publishDiagnostics` 経路で表示

- [ ] AT-J（manual）: VS Code で `.krs.style` の `color2: red` のような unknown property に warning（黄色波線）が表示される
  > 🧑 Manual — `style-unknown-property` warning が LSP 経由で表示

- [ ] AT-K（manual）: `karasu lint-style --stdin < broken.krs.style` を実行し、`stdin:N:M error: ...` が出力されて exit 1 になる
  > 🧑 Manual — CLI の対話確認

## TPL からの観点（PR-B Design Doc に記載）

| TPL | 適用 |
|---|---|
| [TPL-20260510-02](../test-perspectives/TPL-20260510-02-round-trip-guarantee.md) | validator は parser 出力（ValueNode）を **読むだけ**。再 parse しないので round-trip に影響なし |
| [TPL-20260510-03](../test-perspectives/TPL-20260510-03-enum-member-addition.md) | `ValueSpec` 判別子を 1 つ追加すると validator の switch が型エラーになる（`_exhaustive: never`）— PR-B のテストで担保 |
| [TPL-20260510-10](../test-repspectives/TPL-20260510-10-cross-reference-validation.md) | parser は loose に受理し、validator が schema 整合性を見る分業を採用 |
| [TPL-20260510-12](../test-perspectives/TPL-20260510-12-ast-parser-renderer-agreement.md) | ValueNode 追加 (PR-A) / validator 追加 (PR-B) / surface 統合 (本 PR) の 3 点同意 |
| [TPL-20260510-17](../test-perspectives/TPL-20260510-17-trust-boundary-input-validation.md) | `.krs.style` は外部 input、validator が境界で validate する役割 |
| [TPL-20260510-18](../test-perspectives/TPL-20260510-18-text-as-single-source-of-truth.md) | `valueNodes` は派生で永続化しない。LSP / CLI も text を一次情報源として再 parse する |

## 補足

- 本 PR は Phase 3 の **step 3 of 3** に対応。step 1 (ValueNode AST) と
  step 2 (validator + schema) の上に LSP / CLI の薄い接続を載せる
- LSP は `validateDocument` で `krs-style` のときに `validateStyleValues`
  を追加で呼んで diagnostics に merge。validator が返す loc を
  `toLspPosition` に流すだけで Monaco のシキュリーに直結する
- VS Code パレット用の `Karasu: Lint Style` コマンドは将来検討。今は
  format-on-save と同様の経路（`publishDiagnostics`）でリアルタイムに
  見える
