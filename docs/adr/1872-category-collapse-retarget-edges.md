---
id: ADR-1872
title: category collapse は境界エッジを drop せず stub に re-target する
status: accepted
date: 2026-07-12
topic: renderer
related_to: [ADR-1821, ADR-1858, ADR-2120]
scope:
  packages: [core, app]
assumptions:
  - "symbol: packages/core/src/renderer/category-collapse.ts :: collapseCategories"
  - "symbol: packages/core/src/renderer/category-collapse.ts :: collapseNodeList"
  - "symbol: packages/core/src/renderer/group-collapse.ts :: collapseGroups"
  - "file: packages/core/src/renderer/layout.ts"
---

# ADR-1872: category collapse は境界エッジを drop せず stub に re-target する

- **日付**: 2026-07-12
- **関連**:
  - Issue [#1872](https://github.com/kompiro/karasu/issues/1872)（Group by team: Collapse all / Expand all）
  - 見直す決定: [ADR-1821](1821-layer-toggles.md)（#1821 layer toggle — 「edge は `computeLayoutEdges` の既存ガードで自動 drop」の一点を更新）
  - 同型の先行実装: [ADR-1858](1858-system-view-group-by-team.md)（group collapse は cross-group edge を stub に re-target）
  - 同じ Issue から出た姉妹決定: [ADR-2120](2120-group-by-bulk-collapse.md)（bulk collapse を軸非依存にする設計。本 ADR の edge re-target はその bulk 化で表面化した）
  - 関連 TPL: [TPL-1738](../test-perspectives/TPL-1738-relayout-into-group-preserves-placement-and-edges.md)（再配置時の端点保持）
  - コード: `packages/core/src/renderer/category-collapse.ts` / `layout.ts` / `group-collapse.ts`

## 背景

system view には直交する 2 つの折り畳み機構がある: **category collapse**（external/infra、#1821 / ADR-1821）と **group collapse**（team、#1858 / ADR-1858）。両者はエッジの扱いが非対称だった:

- group collapse は畳んだメンバーを端点に持つエッジを **stub に re-target**（`collapseGroups`）。全 team を畳んでも「どの team がどこに依存するか」が集約トランクとして残り、group 依存 DAG ビューになる（設計 計測5）。
- category collapse はノードリストだけを stub 化し、**境界を越えるエッジは `computeLayoutEdges` の既存ガードで drop** されていた（ADR-1821 の決定）。

#1872 で「Collapse all / Expand all」が両軸を一括で畳むようになった結果、この非対称が表面化した。team を全畳みすると team→external/infra の依存線が **消える**（category 側が drop するため）。これは「全部畳んで俯瞰する」用途で最も欲しい情報（外部/基盤への依存）を失わせ、設計 計測5 が想定した DAG 俯瞰とも食い違う。

## 決定

**category collapse を group collapse と同じ re-target 戦略に揃える。** `category-collapse.ts` に `collapseCategories(nodes, edges, collapsed)` を新設し、`collapseGroups` と同じ規則でエッジを変換する:

- 畳んだカテゴリのメンバーを端点に持つエッジは、そのカテゴリの **⊕ stub に re-target** する。
- カテゴリ内で完結するエッジ（両端が同一カテゴリ）は self-loop になるので **drop**。
- re-target 後のエッジは `(from, to, kind)` で **de-dup**。展開ノード間の authored parallel edge / self-loop は保持。
- re-target したエッジは複数の実エッジを代表するため **label を落とす**（group collapse と同じ）。
- ViewSlice の ghost-edge リストも同じ remap で再アンカーする（[TPL-1738] / #1874）。category と group の remap は合成する（メンバー集合が互いに素なので順序非依存）。

既存の node のみ版 `collapseNodeList`（per-system レイアウトのノード配置に使用）は `collapseCategories(nodes, [], collapsed).nodes` に委譲して残す。

## 理由

- **2 機構の一貫性**: 折り畳みは「畳んでも依存構造は残す」が読み手の期待。group で確立した re-target を category にも適用し、非対称をなくす。
- **俯瞰ビューの価値**: 全畳み時に external/infra への集約トランクが残ることで、「誰が外部/基盤に依存するか」が 1 枚で読める（設計 計測5 の DAG 俯瞰）。
- **実装の再利用**: `collapseGroups` の remap ロジックをそのまま写した薄い変更。回帰の柵は [TPL-1738]（全要素ちょうど一度配置 + 端点保持）。

## 却下した案

- **現状維持（category は drop のまま）**: per-category の単独折り畳みとは一貫するが、Collapse all で依存線が消え俯瞰の価値を損なう。ラベルが「all」を名乗る以上、畳めるものを畳んでも依存は残すべき。
- **Collapse all を team だけに限定**（category を含めない）: edge drop は避けられるが、「all」の額面と挙動がずれる（#1872 レビュー指摘）。両軸を畳みつつ edge を残す本 ADR の方が要求に忠実。
- **bulk 操作のときだけ re-target、単独 ⊖ は drop のまま**: 同じ機構が文脈で挙動を変えるのは分かりにくい。単独 category collapse でも re-target に統一する（依存が残る方が常に読みやすい）。
