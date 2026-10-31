---
id: ADR-3090
title: 交差マーク（ホップ・junction chip・trunk band）をエッジの減光に追随させる
status: accepted
date: 2026-10-13
topic: renderer
refines: [ADR-2956]
related_to: [ADR-1859, ADR-2631, ADR-3022]
scope:
  packages:
    - core
    - app
assumptions:
  - "symbol: packages/core/src/renderer/crossing-marks-svg.ts :: continuesHopRun"
  - "symbol: packages/core/src/renderer/crossing-marks-svg.ts :: renderTrunkBands"
  - "grep: packages/core/src/renderer/crossing-marks-svg.ts :: data-edges"
  - "grep: packages/core/src/renderer/edge-routing.ts :: data-edge-index"
  - "grep: packages/core/src/renderer/crossing-marks-svg.ts :: stroke-opacity"
  - "symbol: packages/app/src/components/focus-canvas/node-focus.ts :: EDGE_HOVER_TRIGGER"
  - "grep: packages/app/src/styles/components/preview.css :: EDGE_HOVER_TRIGGER"
  - "file: packages/e2e/tests/at-3090-crossing-marks-follow-edge-focus.spec.ts"
  - "file: docs/acceptance/3090-crossing-marks-follow-edge-focus.md"
  - "file: docs/test-perspectives/TPL-3090-edge-decoration-follows-edge-emphasis.md"
---

# ADR-3090: 交差マーク（ホップ・junction chip・trunk band）をエッジの減光に追随させる

- **日付**: 2026-10-13
- **ステータス**: 決定済み
- **関連**:
  - Issue #3090（起点）、設計 PR #3150（本 ADR に集約し削除: `docs/design/crossing-marks-follow-edge-focus.md`）、実装 PR #3158
  - [ADR-2956](2956-hop-path-grouping.md)（ホップを同じ stroke の連続区間ごとに 1 本の `<path>` にまとめる。本 ADR はその区切りのキーに「同じエッジ」を足す。ADR-2956 が見送った案3）、[ADR-1859](1859-system-view-p2c-grouped-edge-routing-and-marks.md)（交差マークの導入。ホップは host エッジの線の隙間を弧で橋渡しする）、[ADR-2631](2631-trunk-legibility-by-count.md)（band と junction chip の数）、[ADR-3022](3022-edge-label-disclosure.md)（node focus の減光）
  - 関連設計: `docs/design/edge-hover-affordance.md`（#2632。edge hover の発火条件を広げる予定）
  - TPL: [TPL-3090](../test-perspectives/TPL-3090-edge-decoration-follows-edge-emphasis.md)（実装 PR で起こした retrospective TPL）、[TPL-2956](../test-perspectives/TPL-2956-regrouping-svg-elements-keeps-paint-order.md)（描画順を保つ）、[TPL-2631](../test-perspectives/TPL-2631-decoration-must-not-hide-a-crossing-mark.md)、[TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md)
  - AT: `docs/acceptance/3090-crossing-marks-follow-edge-focus.md`
  - spike: `spike/3090-mark-edge-tag-size`（core 側の試作と Dify での計測。マージしない。最終 commit は `2823ff81cff8c3264185a22280a1738954bc633d`）
  - 後続 Issue: #3157（facet overlay と diff モードの減光が交差マークを沈めない）
  - コード: `packages/core/src/renderer/crossing-marks-svg.ts`（`renderCrossingMarks` / `continuesHopRun` / `renderTrunkBands`）、`packages/core/src/renderer/crossing-marks.ts`、`packages/app/src/components/focus-canvas/node-focus.ts`（`EDGE_HOVER_TRIGGER`）、`packages/app/src/styles/components/preview.css`

## 背景

カードに hover すると、そのノードに触れないエッジが 0.12 に沈む（#3031）。interactive なエッジに hover すると、ほかのエッジが 0.25 に沈む（#1186）。どちらの場合も、**交差ホップ（◠）、junction chip（`2` / `3` の丸）、trunk band は明るいまま残っていた**。Dify の Knowledge ドメインのような密な図では、線は沈むのに数十個の弧が明るく残って無関係なエッジの経路をなぞり続け、焦点のノードに属しているように読めた。

原因は 2 つあった。

1. 減光の規則が `.krs-edge` しか選ばない。交差マークは `.krs-edge` の外の別レイヤ（`g.crossing-marks` と `g.trunk-bands`）に描かれる。
2. 交差マークがエッジの識別を持たない。さらに ADR-2956 は、**別のエッジ**のホップでも stroke が同じで連続していれば 1 本の `<path>` にまとめるので、弧をエッジごとに見分けられなかった。

当時の構造は次のとおり。

| 観点 | 当時 |
| --- | --- |
| ホップ | `marks.hops` の順に、stroke が同じ連続区間を 1 本の `<path>` にまとめる（ADR-2956）。区切りのキーは `continuesHopRun`。`HopMark.edge` は host エッジの index（`LayoutResult.edges` の添字） |
| junction chip | `<circle>` + `<text>`。`JunctionMark.edge` は合流する stub エッジ 1 本だけで、chip が表す `count` 本のエッジの一覧は持たない |
| trunk band | `<polyline>` 1 本。`TrunkBand.edge` は運ぶエッジの先頭 1 本だけ（色を借りるため）。透明度は `opacity="0.4"` |
| エッジのグループ | `<g class="krs-edge" data-edge-from data-edge-to …>`。描画上の index を持たない |
| node focus の減光 | `node-focus.ts` が `<style>` に `${scope} .krs-edge:not(<mine>){opacity:0.12 !important}` を書く |
| edge hover の減光 | `preview.css` の `svg:has(.krs-edge--interactive:hover) .krs-edge:not(:hover){opacity:0.25 !important}`。CSS だけで完結 |

## 決定

交差マークに、それが属するエッジの描画上の index を持たせ（`data-edges`）、node focus と edge hover の減光を、`node-focus.ts` が書く `<style>` で交差マークにも適用する。

- **識別**: 交差マークが参照するエッジのグループに `data-edge-index="N"` を、ホップ・junction chip（`<circle>` と `<text>` の両方）・trunk band に `data-edges="N M …"`（空白区切り）を付ける。N は `LayoutResult.edges` の添字で、1 枚の SVG の中でだけ通じればよい。core の `JunctionMark` と `TrunkBand` は運ぶ全エッジの `edges: number[]` を持つ（色を借りる `edge` はそのまま）。どのマークも参照しないエッジには index を付けないので、交差マークを持たない図の出力は変わらない。
- **ホップの区切り**: `continuesHopRun` に「同じエッジ」の条件を足し、1 本の `<path>` は 1 本のエッジのホップだけを持つ（ADR-2956 の案3）。描画順と幾何は変えない（TPL-2956）。
- **減光の規則**:
  - node focus: 焦点のノードに触れるエッジの index を集め、それを 1 つも含まない交差マーク（`[data-edges]:not(:is([data-edges~="3"],…))`）を 0.12 に沈める。index が 1 つも無ければ交差マークをすべて沈める。
  - edge hover: `node-focus.ts` の `mouseover` が、hover された interactive なエッジの index を含まない交差マークを 0.25 に沈める規則を同じ `<style>` に書く。エッジ本体の減光は `preview.css` のまま。発火条件は定数 `EDGE_HOVER_TRIGGER` 1 つにし、`preview.css` の規則のコメントがそれを参照する。
  - 複数のエッジを運ぶ chip と band は、運ぶエッジのどれか 1 本が焦点なら明るいまま残す。焦点の経路の一部だからである。
  - 交差マークにもエッジと同じ `transition: opacity 0.15s ease` を付け、線と弧が同じ速さで沈む。
- **band の透明度**: `opacity="0.4"` を `stroke-opacity="0.4"` に移す。CSS の `opacity` は presentation 属性の `opacity` を置き換えるので、そのままでは沈めても 0.4 が 0.12 に変わるだけで線ほど沈まない。`stroke-opacity` なら CSS の `opacity` と掛け合わされる。fill の無い 1 本の polyline なので見た目は変わらない。

## 理由

- **エッジ 1 本を一意に指せる形が index しか無い。** edge hover では、同じ `(from, to)` の平行エッジのうち hover していない方のホップを沈める必要がある。from / to はそれを区別できず、canonical id は interactive なエッジしか持たない。index は値も短く、複数のエッジを運ぶ band / chip でも `~=` で 1 本ずつ照合できる。
- **edge hover の照合は CSS だけでは書けない。** CSS は hover されたエッジの属性値を別の要素の属性と照合できない。エッジ 1 本ごとの規則を出力 SVG に生成すれば書けるが、Dify 全ビューで千個を超え（+100KB 超）、アプリの振る舞いを静的出力に持ち込む。node focus と同じ JS の `<style>` に乗せれば、SVG の DOM に触れず、図の再挿入でも壊れない（AT-1186 AT-D）。
- **出力の増分を、焦点の効果が半分しか効かない状態を直す代償として受け入れた。** 実装後の計測（Dify 全ビュー、`karasu render`）:

  | | before（`81161406`） | after |
  | --- | --- | --- |
  | 出力 | 5,253,801 B | 5,479,086 B（**+4.29%**） |
  | `<path>` 要素 | 5,230 | 7,058 |
  | ホップの `<path>` 要素 | 757 | 2,585 |
  | 最大のビューの表示（Chromium、20 回の中央値） | 33.3 ms | 33.5 ms |

  内訳はホップをエッジでも区切る分 +2.06%（ADR-2956 の見積もりどおり）、`data-edges` +1.57%、`data-edge-index` +0.59%、`stroke-opacity` +0.06%。ADR-2956 で減らした分（−25.6%）の 6 分の 1 程度を戻す。表示時間は 2 フレーム待つ計測なのでフレーム単位の粒度で、その粒度では差が出なかった。
- **柵が修正を外すと落ちる。** core の単体テスト（`svg-renderer.test.ts`「crossing marks name their edges (#3090)」）がホップの区切りと `data-edges` の値を、app のテスト（`FocusCanvas.test.tsx`）が書かれた規則が無関係なマークだけを選ぶことを、Playwright の `at-3090-…` が Chromium の computed opacity（無関係なマークは 0.12 / 0.25、焦点のエッジのマークは 1）を確かめる。マークの規則を外すと app のテストと e2e の両方が落ちる。

## 却下した案

- **識別に `data-edge-from` / `data-edge-to` を写す。** node focus は既存の `<mine>` を当てるだけで済み、エッジ側の属性も要らない。しかし平行エッジを区別できないので、edge hover で hover していない平行エッジのホップまで明るく残る。band / chip では from / to をそれぞれ一覧にする必要があり、どの from とどの to が組かも失われる。値がノードのパスなので長い。
- **識別に canonical id を写す。** canonical id を持つのは interactive なエッジだけで、node focus が沈めたいエッジの多くは持たない。
- **edge hover の減光を CSS だけで書く。** 上の理由のとおり、エッジ 1 本ごとの規則を出力 SVG に生成するしかなく、Dify 全ビューで +100KB 超になり、アプリの振る舞いを静的出力に持ち込む。
- **ホップのまとめ方は ADR-2956 のまま、`<path>` に区間内の全エッジを付ける。** 焦点のエッジのホップと無関係なエッジのホップが同じ `<path>` に入ると、まとめて明るく残る。症状が一部残る。

## 影響

- 交差マークを持つ図の SVG に属性が増え、ホップの `<path>` が増える。見た目は変わらない（band の `stroke-opacity` も含む）。アプリでは hover の焦点が交差マークにも効く。
- edge hover の減光は CSS（エッジ本体）と JS（交差マーク）の 2 箇所に分かれる。#2632 で発火条件を `.krs-edge--interactive` から広げるときは `EDGE_HOVER_TRIGGER` と `preview.css` の規則を一緒に変える。
- 対象外: focus canvas（独自の SVG を組み、交差マークを描かない）と VS Code webview（`.krs-edge` の hover 規則を持たない）。facet overlay と diff モードの減光も同じ種類の取りこぼしを持つが、発火の仕組みが別なので #3157 に分けた。本 ADR の `data-edges` があれば、renderer 側で「運ぶエッジがすべて沈んでいるマークを沈める」と書ける。
- `docs/spec/` の変更は無い（交差マークの要素構造は仕様として公開していない）。
