---
type: product
---

# AT-2632: 描かれた全エッジに hover affordance を付ける

- **日付**: 2026-10-13
- **関連 Issue**: [#2632](https://github.com/kompiro/karasu/issues/2632)
- **Related TPLs**: [TPL-2632](../test-perspectives/TPL-2632-viewer-affordance-not-gated-on-author-identity.md)（本件で起こした retrospective TPL）、[TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md)、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)
- **対象ファイル**:
  - `packages/core/src/renderer/edge-routing.ts`（hit-line を全エッジに描く）
  - `packages/app/src/styles/components/preview.css`（hover 強調・peer の減光・ghost group の持ち上げ）
  - `packages/app/src/components/focus-canvas/node-focus.ts`（edge hover でマークを沈める条件）

> hover の強調と peer の減光（[AT-1186](1186-edge-hover-highlight-dim.md)）は canonical id を持つエッジにしか効かなかった。deploy view のエッジ・base が衝突して id を失ったエッジ・ghost 縮約のエッジは反応しなかった。hover と hit は描かれた全エッジに付け、右クリックの direction menu は従来どおり addressable なエッジに限る。

## 受け入れ条件

- [x] AT-A: どの表示面でも、描かれた全エッジが透明な hit-line を 1 本持つ。`krs-edge--interactive`（右クリックの予告）は `data-edge-canonical-id` を持つエッジにだけ付く

  > ✅ Automated — `packages/core/src/renderer/edge-affordance-parity.test.ts` › `$name (#2632)` › `gives every drawn edge exactly one hit-line, with or without a canonical id`

  > ✅ Automated — `packages/core/src/renderer/edge-affordance-parity.test.ts` › `$name (#2632)` › `advertises the right-click menu exactly where the edge is addressable`

  > ✅ Automated — `packages/core/src/renderer/edge-affordance-parity.test.ts` › `the corpus reaches the edges this fix is for (#2632)` › `the deploy view draws edges, none of them addressable`

- [x] AT-B: deploy view のエッジに hover すると、そのエッジが太く明るくなって実効 opacity 1 になり、ほかのエッジは 0.25 に沈む（system view と同じ）。ポインタを外すと deploy view の 0.3 に戻る

  > ✅ Automated — `packages/e2e/tests/at-2632-deploy-edge-hover.spec.ts` › `AT-2632 every drawn edge is hoverable` › `AT-A: a deploy edge highlights on hover and dims its peers, as in the system view`

- [x] AT-C: canonical id を持たないエッジでも、hover で peer が沈み、交差マークもほかのエッジの分が沈む

  > ✅ Automated — `packages/e2e/tests/at-2632-deploy-edge-hover.spec.ts` › `AT-2632 every drawn edge is hoverable` › `AT-C: an edge that lost its canonical id dims its peers on hover`

  > ✅ Automated — `packages/app/src/components/focus-canvas/FocusCanvas.test.tsx` › `the focus canvas in the preview` › `dims the other edges' marks while an edge with no canonical id is hovered (#2632)`

- [x] AT-D: ホップのために `<path>` で描かれたエッジも、hover で太くなる

  > ✅ Automated — `packages/e2e/tests/at-2632-deploy-edge-hover.spec.ts` › `AT-2632 every drawn edge is hoverable` › `AT-D: an edge drawn as a gapped <path> for its hop marks thickens on hover`

- [x] AT-E: canonical id を持たないエッジを右クリックしても direction menu は開かず、ブラウザ既定のメニューを止めない。deploy エッジも同じ

  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › `PreviewPane` › `an edge without a canonical id (#2632)` › `opens no menu on right-click and leaves the browser's own menu alone`

  > ✅ Automated — `packages/e2e/tests/at-2632-deploy-edge-hover.spec.ts` › `AT-2632 every drawn edge is hoverable` › `AT-B: right-clicking a deploy edge opens no direction menu`

- [x] AT-F: canonical id を持たないエッジを（移動なしで）クリックすると、両端のカードがあれば focus canvas が開き、無ければ開いている detail panel を閉じるだけになる。description や link を持つなら、従来どおり detail panel が開く

  > ✅ Automated — `packages/app/src/components/focus-canvas/FocusCanvas.test.tsx` › `the focus canvas in the preview` › `opens on an edge that has no canonical id, from its hit-line (#2632)`

  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › `PreviewPane` › `an edge without a canonical id (#2632)` › `closes an open detail panel on a click, as a click off any node does`

  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › `PreviewPane` › `an edge without a canonical id (#2632)` › `still opens its detail panel when it carries a description (#2543)`

## 手動確認

- [ ] AT-G（manual）: エッジの多い図（examples の `feature-samples` など）を開き、ポインタでキャンバスをなぞる・パンするときに、hover 対象が増えたことで減光が明滅して読みにくくならないかを目で確かめる
  > 🧑 Manual — 体感の評価。到達先: https://karasu.kompiro.dev/
