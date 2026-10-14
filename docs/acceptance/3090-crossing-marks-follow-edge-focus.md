# AT: 交差マーク（ホップ・合流の数・trunk band）をエッジの減光に追随させる

- **日付**: 2026-10-13
- **関連 Issue**: [#3090](https://github.com/kompiro/karasu/issues/3090)
- **関連 ADR**: [ADR-1859](../adr/1859-system-view-p2c-grouped-edge-routing-and-marks.md)（交差マークの導入）、[ADR-3022](../adr/3022-edge-label-disclosure.md)（node focus の減光）
- **Related TPLs**: [TPL-3090](../test-perspectives/TPL-3090-edge-decoration-follows-edge-emphasis.md)（本件で起こした retrospective TPL）、[TPL-2956](../test-perspectives/TPL-2956-regrouping-svg-elements-keeps-paint-order.md)（描画順を保つ）
- **対象ファイル**:
  - `packages/core/src/renderer/svg-renderer.ts`（`renderCrossingMarks` / `renderTrunkBands` / `continuesHopRun`）
  - `packages/core/src/renderer/crossing-marks.ts`（chip と band が運ぶエッジ）
  - `packages/app/src/components/focus-canvas/node-focus.ts`（node focus と edge hover の規則）

> 交差マークは `.krs-edge` の外の別レイヤに描かれるので、エッジを沈める規則が届かなかった。各マークに属するエッジを `data-edges` で持たせ、マークが参照するエッジに `data-edge-index` を付け、node focus（0.12）と edge hover（0.25）が無関係なエッジのマークも沈めるようにした。マークのレイヤと描画順は変えない。

## 受け入れ条件

- [x] AT-A: ホップ・合流の数・band が、それぞれ属するエッジを `data-edges` に持つ。chip と band は運ぶエッジをすべて持つ。参照されるエッジだけが同じ値の `data-edge-index` を持ち、マークの無い図では 1 つも付かない

  > ✅ Automated — `packages/core/src/renderer/svg-renderer.test.ts` › `crossing marks name their edges (#3090)` › `tags both elements of a count chip with every edge the spine carries past it`

  > ✅ Automated — `packages/core/src/renderer/svg-renderer.test.ts` › `crossing marks name their edges (#3090)` › `tags a band with every edge it carries, and keeps its 0.4 as a stroke opacity`

  > ✅ Automated — `packages/core/src/renderer/svg-renderer.test.ts` › `crossing marks name their edges (#3090)` › `gives the edges a mark names the same index, and no other edge one`

  > ✅ Automated — `packages/core/src/renderer/svg-renderer.test.ts` › `crossing marks name their edges (#3090)` › `leaves a canvas without marks byte-identical: no edge gets an index`

- [x] AT-B: 同じ stroke でも host エッジが変わればホップの `<path>` を分け、各 `<path>` は host エッジだけを持つ。描画順と幾何は変わらない（#2956 のテストがそのまま通る）

  > ✅ Automated — `packages/core/src/renderer/svg-renderer.test.ts` › `crossing hop paths (#2956)` › `starts a new <path> whenever the host edge changes, even in one stroke (#3090)`

  > ✅ Automated — `packages/core/src/renderer/svg-renderer.test.ts` › `crossing hop paths (#2956)` › `keeps every hop's geometry: the subpaths, in order, are the arcs drawn one by one`

- [x] AT-C: カードに hover すると、そのノードに触れないエッジだけに属するマークが 0.12 に沈み、触れるエッジを含むマークは 1 のまま

  > ✅ Automated — `packages/app/src/components/focus-canvas/FocusCanvas.test.tsx` › `the focus canvas in the preview` › `dims the crossing marks of the edges a hovered card does not touch, and keeps its own`

  > ✅ Automated — `packages/e2e/tests/at-3090-crossing-marks-follow-edge-focus.spec.ts` › `AT-3090 crossing marks follow the hover dim` › `hovering a card dims the marks of the edges it does not touch, to the edges' opacity`

- [x] AT-D: エッジに hover すると、ほかのエッジのマークが 0.25 に沈み、そのエッジのマークは 1 のまま。エッジから離れると戻る。canonical id の無いエッジも同じ（#2632 で発火条件を `.krs-edge` に広げた）

  > ✅ Automated — `packages/app/src/components/focus-canvas/FocusCanvas.test.tsx` › `the focus canvas in the preview` › `dims the other edges' crossing marks while an edge is hovered, and keeps its own`

  > ✅ Automated — `packages/e2e/tests/at-3090-crossing-marks-follow-edge-focus.spec.ts` › `AT-3090 crossing marks follow the hover dim` › `hovering an edge dims the other edges' marks and keeps its own`

  > ✅ Automated — `packages/app/src/components/focus-canvas/FocusCanvas.test.tsx` › `the focus canvas in the preview` › `dims the other edges' marks while an edge with no canonical id is hovered (#2632)`

## 計測（2026-10-13）

Dify モデルの全ビュー bundle（`karasu render /workspaces/dify/index.krs`）。変更前は `main` の `81161406`。

|                                                                                       | 変更前           | 変更後                               |
| ------------------------------------------------------------------------------------- | ---------------- | ------------------------------------ |
| 出力                                                                                  | 5,253,801 バイト | 5,479,086 バイト（+225,285、+4.29%） |
| `<path>` 要素                                                                         | 5,230            | 7,058                                |
| ホップの `<path>` 要素                                                                | 757              | 2,585                                |
| 最大の 1 ビュー（ホップの `<path>` 291 → 894）の表示（Chromium、20 ラウンドの中央値） | 33.3ms           | 33.5ms                               |

増分の内訳は、ホップをエッジでも区切る分が約 +108KB（+2.06%）、マークの `data-edges` が +82.7KB（+1.57%）、エッジの `data-edge-index` が +30.9KB（+0.59%）、band の `opacity` → `stroke-opacity` が +3.4KB。表示時間は 2 フレーム待ってから測ったのでフレーム単位の粒度で、その範囲では差が出なかった。

## 手動確認

N/A — 自動テストですべて覆っている（「線と同じ opacity まで沈む」は E2E が Chromium の computed opacity で判定する）
