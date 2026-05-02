---
type: product
---

# AT-1062: CRUD matrix view (usecase × resource)

- **日付**: 2026-05-02
- **関連 Issue**: [#1062](https://github.com/kompiro/karasu/issues/1062)
- **対象ファイル**:
  - `packages/core/src/view/crud-matrix-extract.ts`
  - `packages/core/src/view/crud-matrix-extract.test.ts`
  - `packages/core/src/view/crud-matrix-format.ts`
  - `packages/core/src/view/crud-matrix-format.test.ts`
  - `packages/core/src/render/matrix-svg.ts`
  - `packages/core/src/render/matrix-svg.test.ts`
  - `packages/cli/src/matrix.ts`
  - `packages/cli/src/matrix.test.ts`
  - `packages/cli/src/render.ts` (`--include-matrix`)
  - `packages/app/src/components/CrudMatrixPanel.tsx`
  - `packages/app/src/components/CrudMatrixPanel.test.tsx`
  - `packages/app/src/components/DiagramTabBar.tsx` (Matrix tab)
  - `packages/app/src/components/PreviewColumn.tsx` (matrix view branch)
  - `packages/app/src/state/app-reducer.ts` (`ActiveView` += `"matrix"`)
  - `packages/app/src/state/preview-context.tsx` (`SystemViewData.systems`)
  - `packages/app/src/components/AppShell.tsx` (passes `resolvedSystems`)
  - `examples/feature-samples/crud-matrix.krs`
  - `examples/getting-started/index.krs`, `examples/getting-started-en/index.krs`
  - `packages/core/src/builtins/examples.ts`
- **関連 Design Doc**: [crud-matrix-view.md](../design/crud-matrix-view.md)
- **関連 ADR**: [ADR-20260430-03](../adr/20260430-03-resource-crud-operations.md)（`operations` 構文）, [ADR-20260430-04](../adr/20260430-04-resource-edge-read-write-differentiation.md)（read/write edge 差別化）

## 受け入れ条件

- [x] AT-A: `extractCrudMatrix` が usecase × resource の関係から rows / columns / cells / rowTotals / columnTotals を生成し、行頭文字連結（`CR`, `CRU`, ...）形式の文字列を `formatCell` で得られる
  > ✅ Automated — `packages/core/src/view/crud-matrix-extract.test.ts` › `collects rows, columns, and cells with CRUD verbs`

- [x] AT-B: 装飾無しの unrecognized verb は cell に `?` suffix（`R?` 等）として現れ、`unknownVerbs` に raw 文字列が保持される
  > ✅ Automated — `crud-matrix-extract.test.ts` の `R?` / `unknownVerbs` 検証

- [x] AT-C: `operations` 未宣言の cell は `?` 単独表示（`declared: false`）になる
  > ✅ Automated — 同上テスト

- [x] AT-D: `--service` / `--infra` / `--writes-only` フィルタが行・列を正しく絞り込む
  > ✅ Automated — `crud-matrix-extract.test.ts` の filters by service / infra / writes-only

- [x] AT-E: 行末・列末の Σ集計セル（`ΣC ΣR ΣU ΣD`）が verb 別に正しくカウントされる
  > ✅ Automated — `crud-matrix-extract.test.ts` › `computes row and column totals`

- [x] AT-F: default は show-empty（`omitEmpty: false`）。`omitEmpty: true` で全セル空の行・列が drop され、`omitted.rows` / `omitted.columns` がカウントされる
  > ✅ Automated — `crud-matrix-extract.test.ts` › `default keeps empty rows/columns; --omit-empty drops them`

- [x] AT-G: `formatMatrixAsMarkdown` / `formatMatrixAsCsv` がヘッダー・rows・Σ集計・unknown_verbs 列／脚注を出力する
  > ✅ Automated — `crud-matrix-format.test.ts`

- [x] AT-H: `renderMatrixAsSvg` が SVG 文字列を生成し、cell ラベル / Σ ヘッダー / unknown verb 脚注を含む
  > ✅ Automated — `matrix-svg.test.ts`

- [x] AT-I: `karasu matrix` CLI が `--format md|csv|svg` で適切な出力を吐き、`--service` / `--no-totals` / 不正な `--format` を正しく処理する
  > ✅ Automated — `packages/cli/src/matrix.test.ts`

- [x] AT-J: `CrudMatrixPanel` が systems から HTML テーブルを描画し、service / infra dropdown フィルタが行・列を絞り込む
  > ✅ Automated — `packages/app/src/components/CrudMatrixPanel.test.tsx`

- [x] AT-J2: app の `DiagramTabBar` に Matrix タブが出て、選択すると `CrudMatrixPanel` が描画される（preview-toolbar は隠れる）
  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `matrix tab`

- [ ] AT-K（manual）: `karasu matrix examples/getting-started/index.krs --format=md` を実行し、`OrderTable` 列を眺めたとき、書き込む usecase（`PlaceOrder` / `RegisterProduct`）と read だけの usecase（`ShowOrderHistory` / `SearchProducts`）が verb 文字列で識別でき、行末・列末の Σ 集計セルが描画されていることを目視確認する
  > 🧑 Manual — terminal で出力を確認

- [ ] AT-L（manual）: `karasu matrix examples/feature-samples/crud-matrix.krs --format=svg -o /tmp/m.svg` を生成しブラウザで開き、grid layout が読めること、`R?`（`SearchOrders`）と単独 `?`（`ReplayOrderEvents`）が正しく描かれていること、unknown verb 脚注が表示されることを確認する
  > 🧑 Manual — SVG をブラウザで目視確認

- [ ] AT-M（manual）: `karasu render examples/getting-started/index.krs --include-matrix --output /tmp/out.svg` を実行し、`/tmp/out.svg` と `/tmp/out.matrix.svg` が同じディレクトリに出力されることを確認する
  > 🧑 Manual — シェル実行で確認

- [ ] AT-N（manual）: `--omit-empty` を付けたときに未宣言の行・列が消え、付けないとき（default）に未宣言の行・列も出ることを `examples/feature-samples/crud-matrix.krs` で目視比較する
  > 🧑 Manual — `karasu matrix --omit-empty` と無し版を比較

## 補足

verb 装飾構文（`<verb>:<crud>` の 1:N マッピング、例 `replace:create,delete`）は本 PR のスコープ外。装飾無しの unrecognized verb は cell に `?` suffix として現れる。装飾構文が landed 後は `?` suffix が自然に減る — design doc の「未起票の follow-up」セクション参照。

App panel は `DiagramTabBar` の 4 つ目のタブとして組み込まれており、System / Deploy / Org と並んで Matrix を選択できる。Matrix モード時は preview-toolbar（Icon Mode / All Layers 等）は描画されない（適用対象でないため）。state 永続化（タブ復帰時に最後の Matrix フィルタを覚える）は別 Issue で扱う。
