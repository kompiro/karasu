# AT: 既定の `karasu render` が `@import` した `.krs.style` を適用・検証する

- **日付**: 2026-10-12
- **関連 Issue**: [#3097](https://github.com/kompiro/karasu/issues/3097)
- **対象ファイル**:
  - `packages/core/src/compile/compile.ts`（`buildAllViewsSvgProject`）
  - `packages/core/src/renderer/drill-down-svg.ts`（`buildAllViewsSvg`）
  - `packages/core/src/renderer/all-layers-svg.ts`（`buildStyles`）
  - `packages/core/src/resolver/model-warnings.ts`（`collectModelWarnings` / `resolvedStyleWarningToWarning`）
- **関連 TPL**: TPL-219（並列関数ファミリの parameter parity）

## 受け入れ条件

- [x] `buildAllViewsSvgProject` は、モデルが `@import` した style sheet で描く。
  > ✅ Automated — `packages/core/src/compile/all-views-project-styles.test.ts` › `draws with the imported sheet`

- [x] 引数の `styleSource` は import した sheet の後に適用され、同じ selector では `styleSource` が勝つ。
  > ✅ Automated — `packages/core/src/compile/all-views-project-styles.test.ts` › `applies a styleSource string after the imported sheets`

- [x] import した sheet の値を検証し、warning はその sheet のファイルを位置に持つ。
  > ✅ Automated — `packages/core/src/compile/all-views-project-styles.test.ts` › `validates the imported sheet, placing each finding in the style file`

- [x] style 系 warning は、同じプロジェクトを `compileProject` で system view にコンパイルしたときと一致する。
  > ✅ Automated — `packages/core/src/compile/all-views-project-styles.test.ts` › `reports the style warnings \`compileProject\` reports for the system view`

- [x] スタイル解決の warning（`style-column-invalid-value` など）は、bundle が複数の view で同じノードを解決しても 1 回だけ出る。
  > ✅ Automated — `packages/core/src/compile/all-views-project-styles.test.ts` › `reports a style-resolution finding once, although every view resolves the node`

- [x] deploy / org view が無視する `column` の warning は、それぞれの view の compile と同じものが出る。
  > ✅ Automated — `packages/core/src/compile/all-views-project-styles.test.ts` › `reports what the deploy and org views ignore, as their own compiles do`

- [x] icon theme は検査の対象に入らず、icon モードでも shape モードと同じ warning になる（偽の `style-conflict` を出さない）。
  > ✅ Automated — `packages/core/src/compile/all-views-project-styles.test.ts` › `leaves the icon theme out of the checks, so icon mode warns as shape mode does`

- [x] 既定の `karasu render`（`--view` なし）が出力する SVG に、import した sheet の色が入る。
  > ✅ Automated — `packages/cli/src/render.e2e.test.ts` › `draws the bundle with the imported sheet`

- [x] 既定の `karasu render` が出す warning は、`karasu render --view system` が出すものと同じ。
  > ✅ Automated — `packages/cli/src/render.e2e.test.ts` › `prints the sheet's warnings, the same ones \`--view system\` prints`

## 手動確認

N/A — 自動テストですべて覆っている（`karasu check` は既定の `render` と同じ `buildAllViewsSvgProject` を呼ぶ）

## 補足

- `--format drawio` は style を描画に使わない形式で、今回の対象外。
