---
type: product
---

# AT: 展開表示のサービス間で平行エッジが重ならない（#2477）

- **日付**: 2026-08-13
- **関連 Issue**: [#2477](https://github.com/kompiro/karasu/issues/2477)
- **Related TPLs**: [TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)（新しい route / 端点の形が既存の overlap 回避パスを素通りしていないか）, [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)（同一ペアの parallel edge は互いに区別できる形で描く）
- **対象ファイル**:
  - `packages/core/src/renderer/edge-routing-bundles.ts`（`markParallelBundles` / `isStacked`）

> 同一ペアの平行エッジは `distributePorts` がポートを分散して分離する。展開表示（in-place expansion）のサービスは `ExpandedFrame` でありレイアウトノードではないため、`distributePorts` が端点を引けずスキップし、束ねが ghost / cyclic のときしかずらさなかったので線が完全に重なっていた。ずらす条件を「カテゴリ」から「まだ重なっているという観測可能な幾何」に変える。

## 受け入れ条件

### AC-1: 展開表示で平行エッジが分離する

- [x] AT-A: 2 つの展開サービス間に sync と async を書くと、2 本の端点 x 座標が異なる

  > ✅ Automated — `packages/core/src/renderer/layout.expand.test.ts` › layout — in-place expansion band + frame (#1921) › separates parallel edges between two expanded services

- [x] AT-B: ポートが分散されていない束ね（stacked）は、ghost / cyclic でなくても垂直方向に `BUNDLE_GAP` だけずれる

  > ✅ Automated — `packages/core/src/renderer/edge-routing-bundles.test.ts` › markParallelBundles › nudges a stacked bundle of regular edges

### AC-2: 既存の描画を壊さない

- [x] AT-C: `distributePorts` が既に分散させたエッジのポートは動かさない

  > ✅ Automated — `packages/core/src/renderer/edge-routing-bundles.test.ts` › markParallelBundles › does not move regular edge ports — leaves geometry to distributePorts

- [x] AT-D: 自前の経路を持つエッジ（`waypoints` / `trunkId`）は、重なっていても端点を動かさない（polyline から線が外れるため）

  > ✅ Automated — `packages/core/src/renderer/edge-routing-bundles.test.ts` › markParallelBundles › leaves a stacked bundle alone when the edges carry their own route ／ leaves a stacked bundle alone when the edges ride an aggregation trunk

- [x] AT-E: ghost / cyclic の既存のずらし挙動と N=3 の対称オフセットが変わらない

  > ✅ Automated — `packages/core/src/renderer/edge-routing-bundles.test.ts` › markParallelBundles（nudges ghost edges … ／ nudges cyclic edges … ／ handles N=3 with symmetric offsets）

### 手動確認

- [ ] M-1: <https://karasu.kompiro.dev/> で 2 サービス間に `S1 -> S2` と `S1 --> S2` を書き、両サービスを展開すると実線と破線が 2 本見える
- [ ] M-2: 折りたたみ状態に戻しても従来どおり 2 本が分離して見える
