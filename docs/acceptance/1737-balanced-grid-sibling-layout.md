# AT: 多すぎる兄弟ノードをバランス grid で畳む

- **日付**: 2026-06-24
- **関連 Issue**: [#1737](https://github.com/kompiro/karasu/issues/1737)
- **対象ファイル**: `packages/core/src/renderer/layer-layout-logics.ts`,
  `packages/core/src/renderer/layout.ts`,
  `packages/core/src/renderer/deploy-layout.ts`,
  `packages/core/src/renderer/org-tree-renderer.ts`,
  `packages/core/src/resolver/style-resolver.ts`,
  `docs/spec/style.md`(+`.ja.md`), `docs/spec/diagnostics.md`(+`.ja.md`)

## 受け入れ条件

コンテナが直接子を多数持つとき、子が横一列に潰れて読めなくなる症状を **レイアウトで** 解消する。
既定では兄弟をバランス grid（小さい集合は1行、大きい集合は `ceil(sqrt(n))` 列・最大5列）に畳み、
`.krs.style` の `grid-columns: N` で列数を上書きできる。決定性（同入力→同 SVG）を保つ。
診断は起こさない（karasu は visualizes, does not prescribe）。

- [x] 兄弟数 ≤ 5（列上限）は1行のまま（無駄な折り返し・スナップショット churn を避ける）

  > ✅ Automated — `packages/core/src/renderer/layer-layout-logics.test.ts` › `gridColumnCount` › `keeps small sets (<= cap) on a single row`; `packages/core/src/renderer/layout.test.ts` › `balanced grid wrapping (#1737)` › `keeps a small sibling set (<= cap) on one row`

- [x] 兄弟数 > 5 は ≈ 正方形の grid（`ceil(sqrt(n))` 列・最大5列）に複数 sub-row で畳まれる

  > ✅ Automated — `layer-layout-logics.test.ts` › `gridColumnCount` › `auto-balances larger sets toward a square, capped at GRID_COLUMN_CAP`（9→3, 10→4, 25→5, 30→5）; `layout.test.ts` › `balanced grid wrapping (#1737)` › `wraps many siblings into a balanced grid (multiple sub-rows)`

- [x] 1行が `MAX_LAYER_WIDTH` を超える場合は列上限未満でもさらに折り返す（過大指定でもフレームを溢れさせない）

  > ✅ Automated — `layer-layout-logics.test.ts` › `wrapLayerIntoRows` › `wraps early when a row would exceed maxWidth, even under the column cap`

- [x] `.krs.style` の `grid-columns: N`（正の整数）が自動列数を上書きする

  > ✅ Automated — `layout.test.ts` › `balanced grid wrapping (#1737)` › `honors a grid-columns hint on the container, overriding the auto count`; `packages/core/src/resolver/style-resolver.test.ts` › `grid-columns layout hint (#1737)` › `populates layoutHints.gridColumns for a positive integer`

- [x] `grid-columns` の不正値（0 / 負 / 非整数）は `style-grid-columns-invalid-value` warning を出して破棄し、自動バランスにフォールバックする

  > ✅ Automated — `style-resolver.test.ts` › `grid-columns layout hint (#1737)` › `emits style-grid-columns-invalid-value and skips the hint for non-positive / non-integer`

- [x] `grid-columns` は org の team ノード（member grid の列数）でも有効

  > ✅ Automated — `style-resolver.test.ts` › `grid-columns layout hint (#1737)` › `is honored on an org team node (member-grid override)`

- [x] 出力は決定的（同じ入力で同じ座標）

  > ✅ Automated — `layer-layout-logics.test.ts` › `gridColumnCount` › `is deterministic`; `layout.test.ts` › `balanced grid wrapping (#1737)` › `is deterministic: identical input produces identical coordinates`

- [x] 全 render path（単一 system / 複数 system root / drill-down / deploy / org member grid）が同一の grid 規則を通る（parity, [TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md)）

  > ✅ Automated — 列数の決定規則 `gridColumnCount`（`layer-layout-logics.ts`）を `layout.ts`（単一 + 複数 system）・`deploy-layout.ts` が共有（org member grid は既に bounded なため `memberCols` で既定 3・`grid-columns` 上書き）。行折り返しの配置は単一 system path が共有 `wrapLayerIntoRows` を用い、複数 system / deploy path は各々の座標系（barycenter / centerX 追跡・OUTER_PADDING）に合わせて同じ折り返し規則（列数 or `MAX_LAYER_WIDTH`）をインラインで適用する。既存の各 render path スナップショット（`drill-down-svg.test.ts` / `multi-level-svg.test.ts` / `deploy-layout.test.ts` / `org-renderer.test.ts`）が非退行で通過

### 手動確認

- [ ] `examples/` の `index.krs` を app で開き、直下に多数の子を持つ system / service が横一列に潰れず、適度な解像度の grid で一目で把握できる（[TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md) の解像度観点）

## 備考（スコープ外）

- span of control 過多を「気づき」として知らせる **info 診断** は v1 では起こさない（follow-up 候補）。
- org member grid の **既定列数は 3 のまま**（既に bounded な grid で「横一列に潰れる」症状が構造的に起きないため auto-balance しない）。`grid-columns` 指定時のみ上書きする。
