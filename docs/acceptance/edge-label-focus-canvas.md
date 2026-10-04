---
type: product
---

# AT: focus canvas（edge ラベルの段階的開示の段 3）（#3031）

- **日付**: 2026-10-04
- **関連 Issue**: [#3031](https://github.com/kompiro/karasu/issues/3031)（slice B）（親: [#3022](https://github.com/kompiro/karasu/issues/3022)）
- **Related TPLs**: [TPL-3022](../test-perspectives/TPL-3022-withheld-content-stays-reachable.md)（canvas が省略・保留したラベルの全文に、pointer が届く経路で辿り着ける）, [TPL-2048](../test-perspectives/TPL-2048-label-placement-measured-and-byte-stable.md)（衝突は数値で数える）, [TPL-1468](../test-perspectives/TPL-1468-overlay-z-index-scale.md)（overlay の重なり順は `--z-*` スケールから）
- **対象ファイル**:
  - `packages/app/src/components/focus-canvas/build.ts`（focus canvas の組み立て。純粋関数）
  - `packages/app/src/components/focus-canvas/FocusCanvas.tsx`（overlay）
  - `packages/app/src/components/focus-canvas/node-focus.ts`（card hover の dim と `Relations`）
  - `packages/app/src/components/PreviewPane.tsx`（edge クリックと overlay の配線）

> 密な canvas では、edge のラベルは省略され、重なるものは描かれない（slice A）。edge をクリックするか、card に hover して出る `⇄ Relations` を押すと、canvas の上にもう 1 枚の canvas が開き、対象の card と edge だけをラベル全文で描く。

## 受け入れ条件

### AC-1: edge をクリックすると、その組の edge が全文で開く

- [x] edge のクリックで、両端の card と、その 2 つの間の edge 全部（逆向きも）が 1 本 1 行で開く。ラベルは canvas の上限文字数にかかわらず全文

  > ✅ Automated — `packages/app/src/components/focus-canvas/FocusCanvas.test.tsx` › the focus canvas in the preview › opens on an edge click, with its two cards and every edge between them

  > ✅ Automated — `packages/e2e/tests/at-3031-focus-canvas.spec.ts` › AT-3031 focus canvas › an edge click shows the label the canvas left off, in full

- [x] クリックした向きが先頭の行になる

  > ✅ Automated — `packages/app/src/components/focus-canvas/build.test.ts` › buildFocusCanvas on the dense canvas › puts the clicked direction on the first lane

- [x] pan の終わりでは開かない

  > ✅ Automated — `packages/app/src/components/focus-canvas/FocusCanvas.test.tsx` › the focus canvas in the preview › does not open at the end of a pan

- [x] 詳細パネルを開く集約 edge は、今までどおりパネルを開く

  > ✅ Automated — `packages/app/src/components/focus-canvas/FocusCanvas.test.tsx` › the focus canvas in the preview › leaves an aggregated edge to its detail panel

### AC-2: card の hover と `Relations` で、node と接続先が開く

- [x] card に hover すると、その node に繋がらない edge が薄くなり、edge の本数を示す `⇄ Relations N` が出る。図から離れると消える

  > ✅ Automated — `packages/app/src/components/focus-canvas/FocusCanvas.test.tsx` › the focus canvas in the preview › dims the edges a hovered card does not touch, and shows how many it has

  > ✅ Automated — `packages/e2e/tests/at-3031-focus-canvas.spec.ts` › AT-3031 focus canvas › hovering a card dims its unrelated edges; Relations lists every edge it has

- [x] `Relations` を押すと、その node に出入りする edge が 1 本 1 行で開く。入る側と出る側の本数が見出しに出る

  > ✅ Automated — `packages/app/src/components/focus-canvas/FocusCanvas.test.tsx` › the focus canvas in the preview › opens a node from the Relations pill, one lane per edge

- [x] 依存する側と依存される側を分けて並べる

  > ✅ Automated — `packages/app/src/components/focus-canvas/build.test.ts` › buildFocusCanvas on the dense canvas › separates dependents from dependencies

- [x] 並べ方は preview の幅で変わらない。狭い preview では同じ絵を原寸のままスクロールし、開いたときは対象の node が見えている

  > ✅ Automated — `packages/e2e/tests/at-3031-focus-canvas.spec.ts` › AT-3031 focus canvas › a narrow preview keeps the same picture and scrolls, opening on the node

### AC-3: 何も重ならない

- [x] 41 本のラベル付き edge を持つ密な canvas で、全 node を、全 27 組を edge の focus canvas で開き、ラベル↔card、ラベル↔ラベル、線↔ラベル、線↔card の衝突が 0 件

  > ✅ Automated — `packages/app/src/components/focus-canvas/build.test.ts` › buildFocusCanvas on the dense canvas › draws every node with nothing colliding

  > ✅ Automated — `packages/app/src/components/focus-canvas/build.test.ts` › buildFocusCanvas on the dense canvas › draws every pair with nothing colliding, both directions on lanes of their own

### AC-4: 辿れて、閉じられる

- [x] focus canvas の中の card でその node へ、node の canvas の行でその組へ移り、`← Back` で戻る

  > ✅ Automated — `packages/app/src/components/focus-canvas/FocusCanvas.test.tsx` › the focus canvas in the preview › walks the graph: a card moves to that node, a lane to that pair, Back returns

- [x] `✕ Close`・Esc・背景のクリックで閉じる

  > ✅ Automated — `packages/app/src/components/focus-canvas/FocusCanvas.test.tsx` › the focus canvas in the preview › closes from Close, Esc and the backdrop

- [x] focus canvas の上のクリックは、下の図の drill-down や詳細パネルを起動しない

  > ✅ Automated — `packages/app/src/components/focus-canvas/FocusCanvas.test.tsx` › the focus canvas in the preview › keeps a press on the canvas from reaching the diagram under it

- [x] source を編集すると開いたまま追従し、対象が無くなったら閉じる

  > ✅ Automated — `packages/app/src/components/focus-canvas/FocusCanvas.test.tsx` › the focus canvas in the preview › follows the diagram, and closes when an edit removes what it shows

### AC-5: どの edge にも届く（TPL-3022）

- [x] 線をクリックできる点が無い edge も、端の node の `Relations` から全文に届く

  > ✅ Automated — `packages/e2e/tests/at-3031-focus-canvas.spec.ts` › AT-3031 focus canvas › every edge is reachable: by its own line, or from either end's Relations (TPL-3022)

## 手動確認

- [ ] 本番 app（<https://karasu.kompiro.dev/>）で、edge が十数本以上ある図を開く。card に hover して `⇄ Relations` を押し、開いた canvas のラベルが自分の線のすぐ上に読める形で並び、card と重ならないことを目で確かめる

  > 🧑 Manual — 文字幅は推定値でレイアウトしているので、実際のフォントで文字が欄からはみ出さないことは実機でしか確かめられない
