---
id: ADR-2174
title: facet overlay — renderer に焼き、多重所属は同心リング、色は既知 facet 順
status: accepted
date: 2026-08-04
topic: renderer
depends_on: [ADR-2065, ADR-2173]
related_to: [ADR-21, ADR-832, ADR-833, ADR-999, ADR-1368, ADR-1820, ADR-1858, ADR-1974, ADR-2036]
scope:
  packages: [core, app, i18n]
assumptions:
  - "file: packages/core/src/renderer/facet-overlay.ts"
  - "symbol: packages/core/src/renderer/facet-overlay.ts :: FACET_OVERLAY_COLORS"
  - "symbol: packages/core/src/renderer/facet-overlay.ts :: resolveFacetOverlay"
  - "file: packages/core/src/compile/facet-overlay-surfaces.test.ts"
---

# ADR-2174: facet overlay — renderer に焼き、多重所属は同心リング、色は既知 facet 順

- **日付**: 2026-08-04
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#2174](https://github.com/kompiro/karasu/issues/2174)（Part B slice 2）。親 [#2160](https://github.com/kompiro/karasu/issues/2160)、program [#2065](https://github.com/kompiro/karasu/issues/2065)
  - 上位 ADR: [ADR-2065](2065-tags-and-facets.md)（register と形）、[ADR-2173](2173-facet-grammar-and-model.md)（`facetIndex` の 1:N）
  - 関連 ADR: [ADR-999](999-legend-in-use-fallback.md)（legend footer の machinery）、[ADR-833](833-diagram-legend-syntax.md)、[ADR-1858](1858-system-view-group-by-team.md) / [ADR-1974](1974-boundary-declaration-syntax.md) / [ADR-2036](2036-scoped-boundary-declaration.md)（overlay が**直交**すべき Group-by 軸）、[ADR-21](21-two-layer-rendering.md)（layout と描画の二層）、[ADR-832](832-no-runtime-authz-modeling.md)（overlay は選択状態であって `.krs` に書かない）
  - AT: [`docs/acceptance/2174-facet-overlay.md`](../acceptance/2174-facet-overlay.md)
  - 設計過程: `docs/design/facet-overlay.md`（本 ADR に昇格して削除）

## 背景

slice 1（[ADR-2173](2173-facet-grammar-and-model.md)）で文法・`facetIndex`・診断・fmt・spec が
入ったが、**描画面は空**だった。[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)
の観点では、slice 1 は「診断という効果を持つ」ことで暫定的に第 4 状態を回避しているだけで、
本来の効果（所属が図から読める）はまだ無い。本 slice がその interim-inert 状態を解消する。

## 決定

**facet overlay は renderer で SVG に焼く。多重所属は同心リングで描き、色は既知 facet 順で
割り当てる。選択はビューア状態であって `.krs` には書かない。**

## 理由

- **renderer に焼く（app の CSS 後付けではない）**: export SVG / All Layers の iframe /
  `karasu render` の静的バンドルでも overlay がそのまま残る — **見えているものを保存できる**。
  legend band は renderer にしか描けないので、ノード装飾だけ app に置くと実装が **2 箇所に分裂**
  する。VS Code preview のような別サーフェスにも自動で乗る（[TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md)）。
  代償は選択のたびの再コンパイルだが、既存の `groupBy` と同じコストである。
  `data-facet-member` 属性は**併せて出す**ので、将来 app 側でクリック連携や CSS 強調を足す道は
  塞がない（e2e の assertion 点にもなる）。
- **多重所属 = 同心リング**: bbox 基準なので形状非依存で、icon / shape 両モードで同一に効く
  （[TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md)）。所属数が増えても
  順序が保たれる。**「主 facet 1 色 + ×N バッジ」は多重所属を隠す**ので採らない — 1:N を model 層の
  原則にした設計意図（TPL-2161）に正面から反する。
- **色は既知 facet 順（宣言順 → 参照のみを辞書順で後置）の index % 8**: 選択順で割り当てると、
  途中の facet を外したときに**残りの色が動く**。色は facet の identity（「PII は teal」）なので、
  読み手が 2 枚の図を比べられなくなる。app の色ドットも同じ関数を引く（SSOT）。
- **減光の範囲を要素ごとに決める**: ノード（非メンバー）は落とす。**コンテナ枠は落とさない** —
  枠はレイアウトの読み取り基盤で、薄くすると「どこに居るか」が読めなくなり overlay の価値を下げる。
  **エッジは端点の片方でもメンバーなら通常**（「強調集合が外とどこで接しているか」が overlay の
  主用途）。**Group-by の band / frame は一切触らない** — 直交性そのもの。
  **畳み込み stub は集約元の所属の和集合**でリングを描く（[TPL-1886](../test-perspectives/TPL-1886-rekey-transform-preserves-per-element-decoration.md)
  — 明示しないと「畳んだ瞬間に overlay が消える」silent な劣化になる）。
- **legend は scope に縛られない**: 既存 legend は階層ごとに出し分けるが、overlay の legend は
  選択している限りどの階層でも出す。色の意味が読めない図を作らないため。
- **選択の鮮度**: モデルから facet が消えたら選択集合から自動的に落とす
  （[TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)）。同期ではなく
  **read 時の交差**で行い、真になりうる state を 2 つ持たない。
- **候補 0 件なら selector を描かない**: facet を使っていないモデルの toolbar は不変。Group-by
  selector が `groupByAxes.length > 0` で消えるのと同じ作法。

## 却下した案

- **app が DOM/CSS で後付けする**: 切り替えは速いが、export した SVG に overlay が乗らず、legend を
  別実装することになり、他サーフェスにも乗らない。
- **縁取りの辺ごとの色分け**: 小さいノード・icon モードで破綻し、どの色がどの facet か読めない。
- **背景色の混色**: 混色は元の色に戻せず読み取り不能。既定のノード塗り（style cascade）を壊すので
  「既定描画への影響ゼロ」とも噛み合わない。
- **`LayoutNode.facets` を足して layout に運ばせる**: ノード構築点が logical / deploy / org / ghost に
  分かれており、足し忘れが起きやすい。代わりに `RenderOptions.facetOverlay` に**解決結果**を渡し、
  renderer は node id で引く（`boundaryIndex` と同じ既存作法）。畳み込みの fold だけは layout 側でしか
  作れないので `LayoutResult.foldedFacetMembership` で返す（`foldedEdgeDiffState` と同型）。
- **選択を URL hash / share bundle に永続化する**: `groupBy` も未対応で、範囲を広げると #1094 の
  hash 仕様と交差する。

## 波及

- **opt-in の inert 性が新しい観点になった** — [TPL-2174](../test-perspectives/TPL-2174-opt-in-visual-layer-is-inert-when-off.md)
  （opt-in な視覚レイヤは無効時に自分のマーカーを 1 つも出さない。等値テストは無条件出力を相殺して
  見逃すので、マーカーを名前で列挙して不在を assert する）。
- **全サーフェス parity を機械で確認する必要があった** — `facet-overlay-surfaces.test.ts` が
  実装漏れ（`buildDrillDownSvg` / `buildAllViewsSvg` が引数を受け取るだけで読んでいなかった）を
  実際に検出した（TPL-219 / TPL-1983）。
- deploy view / org view は対象外。deploy unit・`team` / `member` は `facets` を受理しない kind なので、
  渡っても該当ノードが 0 件になる。
- CLI `karasu render` にフラグは足さない（overlay は読み手の一時的な選択であり、静的レンダリングの
  引数として持たせるかは実利用の要求が出てから決める）。
