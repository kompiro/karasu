# AT-1859-B: Group by team — aggregation trunks for shared infra/external targets (P2c-B)

- **日付**: 2026-07-12
- **Issue**: #1859（親 #1822 / Epic #1817 comprehension）
- **PR**: (P2c-B — aggregation trunks)
- **設計**: [ADR-1859](../adr/1859-system-view-p2c-grouped-edge-routing-and-marks.md)
- **Related TPLs**: [TPL-20260711-02](../test-perspectives/TPL-20260711-02-routing-measures-crossings-and-penetrations.md)（可読性検証は交差数と貫通数を両方測り、貫通は 0 を assert）, [TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md)（参照エッジ端点保持 / edge identity）
- **対象**: `packages/core/src/renderer/edge-routing-groups.ts`（`aggregateGroupTrunks` 追加） / `layout.ts` / `layout-types.ts`

## 概要

Group by: team の P2c slice B。P2c-A は各 cross-band エッジをサイドガターへ迂回させるが、同一 infra/external target を共有する複数エッジは**同じ既定ガター x** に落ちるため、複数 target の spine が重なる。本 slice は、共有 target（fan-in、gutter-routed な incoming ≥ 2）ごとに**専用のトランク・レーン**を割り当て、その incoming エッジを**1 本の縦 spine** に合流させて target に一度だけ入れる。各トランクエッジは `trunkId = <target id>` を持つ。合流点（`waypoints[0]` の elbow）を P2c-C が junction dot で描く。edge identity は保持（描画の合流であって edge 統合ではない — ADR-1185 の立場）。

## 受け入れ条件

### AC-1: トランク合流（core, AC-2 の「1 トランクに束ねる」）

> ✅ Automated by `packages/core/src/renderer/edge-routing-groups.test.ts` (suite-wide)

- [x] 共有 target への incoming（gutter-routed）エッジが 2 本以上あるとき、それらは同一の trunk lane x（`waypoints[0].x` が一致）を共有し、target に一度だけ（同一 `toPoint`）入る
- [x] 各トランクエッジに `trunkId = <target id>` が付く
- [x] 各エッジの合流点は `waypoints[0]`（source 行から spine に入る elbow）で、`waypoints[0].y === fromPoint.y`（P2c-C の junction dot 座標）
- [x] incoming が 1 本だけの target はトランク化しない（`trunkId` が付かない）

### AC-2: レーン分離 / 決定性（core）

> ✅ Automated by `packages/core/src/renderer/edge-routing-groups.test.ts` (suite-wide)

- [x] 異なる共有 target は異なる trunk lane x を持つ（spine が重ならない）
- [x] レーン割当は決定的（target の y、次に id 順）

### AC-3: 貫通ゼロの保存（core, TPL-20260711-02）

> ✅ Automated by `packages/core/src/renderer/edge-routing-groups.test.ts` (suite-wide)

- [x] トランク化後も貫通数 == 0（トランクレーンは全カード/フレームの外側の右ガター域にあり、各エッジ経路は再検証する）
- [x] target のエッジを全て clean に再ルートできない場合はトランク化せず P2c-A の経路を保持（never worse）
- [x] 全トランク spine が layout width 内に収まる（`computeTotalDimensions` が waypoint を含めるので lane ≥ 1 が viewport でクリップされない）

### AC-4: 既定パス温存 / edge identity（回帰）

> ✅ Automated by `packages/core/src/renderer/group-by-render.test.ts` (suite-wide) — byte-identity + per-edge `<g data-edge-*>`

- [x] `groupBy` 未指定は option 無しと **byte 一致**（`aggregateGroupTrunks` は `groupBands != null` の gate 内でのみ走る）
- [x] トランク化しても各エッジは独立した `LayoutEdge`（edge id selector / diff / direction style を壊さない）
- [x] 既存 core スイート（2140 tests）が全通過（回帰なし）

## 手動検証

- [ ] **AC-manual**: app で複数チームが同一 infra/external を参照するモデル（`index.krs`）を Group by → Team で開く。共有 target に入る複数エッジが 1 本の縦トランクにまとまって target に入り、別の共有 target は別レーンの縦線になっていることを目視確認する。

> junction dot（合流点の ● マーク）と hop アークの描画は P2c-C。本 slice はトランク geometry と `trunkId` / 合流点座標を出すところまで。
