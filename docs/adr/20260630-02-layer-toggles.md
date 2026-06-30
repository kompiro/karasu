---
id: ADR-20260630-02
title: layer toggles — external/infra カテゴリの対話的 collapse/expand
status: accepted
date: 2026-06-30
topic: renderer
related_to: [ADR-20260623-06, ADR-20260624-06, ADR-20260626-01]
scope:
  packages: [core, app]
assumptions:
  - "file: packages/core/src/renderer/category-collapse.ts"
  - "symbol: packages/core/src/renderer/category-collapse.ts :: collapseNodeList"
  - "symbol: packages/core/src/renderer/category-collapse.ts :: categoryOf"
  - "symbol: packages/core/src/renderer/svg-renderer.ts :: renderCategoryControls"
  - "file: packages/app/src/hooks/useSystemView.ts"
  - "file: packages/app/src/utils/download-svg.ts"
---

# ADR-20260630-02: layer toggles — external/infra カテゴリの対話的 collapse/expand

- **日付**: 2026-06-30
- **関連**:
  - Issue [#1821](https://github.com/kompiro/karasu/issues/1821)（親 Epic [#1817](https://github.com/kompiro/karasu/issues/1817) comprehension）
  - 実装 PR [#1838](https://github.com/kompiro/karasu/pull/1838)
  - 関連: [ADR-20260623-06](20260623-06-system-view-infra-external-tier-split.md)（infra/external のティア分割 — 本 ADR の `systemTier` 判定を再利用）, [ADR-20260624-06](20260624-06-external-on-sides-layout.md)（external のサイド列配置）, [ADR-20260626-01](20260626-01-karasu-nest-hosted-preview.md)（nest — AI 生成図の読み手）
  - Related TPLs: [TPL-20260510-06](../test-perspectives/TPL-20260510-06-display-mode-cross-surface.md), [TPL-20260510-05](../test-perspectives/TPL-20260510-05-implicit-data-filtering.md), [TPL-20260623-04](../test-perspectives/TPL-20260623-04-tier-split-no-edge-penetration.md), [TPL-20260510-02](../test-perspectives/TPL-20260510-02-round-trip-guarantee.md)
  - AT: [AT-1821](../acceptance/1821-layer-toggle-external-infra.md)

## 背景

comprehension 柱（[#1817](https://github.com/kompiro/karasu/issues/1817)）で、大規模・AI 生成の system view の「壁」は**縦の深さではなく横の密度**だと整理した（縦は drill-down が既にカバー）。root には service / infra / external が多数並び越境 edge が混雑する。最も安く密度を下げる手が「カテゴリ単位で表示/非表示を切り替える」こと。当初は toolbar ボタンを想定したが、**SVG 上に直接 affordance を描く対話的 collapse/expand** にした（org tree の expand/collapse 前例に倣う）。

## 決定

system view の **external**（`[external]` service）と **infra**（database/queue/storage）を、SVG 上の affordance で対話的に collapse/expand する。

- **core**: `RenderOptions`/`CompileOptions` に `collapsedCategories?: ReadonlySet<CategoryId>` を追加。`render()` 内で `layout()` 直前に `collapseNodeList` が畳むカテゴリの実ノードを **1 つの ⊕ stub** に置換する（単一・複数 system 両経路で reflow、edge は `computeLayoutEdges` の既存ガードで自動 drop）。カテゴリ判定 `categoryOf` は `systemTier`（[ADR-20260623-06](20260623-06-system-view-infra-external-tier-split.md)）と同じ規則（infra kind / `[external]` タグ）を**単一の真実**として再利用する。
- **対話 affordance**: open カテゴリのグループ右上に **⊖** ボタン、hover で範囲を示す破線枠（`pointer-events:none` でノードクリックを妨げない）。collapsed は **⊕ stub**（`Infra (N)`）。各 affordance は `data-collapse-category` を持つ。
- **対話は app 駆動**（org tree 前例）: core は `data-*` 付きで affordance を描き、app（`PreviewPane` の click delegation）がトグルして再コンパイルする。collapse 状態は `useSystemView` の view-state で、`.krs` は変更しない。
- **対話 controls は interactive のみ**: `RenderOptions.interactive`（既定 false）が true のときだけ ⊖/枠を描く。ライブプレビューのみ opt-in。static 出力（SVG export / `/render` / CLI / guide 図）には controls を出さない。plain「Export SVG」はライブ svg を流用するため `downloadSvg` が `krs-category-controls` を除去する。⊕ stub は content として残す。

## 理由

- **既存パターンの流用で de-risk**: 「core が `data-*` affordance を描き、app が click delegation でトグルして再描画」は org tree / deploy・team ボタンで確立済み。
- **pre-layout で stub 化**するので reflow し穴が残らない。stub にすることで「畳まれた中身がそこにある」と一目で分かり silently 消えない。
- **判定を `systemTier` に一本化**することで、infra kind と `[external]` タグの二重表現（[TPL-20260519-02]）が drift しない。
- **`interactive` ゲート**で、対話用クロームが export/`/render`/CLI/guide の静的 SVG を汚さない（[TPL-20260510-06] の cross-surface 一貫性）。

## 却下した案

- **app の toolbar ボタン**（原案）: SVG 上に affordance が無く「その場で展開」できず、畳むと in-place のシグナルなく消える。#1822/#1815 と machinery を共有しない。
- **pure-CSS `:target` / foreignObject checkbox**: 静的 export でも対話可能だが、`:target` は単一 active で独立複数トグルに不向き、checkbox は foreignObject 依存で img/background/PNG 埋め込み時に壊れる。複雑性に見合わず不採用（将来「export でも畳みたい」要求が出たら再検討）。
- **`layout()` に collapse 引数を直接追加**: positional 引数が肥大化し、root 複数 system の別経路に二重配線が要る。`render()` 内で viewSlice を一点変換する方が薄い。

## 後続（本 ADR の範囲外）

- `/render` の `collapsedCategories` query param（collapsed 静止画）、app Share ボタンへの状態埋め込み、context menu 版 ⊖。
- グループ枠の machinery は #1822（意味的クラスタ枠）・#1815（in-place 展開）と共有する想定。
