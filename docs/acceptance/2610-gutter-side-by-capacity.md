---
type: product
---

# AT: ガターの左右を固定順ではなく空き容量で選ぶ（#2610）

- **日付**: 2026-09-04
- **関連 Issue**: [#2610](https://github.com/kompiro/karasu/issues/2610)（親: [#2598](https://github.com/kompiro/karasu/issues/2598) スライス C）
- **Related TPLs**: [TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)（貫通と重なりを同じテストで測る）, [TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)（新しい route 形が overlap 回避パスを素通りしない）, [TPL-1761](../test-perspectives/TPL-1761-external-side-placement-invariant.md)（external のサイド配置は決定的で他帯を侵さない）, [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)（並列関数のパリティ）
- **対象ファイル**:
  - `packages/core/src/renderer/edge-routing-groups.ts`（左右の候補を占有と経路長で価格づけして選ぶ。fan-out は辺に付く全エッジを対象にする）
  - `packages/core/src/renderer/layout.ts`（multi-system root で左レーンの張り出し分だけ system をずらす）

> ガターの側は定数だった（右を試して駄目なら左）。内部回廊に入れないエッジは全部右に積み上がり、dify の `Knowledge` view では 460 waypoint 中 204 が右半分、58 が幅の 85% より外にあった。**両側で候補経路を作り、その側の占有回廊数から見込むレーン位置での経路長が短い側を採る。同点は右**（従来の順序）。処理順は宣言順でなく端点の幾何で正準化する。
>
> 左右に分かれた経路は、mixed route のチャネル端が L 経路のポートと同じ x に落ちる衝突を露わにした（fan-out が gutter 経路しか対象にしていなかった）。fan-out は辺に付く全エッジ（直線・内部 L・gutter・mixed）を 1 回の分配で並べる。

## 受け入れ条件

### AC-1: 側の選択が占有と迂回長の関数である

- [x] AT-A: 1 つの target へ 5 本が集まり全て gutter を要する fixture で、経路が左右両方のガターに分かれ、貫通 0・両軸 overlap 0

  > ✅ Automated — `packages/core/src/renderer/edge-routing-groups.test.ts` › `gutter side by capacity (#2610)` › `spreads a fan-in over both gutters instead of piling it on the right`

- [x] AT-B: 両側が同じ空き・同じ距離なら右（従来の順序を保つ）

  > ✅ Automated — `packages/core/src/renderer/edge-routing-groups.test.ts` › `gutter side by capacity (#2610)` › `keeps the right gutter when both sides are equally free and equally far`

- [x] AT-C: 既存の grouped fixture の gutter 経路は、どちらの側でもコンテンツの外を通る

  > ✅ Automated — `packages/core/src/renderer/edge-routing-groups.test.ts` › `routeGroupedEdges (#1859, P2c-A)` › `reroutes cross-band edges through a side gutter (orthogonal waypoints)`

### AC-2: 決定的で、エッジの宣言順に依存しない

- [x] AT-D: 同じモデルでエッジの宣言順を逆にしても経路が完全に一致する

  > ✅ Automated — `packages/core/src/renderer/edge-routing-groups.test.ts` › `gutter side by capacity (#2610)` › `does not depend on the order the edges were declared in`

### AC-3: 既存の柵と affordance が保たれる

- [x] AT-E: examples corpus の貫通 0 / 両軸 overlap 0、grouped の固定交差数（team-ownership 3 → 2、boundary-clusters 7 → 2 に再固定。近い側を通る分だけ交差が減った）

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `shared routing chain — grouped output is unchanged (#2362, AC-5 replacement)` › `%s (group by %s): penetration 0, %i crossings`

- [x] AT-F: `[external]` のサイド配置（ADR-1728 / TPL-1761）が保たれる

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `shared routing chain — ungrouped-only affordances survive (#2362)` › `keeps [external] services in side columns (ADR-1728 / TPL-1761)`

- [x] AT-G: 一つの辺に付く全エッジ（gutter・mixed・内部 L・直線）を 1 回の fan-out で分け、同じ辺で anchor を共有しない（混雑 fixture の垂直 overlap 0）

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `crowded inter-row channel — capacity fence (#2608, TPL-2598)` › `no two vertical runs share a collinear corridor`; `packages/core/src/renderer/edge-routing-groups.test.ts` › `aggregateGroupTrunks (#1859, P2c-B)` › `fans out the source anchors of edges leaving one node, so their stubs don't overlap (#1927 source-exit)` ／ `fans out incoming edges too — a node's entry anchors don't overlap outgoing stubs (#1927 entry-side)`

### AC-4: multi-system root で左レーンが隣の system に食い込まない

- [x] AT-H: 両側のガターを要する 2 system のモデルで、各 system の経路を含む帯が重ならず、貫通 0・垂直 overlap 0

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `multi-system root view routes its edges (#2363)` › `keeps every system's routes inside its own strip, on either side (#2610)`

## 手動確認

自動テストは座標を判定できるが、「右端に寄る帯が薄くなったか」は実機でしか判定できない。到達先は公開アプリ（`https://karasu.kompiro.dev/`）。

- [ ] 🧑 Manual: `examples/en/feature-samples/team-ownership.krs` を Group by: team で開き、gutter 経路が右だけでなく近い側のガターを通っている
- [ ] 🧑 Manual: 多くのエッジが 1 つの infra に集まる drill-down で、迂回経路が左右に分かれて右端の帯が薄くなっている（外部モデルでの実測は PR 本文）
