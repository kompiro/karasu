# AT-1859: Group by team — orthogonal side-gutter routing, 0 node/frame penetration (P2c-A)

- **日付**: 2026-07-12
- **Issue**: #1859（親 #1822 / Epic #1817 comprehension）
- **PR**: (P2c-A — core routing)
- **設計**: [ADR-20260715-03](../adr/20260715-03-system-view-p2c-grouped-edge-routing-and-marks.md)
- **Related TPLs**: [TPL-20260711-02](../test-perspectives/TPL-20260711-02-routing-measures-crossings-and-penetrations.md)（可読性検証は交差数と貫通数を両方測り、貫通は 0 を assert）, [TPL-20260623-04](../test-perspectives/TPL-20260623-04-tier-split-no-edge-penetration.md)（段跨ぎ edge がカードを貫通しない）, [TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md)（全要素ちょうど一度配置 + 参照エッジ端点保持）
- **対象**: `packages/core/src/renderer/edge-routing-groups.ts`（新規） / `edge-geometry.ts`（新規） / `layout.ts` / `edge-routing.ts` / `layout-types.ts`

## 概要

Group by: team（P2a）の展開ビューのエッジを直交ルーティングに置き換える P2c の slice A。二段バンドレイアウトでは、service→infra の直線エッジが途中のチームフレーム・カードを貫通する（合成 2 チームモデルで実測 11 貫通）。本 slice は**グループフレームを障害物集合に加え**、貫通するエッジを**サイドガター**（全フレームの外側にある縦回廊）経由の直交経路に迂回させ、**ノード・フレーム貫通をゼロにする**。逆流（against-flow）エッジは破線化する。`groupBy` 未指定（Group by: none）は byte 単位で不変。集約トランク（P2c-B）と hop/junction（P2c-C）は後続スライス。

## 受け入れ条件

### AC-1: 貫通ゼロ（core, TPL-20260711-02 二重計測）

> ✅ Automated by `packages/core/src/renderer/edge-routing-groups.test.ts` (suite-wide)

- [x] grouped 展開ビューで、どのエッジセグメントもノードカード / グループフレームの内部を貫通しない（貫通数 == 0 を厳密 assert）
- [x] 同じ grouped ノード配置で直線 center-to-center に描くと貫通する（> 0）ことを確認 — fixture が実際にルータを起動していることの担保
- [x] 交差数も併せて計測する（TPL-20260711-02: 交差数だけで可読性を判断しない。P2c-A は交差を減らさず貫通を消す）
- [x] 障害物集合は「全ノードカード ∪ 端点を含まない全フレーム」— エッジは自チームフレーム内で始点/終点を持ってよい

### AC-2: ルーティング挙動（core）

> ✅ Automated by `packages/core/src/renderer/edge-routing-groups.test.ts` (suite-wide)

- [x] 障害物を跨がないバンド内隣接エッジは直線のまま（`waypoints` 無し）— 単純なエッジは単純に保つ
- [x] バンドを跨いで貫通するエッジはサイドガター経由の直交経路（2 waypoints、同一 gutter x = 全カード外側の縦回廊）になる
- [x] 右ガターが塞がれていれば左ガターを試し、どちらも塞がれていれば直線にフォールバック（strictly monotonic）

### AC-3: 逆流エッジの破線（core, compile e2e）

> ✅ Automated by `packages/core/src/renderer/edge-routing-groups.test.ts` (suite-wide) — + `packages/core/src/renderer/group-by-render.test.ts` の backward-dash render test

- [x] 対象バンドが起点バンドより上にある無循環エッジに `groupBackward` が付く。順方向エッジには付かない
- [x] compile 出力で `groupBackward` エッジが破線（`stroke-dasharray="8 4"`）で描かれ、順方向エッジは破線にならない
- [x] author が `stroke-style` を明示したエッジはその指定が優先（自動破線は default `solid` のときのみ）
- [x] cyclic エッジは従来の cyclic スタイル（赤）を保ち、backward-dash の対象外

### AC-4: 退化ケース / 既定パス温存（回帰）

> ✅ Automated by `packages/core/src/renderer/edge-routing-groups.test.ts` (suite-wide) — + `packages/core/src/renderer/group-by-render.test.ts`（byte-identity）

- [x] チーム 1 つのモデルでも貫通ゼロ
- [x] `groupBy` 未指定は option 無しと **byte 一致**（ungrouped は `routeOrthogonalEdges` のまま、`routeGroupedEdges` は `groupBands != null` の gate 内でのみ走る）
- [x] ghost / cyclic エッジは従来どおり（本ルータはスキップ）
- [x] 既存 core スイート（2136 tests）が全通過（回帰なし）

## 手動検証

- [ ] **AC-manual**: app で `organization` / `owns` を含むモデル（`index.krs`）を開き、Group by → Team を選ぶ。展開状態で service→infra/external のエッジがチームフレームやカードを突き抜けず、フレームの外側（サイドガター）を回って目的ノードに入ることを目視確認する。逆流の依存があれば破線で浮かび上がることを確認する。None に戻すとエッジ描画が従来どおりに戻る。

> P2c-B（集約トランク）/ P2c-C（hop/junction）は本 PR の範囲外。展開ビューのガター内で複数エッジが重なって見えるのは想定内で、トランク束ね（B）と交差マーク（C）で解消する。
