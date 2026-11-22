---
type: product
---

# AT: 帯の線は焦点の線のラベルの文字を横切らない（#3889）

- **日付**: 2026-11-22
- **関連 Issue**: [#3889](https://github.com/kompiro/karasu/issues/3889)（[#2823](https://github.com/kompiro/karasu/issues/2823) のスライス B が作った欠陥）
- **関連 ADR**: [ADR-2823](../adr/2823-ghost-band-layout.md)
- **Related TPLs**: [TPL-2823](../test-perspectives/TPL-2823-late-placed-elements-reach-shared-layout.md), [TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)
- **対象ファイル**: `packages/core/src/renderer/band-routing.ts`, `packages/core/src/renderer/band-phase.ts`, `packages/core/src/renderer/layout.ts`, `packages/core/src/renderer/edge-layer.ts`

> 帯の線は焦点の線の後に配線され、焦点の線のラベルを障害物にしていなかったので、
> ラベルの文字を横切ることがあった（AT-3881 のモデルで「ships to」の線が「has」を通る）。
> 帯の線は焦点の線のラベルの障害物にならない（ghost の線は本物のラベルを押しのけない、#2360）ので、
> 帯の段の前に焦点の線だけで（平行な束と相互の対も描くとおりにして）ラベルの箱を求め、帯の線のうち箱を横切る縦横の区間を、レーン幅か箱の端の外までずらす。
> 端点の区間は、カードの輪郭が箱そのものの辺（chrome の場所を除く）に限って、接続点ごとずらす。
> 帯の線が相互の対の分け目の近くを横切ると対の分け目が動き、そのラベルも動くので、その対のラベルはこの限りでない。

## 受け入れ条件

### AC-1: 帯の線は焦点の線のラベルを横切らない

- [ ] AT-1: AT-3881 のモデルの `Shop › Commerce › Ordering` のエンティティビューで、焦点の線のラベル（has、holds）を帯の線が横切らない。帯の線はカードと、端点を持たない帯の枠を横切らず、ほかの線と同じ区間を走らない

  > ✅ Automated — `packages/core/src/renderer/ghost-band-routing.test.ts` › `ghost band routing off the canvas's labels (#3889)` › `runs no band line through a label the canvas draws`
  >
  > ✅ Automated — `packages/core/src/renderer/ghost-band-routing.test.ts` › `ghost band routing off the canvas's labels (#3889)` › `still crosses no card and no band frame that holds neither end`

### AC-2: 焦点のラベルは動かない

- [ ] AT-2: AT-3881 のモデルで、焦点の線のラベルの位置は、帯の線があっても無くても同じ

  > ✅ Automated — `packages/core/src/renderer/ghost-band-routing.test.ts` › `ghost band routing off the canvas's labels (#3889)` › `leaves the canvas's labels where they are without the band's edges`

### AC-3: 帯の線が避ける箱は、描かれるラベルの箱と同じ

- [ ] AT-3: 帯の段に渡す焦点のラベルの箱は、描かれる焦点のラベルの箱と同じ。Order から Line item への線を 2 本にして平行な束にし、ラベルが束の上で 1/3 と 2/3 にずれても同じ

  > ✅ Automated — `packages/core/src/renderer/ghost-band-routing.test.ts` › `ghost band routing off the canvas's labels (#3889)` › `hands the band phase the label boxes the canvas draws, a parallel bundle's included`
