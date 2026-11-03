---
type: product
---

# AT: 置けなかったラベルの分だけ、行間のチャネルと行内の隙間を開く（#3036）

- **日付**: 2026-11-03
- **関連 Issue**: [#3036](https://github.com/kompiro/karasu/issues/3036)
- **関連 ADR**: [ADR-2598](../adr/2598-edge-routing-channel-capacity.md)、[ADR-2611](../adr/2611-layer-spanning-edge-columns.md)、[ADR-2593](../adr/2593-canvas-space-objective.md)、[ADR-3022](../adr/3022-edge-label-disclosure.md)、[ADR-3036](../adr/3036-withheld-label-room.md)
- **Related TPLs**: [TPL-3036](../test-perspectives/TPL-3036-reserved-room-kept-only-when-measured.md), [TPL-2593](../test-perspectives/TPL-2593-layout-feedback-is-floor-first-and-monotone.md), [TPL-2611](../test-perspectives/TPL-2611-feedback-key-survives-the-next-pass.md), [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)
- **対象ファイル**: `packages/core/src/renderer/label-room.ts`（`chooseLabelRoom` / `labelRoomInChannels` / `labelRoomInRows`）、`layout.ts`、`layout-reservations.ts`（`channelLanes`）、`edge-layer.ts`（`withheldLabelsOf`）、`svg-renderer.ts`

> `label-display: auto` で置けなかったラベルがある図では、幅予算の探索の後に、チャネルをラベルの高さの分だけ開く候補 A と、行内の隙間もラベルの幅の分だけ開く候補 B を配置する。置けないラベルが基準（今日の配置）より厳密に少ない候補だけを採る。

## 受け入れ条件

### AC-1: 混んだ図で置けるラベルが増える

- [x] AT-A: 密な fixture（`packages/core/src/renderer/fixtures/dense-domain-canvas.krs`）の `UmamiApp` drill-down で、41 本のラベルのうち 30 本以上が canvas に描かれる（今日は 17 本）

  > ✅ Automated — `packages/core/src/renderer/label-room.test.ts` › `the dense fixture opens room for its withheld labels (#3036)` › `seats at least 30 of its 41 labels, up from 17`

- [x] AT-B: その図では行内の隙間も開く候補 B が採られる

  > ✅ Automated — `packages/core/src/renderer/label-room.test.ts` › `the dense fixture opens room for its withheld labels (#3036)` › `keeps candidate B, which opens the gaps inside rows as well as the channels`

### AC-2: 需要の測り方

- [x] AT-C: 行内の隙間は、そこにある置けなかったラベルのうち最も幅の広いもの（+ 余白 8 px × 2）の分だけ、右側の card の前で開く。隙間の外・行の外端・card が 1 枚の行にあるラベルでは開かない。収まっている隙間も開かない

  > ✅ Automated — `packages/core/src/renderer/label-room.test.ts` › `labelRoomInRows: the widest withheld label in a gap, plus its margins` › `opens a gap before its right-hand card by what the widest label is short of`、`opens nothing for a label outside every gap between two cards of a row`、`opens nothing where the label already fits the gap`

- [x] AT-D: チャネルの需要は、x が重なるラベルの高さ（+ 余白 2 px）の合計の最大値。font size の違うラベルが重なれば合計が開き、横に並ぶラベルは高さを共有する。行の中のラベルはチャネルの需要にならない

  > ✅ Automated — `packages/core/src/renderer/label-room.test.ts` › `labelRoomInChannels: the largest sum of label heights over any x` › `stacks labels of different font sizes that overlap in x`、`lets labels side by side share the height`、`measures nothing for a label inside a row`

### AC-3: 厳密に良くなる候補だけを採る

- [x] AT-E: A、B の順に配置し、置けないラベルが最も少ないものを採る。B が A に負けるか同数なら A。どちらも基準より少なくなければ基準を返す。置けなかったラベルが無ければ候補を配置しない

  > ✅ Automated — `packages/core/src/renderer/label-room.test.ts` › `chooseLabelRoom keeps a candidate only when it seats strictly more (TPL-2593)` › `places A, then B, and keeps the one that withholds fewest`、`keeps A when B withholds more than A`、`keeps A when B only ties it`、`returns the baseline when no candidate withholds fewer than it`、`places nothing when the label pass withholds nothing`

### AC-4: 置けなかったラベルの無い図と、ラベル配置パスを渡さない呼び出しは変わらない

- [x] AT-F: ラベル配置パスが何も保留しなければ、配置はラベル配置パスを渡さないときと同じ。渡さない呼び出し（draw.io export、素の `layout()`）は候補を作らない

  > ✅ Automated — `packages/core/src/renderer/label-room.test.ts` › `the dense fixture opens room for its withheld labels (#3036)` › `a label pass that withholds nothing lays the view out exactly as without one`、`without the renderer's label pass, \`layout()\` tries no candidate`

- [x] AT-G: `examples/` の図はどれもラベルを保留しないので、出力は変わらない

  > ✅ Automated — `packages/core/src/compile/edge-label-disclosure-surfaces.test.ts` › `examples corpus: the defaults withhold nothing (#3022)` › `no example's all-views bundle carries a withheld label`

## 手動確認

- [ ] 密な fixture（`packages/core/src/renderer/fixtures/dense-domain-canvas.krs`）を `index.krs` として開き、`UmamiApp` に drill-down する。混んだ行内の隙間と行間のチャネルにラベルが描かれ、それぞれのラベルが自分の線の上に読める
