# AT-1956: Crossing marks in the ungrouped (Group by: none) system view

- **日付**: 2026-07-15
- **Issue**: #1956（follows #1949 / #1939 Part 1・Epic #1817 comprehension）
- **PR**: (#1956 — ungrouped crossing marks)
- **設計**: [docs/design/system-view-grouping.md](../design/system-view-grouping.md) § 「P2c-C 詳細設計」
- **Related TPLs**: [TPL-20260711-02](../test-perspectives/TPL-20260711-02-routing-measures-crossings-and-penetrations.md)（交差数と貫通数を両方測る／交差は「全交差 marked」を assert）
- **対象**: `packages/core/src/renderer/layout.ts`（`computeCrossingMarks` の `groupBands` gate を撤廃） / `layout-types.ts` / `svg-renderer.ts`（scope コメント）

## 概要

marks（hop ◠ / junction ●）は #1859/#1939 まで **grouped（Group by team）専用**で、ungrouped（Group by: none = 既定ビュー）は AC-5（byte-identical）維持のため未描画だった。#1939 Part 1 で `computeCrossingMarks` がビュー非依存（斜め対応）になったので、本 Issue で gate を外し、**単一 system の ungrouped ビューにも marks を出す**。ungrouped は集約トランクが無いので **hop のみ・junction ● は grouped 限定**。交差の無いビューは不変。

## 受け入れ条件

### AC-1: ungrouped でも marks を出す（core）

> ✅ Automated by `packages/core/src/renderer/group-by-render.test.ts` (suite-wide)

- [x] 単一 system の ungrouped ビューで、交差があるとき `crossing-marks` レイヤ（hop `<path>`）を emit する
- [x] ungrouped は junction `<circle>` を出さない（トランクが無い）
- [x] `LayoutResult.crossingMarks` は grouped / ungrouped どちらの単一 system layout でも定義される

### AC-2: scope 境界（回帰）

> ✅ Automated by `packages/core/src/renderer/group-by-render.test.ts` (suite-wide)

- [x] multi-system ビューは marks を emit しない（`layoutMultipleSystems` は対象外・#1939 Part 2）
- [x] 交差の無いビューは `crossing-marks` レイヤを出さない（既存 SVG 不変）
- [x] 既存 core（2255）/ app（1066）テスト全通過

## 手動検証

- [ ] **AC-manual**: app で交差のあるモデル（例: `examples/en/hr-tool/system.krs` 相当を `index.krs` として）を **Group by: none（既定）**で開く。エッジの交差箇所に跨ぎアーク（hop、斜め交差は線に沿った向き）が描かれ「非接続」が明示されることを目視確認する。トランクが無いので接続ドット（junction）は出ないことも確認する。
