---
type: product
---

# AT: ずらしたエッジラベルを枠の線の上・向こう側に置かない（#3155）

- **日付**: 2026-10-22
- **関連 Issue**: [#3155](https://github.com/kompiro/karasu/issues/3155)
- **関連 ADR**: [ADR-2048](../adr/2048-edge-label-collision-avoidance.md)、[ADR-2360](../adr/2360-label-placement-line-obstacles.md)、[ADR-3022](../adr/3022-edge-label-disclosure.md)、[ADR-3132](../adr/3132-frame-bounded-channels.md)
- **Related TPLs**: [TPL-2048](../test-perspectives/TPL-2048-label-placement-measured-and-byte-stable.md), [TPL-3132](../test-perspectives/TPL-3132-resource-inside-a-frame-measured-against-the-frame.md), [TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)
- **対象ファイル**: `packages/core/src/renderer/label-placement.ts`（`frameBorder` / `countLabelFrameCrossings` / `resolveLabelPlacements`）、`packages/core/src/renderer/frame-geometry.ts`（`drawnFrame` / `rectUnionOutline`）、`packages/core/src/renderer/svg-renderer.ts`

> ラベルの衝突回避はカード・他のラベル・他エッジの線を避けていたが、枠（ドリルダウンの枠、team / boundary の group 枠）の線を見ていなかった。そのため、混んだ場所からずらしたラベルが枠の線の上や枠の外に描かれた。ずらす先の候補は、既定位置と同じ側に収まり、枠の線に掛からないものに限る。

## 受け入れ条件

### AC-1: ずらしたラベルが枠の線を越えない

- [x] AT-A: 既定位置が枠の内側のラベルは、最も近い空きが枠の線の向こうにあっても、枠の内側の空きへずらされる

  > ✅ Automated — `packages/core/src/renderer/label-placement.test.ts` › `frame borders as placement obstacles (#3155)` › `keeps a nudged label inside the frame it starts in`

- [x] AT-B: 既定位置が枠の外のラベル（自分の線が枠の外を通る）は、枠の内側へ引き込まれない

  > ✅ Automated — `packages/core/src/renderer/label-placement.test.ts` › `frame borders as placement obstacles (#3155)` › `keeps a label that starts outside a frame outside it`

- [x] AT-C: 既定位置で枠の線に掛かっているラベルは、箱の中心がある側へ線から外される。中心がちょうど枠の線上にあるときは内側として扱う

  > ✅ Automated — `packages/core/src/renderer/label-placement.test.ts` › `frame borders as placement obstacles (#3155)` › `moves a label whose default box straddles a border off it, to the side most of it is on`
  >
  > ✅ Automated — `packages/core/src/renderer/label-placement.test.ts` › `frame borders as placement obstacles (#3155)` › `treats a default box centred exactly on the border as inside, and moves it in`

- [x] AT-D: `label-display: auto` で、同じ側に空きが無いラベルは canvas から外される（枠の外には描かない）

  > ✅ Automated — `packages/core/src/renderer/label-placement.test.ts` › `frame borders as placement obstacles (#3155)` › `under \`auto\`, defers a label whose only clear seat is across the border`

- [x] AT-E: 広げた枠（L 字の boundary 枠）は描かれた外形で測り、外接矩形の欠けた部分は枠の外として扱う

  > ✅ Automated — `packages/core/src/renderer/label-placement.test.ts` › `frame borders as placement obstacles (#3155)` › `frameBorder traces the widened outline and reads its pieces, not the bounding box`

- [x] AT-J: 作者が `label-position` / `label-offset` で置いたラベルは、枠の線上にあっても動かさず、枠を越えるラベルの数にも入れない

  > ✅ Automated — `packages/core/src/renderer/label-placement.test.ts` › `frame borders as placement obstacles (#3155)` › `leaves an author-positioned label on a border where the author put it`

- [x] AT-K: 太い枠の線は、探索の端の候補の角にしか届かない場合でも避ける

  > ✅ Automated — `packages/core/src/renderer/label-placement.test.ts` › `frame borders as placement obstacles (#3155)` › `reaches a thick border that only a diagonal candidate's grown corner touches`

### AC-2: 他の衝突と交換しない・衝突の無い図は変わらない

- [x] AT-F: 実サンプル（hr-tool の `Auth` ドリルダウン、team-ownership の team グルーピング）で、枠を越えるラベルが 0 になり、カード・ラベル・他エッジの線との衝突も 0 のまま

  > ✅ Automated — `packages/core/src/renderer/label-placement.test.ts` › `real sample fence: frames (#3155)` › `hr-tool Auth drill-down: labels stay inside the drill-down frame`
  >
  > ✅ Automated — `packages/core/src/renderer/label-placement.test.ts` › `real sample fence: frames (#3155)` › `team-ownership top view grouped by team: labels stay off the team frames`

- [x] AT-G: renderer は枠を考慮した位置にラベルを描く

  > ✅ Automated — `packages/core/src/renderer/label-placement.test.ts` › `real sample fence: frames (#3155)` › `the renderer draws the labels where the frame-aware pass put them`

- [x] AT-H: 枠の線から離れたラベルは動かない。枠の線は「どのエッジのラベルか」の判定（曖昧さ）に使わない

  > ✅ Automated — `packages/core/src/renderer/label-placement.test.ts` › `frame borders as placement obstacles (#3155)` › `leaves a label clear of every border where it is (byte-stable)`
  >
  > ✅ Automated — `packages/core/src/renderer/label-placement.test.ts` › `frame borders as placement obstacles (#3155)` › `never takes a frame border for the edge a label belongs to (ambiguity reads edges only)`

- [x] AT-I: core の既存テスト（SVG 文字列の検証と label placement の柵を含む）が期待値を変えずに通る

  > ✅ Automated — `pnpm --filter @karasu-tools/core test`

## 手動確認

N/A — 自動テストですべて覆っている。
