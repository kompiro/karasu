# AT-1983: boundary grouping の drill-down ビュー拡張（正規化）

- **日付**: 2026-07-16
- **Issue**: #1983（parent: #1822 comprehension、follow-up to #1974 P2b）
- **PR**: (この PR)
- **関連 ADR**: [ADR-20260711-03](../adr/20260711-03-system-view-group-by-team.md)（P2a — 決定 7 の root-only を軸非依存のレベル交差へ一般化）、[ADR-20260715-03](../adr/20260715-03-system-view-p2c-grouped-edge-routing-and-marks.md)（P2c routing/marks）、[ADR-20260630-02](../adr/20260630-02-layer-toggles.md)（interactive collapse コントロールの gate）
- **設計**: [boundary-drilldown-grouping.md](../design/boundary-drilldown-grouping.md)
- **Related TPLs**:
  - [TPL-20260716-02](../test-perspectives/TPL-20260716-02-view-state-gate-parity-across-surfaces.md)（view-state gate の全 surface parity — 本件の失敗クラス）
  - [TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md)（全域性・端点保持）
  - [TPL-20260711-02](../test-perspectives/TPL-20260711-02-routing-measures-crossings-and-penetrations.md)（crossings + penetrations の両計測）
  - [TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md)（ghost は視野外の文脈 — 枠に入れない）
- **対象**: `packages/core/src/renderer/{drill-down-svg,all-layers-svg}.ts`（export gate 緩和）、`packages/core/src/index.ts` + `packages/app/src/hooks/useViewSvg.ts`（entity view への `groupBy` 配線）

## 概要

グルーピング（Group by: boundary / team）を「軸 index と、いま描画しているレベルに描画される
ノード集合の交差」として正規化した（#1983）。interactive preview では P2a 以来 drill レベルでも
効いていた挙動を仕様として認め、静的 export（Show All Layers / drill-down / Open All Views）の
root-only gate（#1879）を撤去して全 surface の parity を回復し、entity view に `groupBy` を配線した。

フレームの有無・membership・member 不在レベルの byte 不変・ghost 除外・collapse round-trip・
P2c penetrations = 0 は `packages/core/src/renderer/group-by-drilldown-render.test.ts` ほかで
自動化済み。本 AT は**配置が読めるか**の目視判断のみを扱う。

## 受け入れ条件

### AC-1: drill レベルのフレームと P2c routing が視覚的に破綻しない

- [ ] **手動**: drill member を含む boundary の examples（`examples/en/feature-samples/boundary-clusters.krs`）を
      app で開き、Group by: **Boundary** のまま service へ drill → nested domain 群に枠が出て、
      **配置が読める**（枠・ghost・エッジが視覚的に破綻しない — P2c が drill で発火した結果の目視）。
      domain へさらに drill しても同様。

### AC-2: drill ビューでの collapse round-trip と breadcrumb 復帰

- [ ] **手動**: drill ビューで枠の ⊖ → member だけが `<Boundary> (N)` stub に畳まれ、ghost と
      non-member が残る。⊕ で戻る。breadcrumb で root へ戻っても Group-by 状態が破綻しない。

### AC-3: entity view のフレームと FK エッジの両立

- [ ] **手動**: entity view（本 PR の新規配線面）で entity member に枠が出て、FK エッジ表示と
      両立して読める（collapse ⊖ コントロールは**出ないのが正** — `interactive` を渡さない設計、
      ADR-20260630-02）。

### AC-4: 静的 export の各レベル band が 1 枚の SVG として読める

- [ ] **手動**: Show All Layers / Open All Views の export で、各レベル band に枠が出た出力が
      1 枚の SVG として読める（band 間で枠が視覚的に混線しない）。
