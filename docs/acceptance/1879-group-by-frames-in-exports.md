# AT-1879: Render Group-by frames in Show All Layers / export SVGs (full structure, no collapse)

- **日付**: 2026-07-11
- **Issue**: #1879（親 #1858 P2a follow-up / Epic #1817 comprehension）
- **PR**: feat/group-by-exports
- **決定**: [ADR-1858](../adr/1858-system-view-group-by-team.md)（決定 7 に export-surface ルールを追記）
- **Related TPLs**: [TPL-1738](../test-perspectives/TPL-1738-relayout-into-group-preserves-placement-and-edges.md)（要素を別グループへ再配置 → 全要素ちょうど一度配置 + 参照エッジ端点保持）
- **対象**: `packages/core/src/renderer/all-layers-svg.ts` / `drill-down-svg.ts` / `index.ts`、`packages/app/src/hooks/useViewSvg.ts` / `components/AppShell.tsx`

## 概要

secondary / export SVG（**Show All Layers**・drill-down export・**Open & Export All Views** = `buildAllLayersSvg` / `buildDrillDownSvg` / `buildAllViewsSvg`）に system view の **`groupBy`** を通す。ビューアが「Group by: team」を有効にしているとき、export でも team バンド＋境界フレームで束ねる。ただし **collapse は適用しない**（`collapsedGroups` を渡さない）— export は「畳んだ姿」ではなく**完全な構造**を見せる目的。opt-in で、`groupBy` 未指定なら従来出力と byte 一致。

> **訂正（2026-07-17, #1983）**: 本 AT は当初「grouping は root system-view level のみ適用（drill-down の深い層にチームは無い）」としていたが、これは boundary 軸（kind 制限なし）には成立せず、[#1983](https://github.com/kompiro/karasu/issues/1983) でその root-only gate を撤去した。現行の挙動は「grouping は各ビューで、そのレベルに描画されるノード集合との交差で解決される」— drill-down の深い band / level にも、そこに member が居れば同じ仕組みでフレームが出る。詳細は [AT-1983](1983-boundary-drilldown-grouping.md) と [ADR-1858](../adr/1858-system-view-group-by-team.md) 決定 7 の注記を参照。「collapse は export に適用しない」は変わらず有効。以下の AC は現行挙動（per-level）に合わせて更新済み — 参照先のテストファイル・suite 名は不変（実装 PR で assert 内容のみ per-level 用に更新されたため）。

## 受け入れ条件

### AC-1: core — export ビルダへの `groupBy` スレッド（per view level, #1983 で一般化）

> ✅ Automated by `packages/core/src/renderer/all-layers-svg.test.ts` (suite-wide) — describe "buildAllLayersSvg with groupBy: team (#1879)"

- [x] `groupBy: "team"` で root system band に team 境界フレーム（`data-container-id="__group_<team>__"` / `data-group="true"`）がチームごとに1つずつ出る
- [x] grouping は各 band で、その band に描画される member との交差により解決される — root only ではない。深い drill-down band に owns/contains の member が居れば、その band にも同じ boundary/team のフレームが出る（disjoint な複数フレーム。#1983 で root-only gate を撤去）
- [x] `groupBy` 未指定は option 無しと **byte 一致**（opt-in・後方互換）

### AC-2: core — full structure を保つ（collapse 非適用）

> ✅ Automated by `packages/core/src/renderer/all-layers-svg.test.ts` (suite-wide) — "keeps the full structure" (+ `drill-down-svg.test.ts` "draws team frames … keeps the full structure")

- [x] grouped でも全メンバー（`data-node-id="…"`）がちょうど一度描かれる（TPL-1738 の全域性）
- [x] collapse stub（`__group_collapsed_…`）は出力に一切現れない — export に `collapsedGroups` を渡さない設計を回帰で固定

### AC-3: core — drill-down / all-views サーフェスも同一挙動

> ✅ Automated by `packages/core/src/renderer/drill-down-svg.test.ts` (suite-wide) — describe "buildDrillDownSvg with groupBy: team (#1879)" / "buildAllViewsSvg with groupBy: team (#1879)"

- [x] `buildDrillDownSvg` は member の居る全レベル（root だけでなく drill page / entity page も含む）に team フレームを描き、full structure を保つ（#1983 で per-level 化）
- [x] `buildAllViewsSvg` は system-view ペインの member が居る全レベルを grouping（org / deploy ペインは非改変のまま）
- [x] 両者とも `groupBy` 未指定は option 無しと一致

### AC-4: app — view-state 配線（`useViewSvg` → 3 ビルダ）

> ✅ Automated by `packages/app/src/hooks/useViewSvg.test.tsx` (suite-wide) — describe "useViewSvg > groupBy threading to export SVGs (#1879)"

- [x] `useViewSvg(..., "team")` で allLayers / drillDown / allViews すべてに `data-group="true"` が乗る
- [x] `groupBy` 無しではどの export にもフレームが出ない
- [x] `groupBy` を flip すると export SVG が再レンダリングされる（reactive）
- [x] `AppShell` は `views.system.groupBy === "team"` を `useViewSvg` に渡す（`"none"` → `undefined`）

### AC-5: 手動（描画の目視確認）

`organization` / `owns` を持つモデル（`index.krs`）を app で開き、system view の Group by を **Team** にする:

- [ ] **Show All Layers** をトグルすると、root band が team 境界フレームで束ねられて描かれる
- [ ] **Open & Export All Views** / drill-down export の system ペインでも root に team フレームが出る
- [ ] export では collapse されず**全ノードが見える**（畳まれた ⊕ スタブが出ない）— full structure
- [ ] drill-down の深い層（service / domain 内部）に owns の member が居れば、そこにも team フレームが出る（#1983 — root-only ではない。member が居ないレベルは従来どおりフレームなし）
- [ ] Group by を **None** に戻すと export からフレームが消える（従来出力）
