---
id: ADR-1983
title: boundary grouping の drill-down 拡張 — 描画レベルとの交差による正規化
status: accepted
date: 2026-07-17
topic: renderer
related_to: [ADR-1858, ADR-1820, ADR-1884, ADR-1821, ADR-1513, ADR-1859, ADR-1886, ADR-1815]
assumptions:
  - "symbol: packages/core/src/renderer/drill-down-svg.ts :: buildAllViewsSvg"
  - "symbol: packages/core/src/renderer/all-layers-svg.ts :: buildAllLayersSvg"
  - "symbol: packages/core/src/index.ts :: renderEntityView"
  - "file: packages/core/src/renderer/group-by-drilldown-render.test.ts"
---

# ADR-1983: boundary grouping の drill-down 拡張 — 描画レベルとの交差による正規化

- **日付**: 2026-07-17
- **ステータス**: 決定済み
- **関連**:
  - Issue: [#1983](https://github.com/kompiro/karasu/issues/1983)（parent [#1822](https://github.com/kompiro/karasu/issues/1822) comprehension、follow-up to [#1974](https://github.com/kompiro/karasu/issues/1974) P2b）、経緯 [#1879](https://github.com/kompiro/karasu/issues/1879)（export の root-only gate の出所）
  - 実装 PR: [#2034](https://github.com/kompiro/karasu/pull/2034)（設計 PR [#2013](https://github.com/kompiro/karasu/pull/2013)）
  - ADR: [ADR-1858](1858-system-view-group-by-team.md)（P2a team 軸 — 決定 7 の root-only を本 ADR が一般化）、[ADR-1820](1820-notation-promotion-gate.md)（notation promotion gate）、[ADR-1884](1884-group-by-team-multi-system-root-per-system-frames.md)（同一ラベル・disjoint フレームの先例）、[ADR-1821](1821-layer-toggles.md)（interactive collapse コントロールの gate — entity view の frames-only 挙動の根拠）、[ADR-1513](1513-legend-drill-down-scope.md)（per-drill-depth exact-match の先例）、[ADR-1859](1859-system-view-p2c-grouped-edge-routing-and-marks.md)（P2c routing/marks）、[ADR-1886](1886-group-by-diff-removed-node-placement-and-aggregated-edge-state.md)（diff-mode）
  - AT: [1983-boundary-drilldown-grouping.md](../acceptance/1983-boundary-drilldown-grouping.md)、[1879-group-by-frames-in-exports.md](../acceptance/1879-group-by-frames-in-exports.md)
  - TPL: [TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md)（view-state gate の全 surface parity — 本件の proactive TPL）、[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)、[TPL-1738](../test-perspectives/TPL-1738-relayout-into-group-preserves-placement-and-edges.md)、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)
  - follow-up: [#2036](https://github.com/kompiro/karasu/issues/2036)（id 衝突下の contains 曖昧性）、[#2032](https://github.com/kompiro/karasu/issues/2032)（cross-file contains の偽 not-found）

## 背景

P2b（[#1974](https://github.com/kompiro/karasu/issues/1974)）で導入した `boundary` は、`contains` に宣言済みの任意 id を kind 制限なく受理する。しかし当初は **system view のトップ階層に描画されるノードだけ**がグルーピングの効果を持ち、service 配下の nested `domain`・`usecase`・`entity` など **drill-down ビューにしか描画されない member** は、フレームにも入らず警告も出なかった（[#1983](https://github.com/kompiro/karasu/issues/1983) の当初報告）。

実測（compile probe）で前提が覆った。実態は「drill-down では効かない」ではなく、**surface 間で挙動が割れている**ことが判明した:

- **interactive preview**（app の `compile()` + `viewPath`）では、P2a 以来 **drill レベルでも既にグルーピングが効いていた**（フレーム描画・collapse とも）。ただし未仕様・専用テストなし。
- **静的 export**（`buildDrillDownSvg` / `buildAllLayersSvg` / `buildAllViewsSvg`）だけが root のみ。`legendScopeForLogicalSlice(slice) === "system" ? groupBy : undefined` の gate が 3 builder に複製されていた（[#1879](https://github.com/kompiro/karasu/issues/1879) 由来。当時は team 軸のみで「drill-down の深い層にチームは無い」が根拠 — [ADR-1858](1858-system-view-group-by-team.md) 決定 7）。
- **entity view**（`renderEntityView`）は `groupBy` を signature ごと受け取らず未配線。
- **spec** は「grouping は grouped level = system-view top tier に描画されるノードにのみ効く」と記述（P2b-C）。

bucket 計算（`layout.ts`）は最初から「渡された slice の childNodes × 軸 index の交差」で書かれており、レベル非依存だった。root-only は呼び出し側が drill slice に `groupBy` を渡さないことで**外から**成立していたにすぎない。つまり問いは「drill-down grouping をどう新造するか」ではなく、**既に interactive で動いている挙動を仕様として認めて全 surface の parity を回復する（正規化）か、gate を足して spec どおり殺すか**であった。`boundary` は experimental notation（[ADR-1820](1820-notation-promotion-gate.md)）。

## 決定

グルーピングのセマンティクスを **「軸 index（model-wide の `Map<id, groupId>`）と、いま描画しているレベルに描画されるノード集合の交差」** として正規化する。具体的には静的 export の root-only gate を **3 builder すべてで撤去**し、`renderEntityView` に軸を配線して（frames-only — 対話 collapse は渡さない）、interactive・export・entity view・spec の四者を「各ビューはそのレベルの member でフレームを組む」で揃える。文法変更はゼロ。**inert-member 診断（`contains-target-not-groupable`）は出荷しない** — 実装時の全 kind 列挙で対象集合が空（∅）と確定したため（下記「却下した案」）。

セマンティクスの言語化（spec 反映済み）:

1. **per-view 独立**: 各ビュー（root / service / domain / usecase / entity / all-layers の各 band）は、そのビューに描画される member の部分集合でフレームを組む。他レベルの member は参加しない。
2. **同一 boundary の複数フレーム**: member が複数レベルに散る boundary は、レベルごとに同名ラベルの disjoint なフレームを持つ（[ADR-1884](1884-group-by-team-multi-system-root-per-system-frames.md) の multi-system per-(system, team) フレームと同型。1 枚の枠でレベルを跨いで囲まない）。
3. **member 不在のビューでは枠を出さない**（export 出力は byte 不変）。
4. **ghost は grouping に参加しない**（`ghostDomains` 等は `childNodes` と別フィールドで bucket 対象外）。
5. **collapse・P2c routing は同じ機構がそのまま効く**。collapse は per-view の view-state、P2c routing/trunks は `groupBands != null` で発火、crossing marks は全ビュー無条件。export は「collapse は適用しない」を維持（[#1879](https://github.com/kompiro/karasu/issues/1879) どおり全ノードを描画）。diff-mode は system root のみ（現状維持）。

`boundary` は experimental のまま。本件は experimental 層内の挙動確定 + surface 間不整合の解消であって stable 昇格ではない（昇格は従来どおり karasu-nest corpus の evidence を待つ）。team 軸（`organization` / `owns` は stable 構文）でも nested `owns` を使うモデルの grouped export は変わるため、その分は promotion gate の枠外の通常の minor 挙動変更として扱った。

## 理由

- **差分が最小**: bucket 計算・フレーム描画・collapse・P2c は最初からレベル非依存に書かれており、「作る」ものはほぼ無い。変更は gate の緩和と entity 配線、そして退化ケースの柵。
- **殺すより認める方が実挙動に忠実**: interactive の drill grouping は P2a 以来出荷され続けており、gate を足して殺す方が実質的な挙動変更になる。spec を実挙動 + ユーザー価値側に合わせる。
- **既存原則と整合**: [ADR-1513](1513-legend-drill-down-scope.md) の「レベルごとに、そのレベルのものだけを描く」（legend の per-drill-depth exact-match）、[ADR-1815](1815-expand-container-in-place.md) の「入れ子は drill-down の領域」と一致する（system view を deep 化しない）。
- **不変条件を各レベルで維持**: 全ノードちょうど一度配置・collapse 時の端点再解決・退化ケースで破綻しない（[TPL-1738](../test-perspectives/TPL-1738-relayout-into-group-preserves-placement-and-edges.md)）を drill slice で柵にした。P2c は crossings + penetrations の両計測（[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)）で計測。
- **surface parity の再発防止**: gate を一部 surface にだけ入れて残りで undocumented 挙動が出荷される失敗クラスを proactive TPL [TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md) として観点化した（実際、実装中に 3 番目の gate `buildAllViewsSvg` の緩和漏れをこの観点が検出した）。

## 却下した案

- **gate 追加（interactive も root のみに制限し spec の旧記述に合わせる）**: ユーザー価値を消す方向で、[#1983](https://github.com/kompiro/karasu/issues/1983) の要求と真逆。P2a 以来動いてきた挙動（team 軸でも nested `owns` で発生しうる）を止める。gate を足すコストは正規化の柵とほぼ同額で、将来正規化するなら二度手間。
- **per-level axis（`boundary payments service { … }` 等のレベル指定を新設）**: member は id 参照であり、その id がどのレベルで描画されるかはモデル構造が既に決めている。flat index × 描画レベルの交差で同じ結果が得られ、著者に冗長な指定を課すだけ。experimental に corpus evidence ゼロで構文表面積を足すのは [ADR-1820](1820-notation-promotion-gate.md) の規律に反する。
- **nested `boundary` 構文**: モデル階層の深いノードをグルーピングしたいという要求と直交する別問題（boundary 同士の階層）を解いてしまう。`boundaryIndex` の 1:1 前提が壊れ機構コストが跳ねる。親 design doc が deferred にした項目で、解禁する動機（corpus 証拠）が無い。引き続き deferred（却下ではない）。
- **inert-member 診断 `contains-target-not-groupable` の出荷**: 当初 [#1983](https://github.com/kompiro/karasu/issues/1983) は「どの groupable ビューにも描画されない kind の member に warning」を安価な先行出荷案としていた。しかし正規化後も恒久的に真である発火条件を kind ベースで書くには、対象 kind 集合を view-extract の描画 kind の全列挙で確定する必要がある。実装時に列挙した結果、**対象集合は空（∅）** だった — `resource` は domain view（直下宣言・promotion）と usecase drill ページで、infra leaf（`table` / `queue-item` / `bucket`）は infra コンテナの drill ビューで、それぞれ top-level ノードとして描画・フレーム対象になる。設計時の候補 `{resource, table, queue-item, bucket}` への警告はすべて偽陽性になり、「正規化後も恒久的に真」という要件を候補集合自身が満たさない。よって診断は出荷しない。代わりに、containable な全 kind が home レベルで描画・フレーム対象になることを `packages/core/src/renderer/group-by-drilldown-render.test.ts` の enumeration suite（`LogicalNodeKind` の型レベル網羅ガード付き）で固定し、将来 kind が groupable レベルを失えば suite が fail してこの判断を再訪する。

> 補足（識別モデルの sharp edge）: `contains` は素の id 参照で、id は「フラット名前空間 + 段階 severity の一意性」モデル（sibling のみ error 一意）を採るため、service と nested domain が同 id を持つと `contains X` が別ノードを複数レベルで黙って取り込む。本 ADR の正規化はこれを顕在化させるが、id/参照モデルの変更は本件スコープ外とし、曖昧性診断および修飾 `contains`（既存の `DomainId.EntityId` ドット記法の一般化）を follow-up [#2036](https://github.com/kompiro/karasu/issues/2036) に切り出した。
