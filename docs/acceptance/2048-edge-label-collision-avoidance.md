# AT: エッジラベルの自動衝突回避（label placement post-pass）

- **日付**: 2026-07-21
- **関連 Issue**: [#2048](https://github.com/kompiro/karasu/issues/2048)
- **対象ファイル**:
  - `packages/core/src/renderer/label-placement.ts`（新規）
  - `packages/core/src/renderer/label-placement.test.ts`（新規）
  - `packages/core/src/renderer/edge-routing.ts`（`renderEdge` に `labelAnchorOverride`、`labelAnchor` / `resolveLabelPosition` を export）
  - `packages/core/src/renderer/svg-renderer.ts`（エッジ描画ループ前に placement pass を配線）
- **関連**: [ADR-2048](../adr/2048-edge-label-collision-avoidance.md)（本 AT の設計。ADR-1184 の defer を部分的に見直す）、[ADR-1184](../adr/1184-edge-label-position-offset.md)（手動 `label-position` / `label-offset` lever）、[ADR-1185](../adr/1185-parallel-edge-bundling.md)（parallel-edge bundle の label スライド）、[TPL-20260711-02](../test-perspectives/TPL-20260711-02-routing-measures-crossings-and-penetrations.md)（overlap は数値で 0/削減を assert）、[TPL-20260721-02](../test-perspectives/TPL-20260721-02-label-placement-measured-and-byte-stable.md)（本 PR で新設）

## 受け入れ条件

- [x] 隣接ラベルが重なる合成ケースで、pass 後に label↔label オーバーラップ数が 0 になる
  > ✅ Automated — `label-placement.test.ts` › `separates two overlapping labels (label↔label overlaps → 0)`

- [x] ラベルがノード矩形に食い込む合成ケースで、pass 後に label↔node 貫通数が 0 になる
  > ✅ Automated — `pushes a label off a node card it clips into (label↔node penetrations → 0)`

- [x] 衝突が無いラベルは default アンカーのまま（override マップが空 = byte-stable）
  > ✅ Automated — `leaves non-colliding labels untouched (empty override map → byte-stable)`。加えて既存 renderer snapshot 群（core 全 98 test file）が無変更で green

- [x] author が `label-position` / `label-offset` を指定したラベルは auto に動かされない（ただし障害物としては効く）
  > ✅ Automated — `never moves an author-positioned label, but treats it as an obstacle`

- [x] pass は決定論的（同じ入力 → 同じ配置。`Date` / `Math.random` 不使用）
  > ✅ Automated — `is deterministic — identical inputs yield identical placements`

- [x] どの候補でも完全に clear できない密なケースでも throw せず best-effort で最小コスト位置を返す
  > ✅ Automated — `falls back best-effort (no throw) when no candidate fully clears`

- [x] 実サンプル（`examples/en/ec-platform/01-system.krs` の system top view）で、default 配置では貫通が発生し、pass 後は label↔node 貫通・label↔label オーバーラップともに 0 になる
  > ✅ Automated — `real sample fence — ec-platform system top view (#2048)`（TPL-20260715-01 の「実サンプルを柵に」）

- [ ] app の system top view で、隣接エッジラベルが視覚的に重ならない
  > 🧑 Manual — app で `examples/en/ec-platform/01-system.krs` を `index.krs` として開き、トップ図のエッジラベルが互いに重なっていないことを目視で確認する。

- [ ] app の drill-down view で、エッジラベルがノードカードに食い込まない
  > 🧑 Manual — 同ファイルの ECommerce をドリルダウンし、domain 間エッジのラベルがノード矩形に被って隠れていないことを目視で確認する（bundled / popup の両レンダリング）。

## 範囲外（follow-up）

- **deploy view のラベル衝突**: `deploy-renderer.ts` は独自のエッジ描画で `renderEdge` を通らないため本 pass の対象外。必要なら別 Issue。
- **非常に幅広いラベルの best-effort 限界**: ラベル幅が周辺の空きより大きい密なクラスタでは、2 軸探索（垂直＋線方向、各軸 ±6 ステップ）の範囲内で完全に clear できないことがある。その場合は最小コスト位置に置く（貫通を増やさないことは保証するが 0 は保証しない）。author は `label-position` / `label-offset`（ADR-1184）で明示的に逃がせる。
- **ラベル幅の推定精度**: 実ブラウザのフォントメトリクスではなく `estimateTextWidth`（fontSize×0.6）で推定する。描画と計測が同じ推定を使うため内部整合はとれるが、実フォント幅とは厳密一致しない。
