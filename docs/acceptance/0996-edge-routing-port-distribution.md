# AT: Port distribution and channel lane allocation for edge fan-out

- **日付**: 2026-04-29
- **関連 Issue**: [#996](https://github.com/kompiro/karasu/issues/996)（親 [#968](https://github.com/kompiro/karasu/issues/968) → [#966](https://github.com/kompiro/karasu/issues/966)）
- **対象ファイル**:
  - `packages/core/src/renderer/edge-routing-ports.ts`（新規）
  - `packages/core/src/renderer/edge-routing-lanes.ts`（新規）
  - `packages/core/src/renderer/layout.ts`
- **ADR**: [ADR-20260429-01](../adr/20260429-01-orthogonal-edge-routing-skip-layer.md)

## 受け入れ条件

- [x] 同じノードの同じ辺に N ≥ 2 本のエッジが付くとき、ポートが `i/(N+1)` で等間隔に分散される
  > ✅ Automated — `packages/core/src/renderer/edge-routing-ports.test.ts` › `spreads N edges across the bottom side at i/(N+1)`

- [x] ポートの並び順は対岸の方向（top/bottom 側は対岸の x、left/right 側は対岸の y）に従い、エッジ同士が辺の上で交差しない
  > ✅ Automated — `packages/core/src/renderer/edge-routing-ports.test.ts` › `does not cross edges at the node side` / `distributes across left/right sides by opposite endpoint y`

- [x] ghost edge と cyclic edge はポート分散の対象外
  > ✅ Automated — `packages/core/src/renderer/edge-routing-ports.test.ts` › `skips ghost and cyclic edges`

- [x] ノード辺に乗っていない端点（ghost domain の上下アンカー等）は変更されない
  > ✅ Automated — `packages/core/src/renderer/edge-routing-ports.test.ts` › `does not touch endpoints not anchored on a node side`

- [x] 同一の inter-row channel を共有する N 本のエッジは、それぞれ別の lane（waypoint y）に staggered される
  > ✅ Automated — `packages/core/src/renderer/edge-routing-lanes.test.ts` › `staggers two edges sharing the same channel into distinct lanes` / `orders lanes by leftX ascending`

- [x] waypoints を持たないエッジ、または waypoint y が L 字形状でないエッジは lane 分散の対象外
  > ✅ Automated — `packages/core/src/renderer/edge-routing-lanes.test.ts` › `does not touch edges with no waypoints` / `does not touch edges whose two waypoints have differing y`

- [x] 実例（hub から 3 本以上の outgoing edge）でポートが distinct な x に分散する
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `spreads multiple downward edges from a hub across distinct x ports`

- [ ] Getting Started 例（`@example getting-started`）の `ECommerce` 周辺のエッジラベルが目視で重なっていないこと、エッジが扇状に広がって見えること
  > 🧑 Manual — Preview URL（`https://feat-edge-routing-phase3.karasu.pages.dev`）または `pnpm dev` でローカル起動して Getting Started サンプルを開き、視覚的に確認する。

## スコープ外（follow-up）

- 1 channel あたりのレーン数上限（密な fan-out で channel が縦に広がりすぎる問題）— ADR-20260429-01 の判断保留事項
- ghost domain edge / cyclic edge の port 分散
- 横方向 layered モード対応
