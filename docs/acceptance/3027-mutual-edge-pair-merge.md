---
type: product
---

# AT: 両方向の edge の組を、両端に矢印のある 1 本の線で描く（#3027）

- **日付**: 2026-10-31
- **関連 Issue**: [#3027](https://github.com/kompiro/karasu/issues/3027)
- **関連 ADR**: [ADR-3022](../adr/3022-edge-label-disclosure.md)、[ADR-1185](../adr/1185-parallel-edge-bundling.md)、[ADR-2958](../adr/2958-gutter-lane-bundling.md)、[ADR-2632](../adr/2632-edge-hover-affordance.md)
- **Related TPLs**: [TPL-3027](../test-perspectives/TPL-3027-visual-merge-only-when-indistinguishable.md), [TPL-3022](../test-perspectives/TPL-3022-withheld-content-stays-reachable.md), [TPL-2174](../test-perspectives/TPL-2174-opt-in-visual-layer-is-inert-when-off.md), [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md), [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)
- **対象ファイル**: `packages/core/src/renderer/mutual-pair.ts`（`applyMutualPairs`）、`layout.ts`、`svg-renderer.ts`（`edgeLineKeyOf`）、`edge-label-disclosure.ts`（`canvasLabel` / `directionArrow`）、`edge-routing.ts`（`ownLabelSegment`）、`label-placement.ts`

> 同じ 2 枚の card の間に `A -> B` と `B -> A` があると、今日は別々の 2 本の線になる。種別と見た目が同じ組は、card を動かさずに 1 本の線で描く。共有の線を中点付近で分け、各 edge は自分の target 側の半分と矢印だけを描くので、edge は 2 本のまま残る。各ラベルの先頭には、その半分が向かう方向の矢印を付ける。

## 受け入れ条件

### AC-1: 両方向の組は 1 本の線になり、ラベルが向きを示す

- [x] AT-A: Umami fixture（`packages/core/src/renderer/fixtures/dense-domain-canvas.krs`）の `UmamiApp` drill-down で、41 本の edge が 27 本の線で描かれ、交差は 157 か所から 61 か所以下に減る。card は動かない

  > ✅ Automated — `packages/core/src/renderer/mutual-pair.test.ts` › `the dense domain canvas (Umami fixture)` › `draws 27 lines instead of 41, with every authored edge still its own LayoutEdge`、`crosses 61 times or fewer instead of 157`、`moves no card`

- [x] AT-B: 組の 2 つの半分は分け目で同じ座標を共有し、それぞれ自分の target で終わる。分け目は角と、その線の hop の隙間から離れている

  > ✅ Automated — `packages/core/src/renderer/mutual-pair.test.ts` › `the dense domain canvas (Umami fixture)` › `joins the two halves of each pair at one shared point, each ending at its own target`、`keeps every split clear of corners and of the hops on its line`、`puts each hop on the half it lies on`

- [x] AT-C: 組の各ラベルは、自分の半分の上で分け目に接しない区間に乗り、先頭にその半分の向きの矢印が付く。`data-edge-label` は書いたラベルのまま。組でない edge のラベルに矢印は付かない

  > ✅ Automated — `packages/core/src/renderer/mutual-pair.test.ts` › `labels` › `draws each label behind the arrow of its own half and keeps the authored text`。`the dense domain canvas (Umami fixture)` › `seats each label of a pair on its own half, away from the split`

- [x] AT-D: 1 本にしても、canvas に描かれずに保留されるラベルは 2 本のときより増えない

  > ✅ Automated — `packages/core/src/renderer/mutual-pair.test.ts` › `the dense domain canvas (Umami fixture)` › `leaves no more labels off the canvas than two lines did`

### AC-2: 各 edge に今日どおり届く

- [x] AT-E: 半分に hover すると、その edge が強調され、相手の半分は他の edge と同じく薄くなる

  > ✅ Automated — `packages/e2e/tests/at-3027-mutual-edge-pair-merge.spec.ts` › `AT-3027 mutual pair drawn as one line` › `hovering one half focuses its own edge and dims the other half`

- [x] AT-F: 保留したラベルは、その半分の `<title>` で全文に届く。各半分は自分の hit-line を持つ

  > ✅ Automated — `packages/core/src/renderer/mutual-pair.test.ts` › `labels` › `keeps a withheld label's full text reachable on its half`、`gives each half its own hit-line`

- [x] AT-G: 線のクリックで focus canvas が開き、両方向が 1 本ずつの lane で出る

  > ✅ Automated — `packages/app/src/components/focus-canvas/FocusCanvas.test.tsx` › `the focus canvas in the preview` › `opens on an edge click, with its two cards and every edge between them`。`packages/app/src/components/focus-canvas/build.test.ts` › `buildFocusCanvas on the dense canvas` › `draws every pair with nothing colliding, both directions on lanes of their own`

### AC-3: 読む人が区別できる組は 2 本のまま

- [x] AT-H: 種別（sync / async）・色・太さ・線種・diff state のどれかが違う組、cyclic の組、Group-by で別の band にある組は 2 本のまま描かれる

  > ✅ Automated — `packages/core/src/renderer/mutual-pair.test.ts` › `only pairs the reader cannot tell apart are merged (TPL-3027)` › `keeps a sync and an async edge as two lines`、`keeps a pair whose %s differs as two lines`、`keeps a pair whose diff states differ as two lines`、`keeps a cyclic pair (a sync cycle in one edge list) as two lines`、`keeps a pair across two Group-by bands as two lines (one runs against the flow)`

- [x] AT-I: ghost・trunk・並列の束・collapse の stub に入った edge、multi-system の root で system をまたぐ組は 1 本にしない。同じ system の中の組は 1 本にする

  > ✅ Automated — `packages/core/src/renderer/mutual-pair.test.ts` › `only pairs the reader cannot tell apart are merged (TPL-3027)` › `does not pair an edge that is %s`、`does not pair an edge to the collapse stub %s`、`does not pair when either direction has a parallel edge`、`never pairs edges across systems on the multi-system root`、`pairs within one system on the multi-system root`

### AC-4: 組の無い図と、鍵を渡さない呼び出しは変わらない

- [x] AT-J: 両方向の組が無い canvas の layout は今日と同じ。線の見た目の鍵を渡さない呼び出し（draw.io exporter）は組を 1 本にしない

  > ✅ Automated — `packages/core/src/renderer/mutual-pair.test.ts` › `only pairs the reader cannot tell apart are merged (TPL-3027)` › `lays a canvas without a pair out exactly as before`、`leaves the layout untouched without a line key (draw.io, bare layout)`

## 手動確認

- [ ] Umami fixture（`packages/core/src/renderer/fixtures/dense-domain-canvas.krs`）を `index.krs` として開き、`UmamiApp` に drill-down する。両方向の組が、両端に矢印のある 1 本の線として読める。組の各ラベルの先頭の矢印が、そのラベルの乗る半分の矢印と同じ向きを指している
