---
id: ADR-2048
title: "エッジラベルの自動衝突回避 — レンダー後段の label placement post-pass"
status: accepted
date: 2026-07-21
topic: renderer
related_to:
  - ADR-1184
  - ADR-1185
  - ADR-968
scope:
  packages: [core]
assumptions:
  - "file: packages/core/src/renderer/label-placement.ts"
  - "symbol: packages/core/src/renderer/label-placement.ts :: resolveLabelPlacements"
  - "file: packages/core/src/renderer/label-placement.test.ts"
---

# ADR-2048: エッジラベルの自動衝突回避 — レンダー後段の label placement post-pass

- **日付**: 2026-07-21
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#2048](https://github.com/kompiro/karasu/issues/2048)
  - 関連 ADR: [ADR-1184](./1184-edge-label-position-offset.md)（手動 `label-position` / `label-offset` lever。本 ADR がその「auto collision detection は defer」を部分的に見直す）、[ADR-1185](./1185-parallel-edge-bundling.md)（parallel-edge bundle の label スライド）
  - 関連 TPL: [TPL-2048](../test-perspectives/TPL-2048-label-placement-measured-and-byte-stable.md)（本 PR で新設）、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)
  - AT: `docs/acceptance/2048-edge-label-collision-avoidance.md`

## 背景

エッジラベルが他要素と衝突していた（#2048）:

- **system top view** — 隣接するエッジラベル同士が重なる。
- **drill-down view** — 短いエッジの middle-anchor ラベルがノード矩形に食い込む。

bundled / popup 両方で再現する一般のラベル配置問題。現状ラベルは `renderEdge` 内でエッジ単位・midpoint 固定で描画され、他ラベルやノード矩形を一切見ていないため、幾何的に不可避だった。

ADR-1184 は同じ問題を認識しつつ、手動 lever（`label-position` / `label-offset`）を先に入れ、**auto collision detection は「graph drawing としての設計が必要で重い」として defer** していた。#2048 はその auto 配置を求めるもの。

## 決定

`svg-renderer` のエッジ描画ループの前に、**レンダー後段の label placement post-pass** を走らせる。衝突するラベルだけを上限付き・貪欲・決定論的に nudge して、ノードカード貫通と label 同士のオーバーラップを解消する（`packages/core/src/renderer/label-placement.ts`）。

- **障害物 = 葉ノードの矩形のみ**。境界フレーム（container）はラベルが正当に内側に住む領域なので障害物に含めない。
- **2 軸探索**: 候補は「ラベルが乗る**局所セグメント**に垂直な軸（線から持ち上げる）」と「そのセグメントに沿う軸（線に沿って空きへスライドする）」の 2 次元グリッド（各軸 ±maxSteps、既定 6）。変位の小さい順に走査し、**default(0,0) が最初**なので clear なラベルは動かない。単一の垂直軸では不十分 —— 縦向きエッジが左右のノードに挟まれている場合、逃げ場は「線を横切る」方向ではなく「線に沿う」方向にしかない。
- **垂直軸は from→to chord ではなく局所セグメント基準**。bent / waypoint route でも lift が線に対して直角になる（`labelAnchorWithSegment` が anchor と局所セグメント方向を返す）。
- **ghost / cyclic エッジは対象外**（周辺的・dimmed。crossing-marks・port fan-out・channel/group routing・bundle nudge も同様に除外 — ADR-968）。移動もせず障害物にもならない。
- **衝突が無いラベルは default 維持**（override なし）→ 衝突が無い図は byte-identical。
- **author 指定（非 default position/offset）は auto 対象外**。obstacle としては効く（author intent が勝つ）。
- `renderEdge` に optional `labelAnchorOverride` を追加し、pass が算出したアンカーを渡す。`buildLabelInputs` を placement module に切り出し、renderer 本体と test が同じ入力構築・箱推定を共有する。

## 理由

- **単一 choke point に閉じる**: 論理/graph view のエッジラベルはすべて `renderEdge` を通り、drill-down も同経路。system-top / drill-down が一度に直る。
- **byte-stability を条件付きで維持**: ADR-1184 が守った「default 経路の byte-stable」を「衝突が無い限り」に狭めるだけ。既存 renderer snapshot は無変更で green（衝突していた guide diagram 1 件のラベルのみ移動）。
- **author lever と共存**: ADR-1184 の手動指定が引き続き最優先。auto は「author が何も指定していない」ラベルにだけ効く。よって supersede ではなく related。
- **計測して直す**: label↔node 貫通数・label↔label オーバーラップ数を数値で 0/削減 assert（TPL-1927 の label 版 = TPL-2048）。合成 fixture に加え実サンプル（`examples/en/ec-platform/01-system.krs`）を柵にした。
- **純幾何・決定論**: `Date` / `random` 不使用。同じ入力 → 同じ配置。

## 却下した案

### 案: 垂直（screen-axis）固定 nudge のみ
常に真下/真上へずらす（ADR-1184 の offset と同じ軸）。
- 却下理由: 縦向きエッジの隣接ラベル同士は垂直 nudge では分離できない（エッジに沿ってスライドするだけ）。エッジ垂直方向のほうが縦横どちらのエッジでも分離が効き、near-horizontal エッジでは実質垂直になり ADR-1184 の典型ケースと一致する。

### 案: レイアウトでノードを離してラベル空間を作る
レイアウトパス自体を変えてラベル用スペースを確保する。
- 却下理由: 影響範囲が全レイアウト・全 snapshot に及び、cosmetic 修正には過大。ADR-1184 が「重い」と defer した方向そのもの。ラベルだけ動かす後段 pass のほうが局所的。

### 案: 手動 lever のみで据え置き（コード変更なし）
`label-position` / `label-offset` を案内して #2048 を working-as-designed で閉じる。
- 却下理由: default 配置で衝突する図をそのまま出荷し続けることになり、#2048 の症状（読めないラベル）が残る。手動 lever は auto を押さえきれないケースの逃げ道として引き続き有効だが、既定の可読性は自動で担保すべき。

## スコープ外（フォローアップ）

- **deploy view のラベル衝突**: `deploy-renderer.ts` は独自のエッジ描画で本 pass の対象外。
- **非常に幅広いラベルの best-effort 限界**: 周辺の空きより幅広いラベルは探索上限内で完全に clear できないことがある（貫通を増やさないことは保証、0 は保証しない）。author は `label-position` / `label-offset` で明示的に逃がせる。
- **ラベル幅の実フォントメトリクス化**: 現状 `estimateTextWidth`（fontSize×0.6）推定。描画と計測が同じ推定を使うため内部整合はとれる。
- **multi-line ラベルの per-line 配置**: single line 前提（ADR-1184 と同じ defer）。
