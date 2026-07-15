# AT-1954: Grouped edge の mixed channel routing — 貫通ゼロ・overlap ゼロ（system view）

- **日付**: 2026-07-15
- **Issue**: #1954（P2c #1859 / Epic #1817 comprehension）
- **PR**: (実装 — core routing)
- **設計**: [ADR-20260715-03](../adr/20260715-03-system-view-p2c-grouped-edge-routing-and-marks.md)
- **Related TPLs**: [TPL-20260711-02](../test-perspectives/TPL-20260711-02-routing-measures-crossings-and-penetrations.md)（交差＋貫通の二重計測）, [TPL-20260623-04](../test-perspectives/TPL-20260623-04-tier-split-no-edge-penetration.md)（段跨ぎ edge がカードを貫通しない）, [TPL-20260715-01](../test-perspectives/TPL-20260715-01-new-route-shape-participates-in-overlap-passes.md)（新 route 形は overlap 回避パスに参加させる）
- **対象**: `packages/core/src/renderer/edge-routing-groups.ts`

## 概要

Group by → Team の system view で、両側のガター側 stub が同 row の兄弟ノードに塞がれる edge（挟まれた infra target / actor row に塞がれた source）が直線のままノードカードを貫通していた（#1954）。塞がれた端点だけを top/bottom port で隣接空き帯（帯間チャネル）へ迂回する **mixed route** で解消し、#1927 の lane 分離・port fan-out パスを一般化して mixed route も対象にすることで、貫通ゼロと collinear overlap ゼロを同時に満たす。ungrouped（Group by: none）は不変。

## 受け入れ条件

### AC-1: 貫通ゼロ・overlap ゼロ（core, 実サンプル）

> ✅ Automated by `packages/core/src/renderer/edge-routing-groups.test.ts` (suite-wide)

- [x] `examples/en/getting-started/index.krs` を Group by team でレイアウトすると `totalPenetrations == 0`
- [x] 同 fixture で `collinearVerticalOverlaps == 0` かつ `collinearHorizontalOverlaps == 0`（素朴 channel が生む false-connection を出さない）
- [x] `straightCenterPenetrations > 0`（fixture が実際に router を駆動していることを固定）
- [x] `ECommerce → OrderEvents`（挟まれ target）と `Seller → ECommerce`（塞がれ source）が multi-waypoint の mixed route になる

### AC-2: 既存 route の回帰なし（core）

> ✅ Automated by `packages/core/src/renderer/edge-routing-groups.test.ts` (suite-wide)

- [x] 既存 2-waypoint ガター route の経路・trunk・lane・fan-out・overlap ゼロ assert がすべて不変（パス一般化の回帰柵。core 全スイート 2290 tests も無変更で通過）
- [x] `groupBy` 未指定（ungrouped）は既存 snapshot と byte 一致（AC-5）

### AC-3: 手動（描画の目視確認）

`examples/en/getting-started/index.krs` を app で開き、system view で Group by → Team に切り替える:

- [ ] `ECommerce → Order events` の線が `Notification` カードを貫通しない（枠の外を回って `Order events` の上から入る）
- [ ] `Seller → EC Site` の線が `Mobile App` を貫通しない
- [ ] どのエッジも接続していないノード／フレームを直線で突き抜けない
- [ ] 2 本の別エッジが 1 本の線に重なって見えない（別 target への線が判別できる）
- [ ] Group by を None に戻すと従来表示に戻る
