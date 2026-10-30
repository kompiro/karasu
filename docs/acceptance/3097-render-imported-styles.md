# AT: 既定の `karasu render` が `@import` した `.krs.style` を適用・検証する

- **日付**: 2026-10-12
- **関連 Issue**: [#3097](https://github.com/kompiro/karasu/issues/3097)
- **対象ファイル**:
  - `packages/core/src/compile/compile.ts`（`buildAllViewsSvgProject`）
  - `packages/core/src/renderer/drill-down-svg.ts`（`buildAllViewsSvg`）
  - `packages/core/src/renderer/all-layers-svg.ts`（`buildStyles`）
  - `packages/core/src/resolver/model-warnings.ts`（`collectModelWarnings` / `resolvedStyleWarningToWarning`）
  - `packages/core/src/exporter/drawio/build-drawio-project.ts`（`buildDrawioProject`）
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

- [x] 不正な値の warning（`column: middle` の `style-invalid-enum-value` など）は、bundle が複数の view で同じノードを解決しても重複して出ない。
  > ✅ Automated — `packages/core/src/compile/all-views-project-styles.test.ts` › `reports an invalid declaration once, although every view resolves the node`

- [x] deploy / org view が無視する `column` の warning は、それぞれの view の compile と同じものが出る。
  > ✅ Automated — `packages/core/src/compile/all-views-project-styles.test.ts` › `reports what the deploy and org views ignore, as their own compiles do`

- [x] 2 つのノードが同じ id を持つとき、共有された宣言の不正な値の finding は、per-view の compile と同じく 1 件だけ出る（#3141 でノードごとの警告を廃止）。
  > ✅ Automated — `packages/core/src/compile/all-views-project-styles.test.ts` › `reports a declaration once when two nodes share an id, as the per-view compile does`

- [x] deploy block が複数あるとき、bundle が描く block（per-view の deploy view と同じ先頭の block）のノードについてだけ報告する。
  > ✅ Automated — `packages/core/src/compile/all-views-project-styles.test.ts` › `reports only the deploy block the bundle draws`

- [x] `--format drawio` も、import した sheet の値の warning をその sheet のファイルを位置に持って出す。
  > ✅ Automated — `packages/core/src/compile/all-views-project-styles.test.ts` › `reports the sheet's value warnings, as the SVG render does`

- [x] icon theme は検査の対象に入らず、icon モードでも shape モードと同じ warning になる（偽の `style-conflict` を出さない）。
  > ✅ Automated — `packages/core/src/compile/all-views-project-styles.test.ts` › `leaves the icon theme out of the checks, so icon mode warns as shape mode does`

- [x] 既定の `karasu render`（`--view` なし）が出力する SVG に、import した sheet の色が入る。
  > ✅ Automated — `packages/cli/src/render.e2e.test.ts` › `draws the bundle with the imported sheet`

- [x] 既定の `karasu render` が出す warning は、`karasu render --view system` が出すものと同じ。
  > ✅ Automated — `packages/cli/src/render.e2e.test.ts` › `prints the sheet's warnings, the same ones \`--view system\` prints`

## 手動確認

N/A — 自動テストですべて覆っている（`karasu check` は既定の `render` と同じ `buildAllViewsSvgProject` を呼ぶ）

## 補足

- `--format drawio` は style を描画に使わない。対象にしたのは warning だけ。
