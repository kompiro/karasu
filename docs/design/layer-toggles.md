# layer toggles: external / infra カテゴリの interactive collapse/expand

- **Issue**: [#1821](https://github.com/kompiro/karasu/issues/1821)（親 Epic [#1817](https://github.com/kompiro/karasu/issues/1817) comprehension）
- **PR**: #（後で反映）
- **日付**: 2026-06-28
- **ステータス**: 検討中

## 背景・課題

comprehension 柱（[#1817](https://github.com/kompiro/karasu/issues/1817)）で、大規模／AI 生成図の「壁」は**縦の深さではなく横の密度**だと整理した（縦は drill-down が既にカバー）。system view の root は service / infra / external ノードが多数並び越境 edge が混雑する。最も安く密度を下げる手が「**カテゴリ単位で表示/非表示**を切り替える」こと。

当初は app の toolbar ボタンを想定したが、**SVG 上に直接 affordance を描く interactive な collapse/expand** にする。狙い: (a) その場で展開でき、(b) 「畳まれた中身がそこにある」と一目で分かり silently 消えない、(c) #1822（グループ枠）/ #1815（in-place 展開）と**同じ affordance machinery を共有**できる。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| カテゴリの実体 | `systemTier()`（`layout.ts`）が 5 ティアに分類（user/client/service/**infra**/**external**）。[ADR-20260623-06](../adr/20260623-06-system-view-infra-external-tier-split.md)。infra = `INFRA_KIND_SET`、external = `tags.includes("external")` |
| external 配置 | `placeExternalServicesOnSides()`（左右サイド列、[ADR-20260624-06](../adr/20260624-06-external-on-sides-layout.md)） |
| **in-SVG collapse 前例** | **org tree が既に実装**: `org-tree-renderer` が `isExpanded` で ▴/▾ indicator を SVG 描画（`data-*` 付き）／`useOrgView` が `expandedTeamIds: Set` + `toggleTeamExpand`／`PreviewPane` が `target.closest("[data-…]")` で click delegation し handler へ dispatch（deploy/team ボタンも同方式） |
| render entry | `render(viewSlice, …, options?: RenderOptions)` → `layout()`。root 複数 system は `layoutMultipleSystems` の別経路 |
| 描画オプション | `RenderOptions`/`CompileOptions` に `displayMode`/`theme` 等。`compile()`→`render()`→`layout()` と伝播 |
| edge | `computeLayoutEdges()` は endpoint が `layoutNodes` に無ければ自動 drop |
| node badge | system node の右上 badge（`data-node-badge`）= ⊖ affordance の配置前例 |
| legend | usage 駆動（描画ノード種別から構築） |

## 制約・前提

- **非破壊な view 操作**: `.krs` を変更しない（round-trip 保持、[TPL-20260510-02]）。collapse 状態は app の view-state。
- **collapse = スタブ化（除去ではない）**: 畳んだカテゴリは ⊕ スタブに置換し、affordance の置き場と「隠れた中身」のシグナルを残す。
- **interactive は app 駆動**（org-tree 前例）: core が affordance を `data-*` 付きで描き、app が click delegation で state をトグル → 再描画。CSS `:target`（drill-down 用、単一 active）は独立した複数カテゴリの同時トグルに不向きなので不採用。
- **system view 専用**: external/infra は system view の概念。affordance も system view のみ。
- **cross-surface 一貫性**（[TPL-20260510-06]）: `collapsedCategories` option は app / `/render` / export / CLI で矛盾なく honor。option 無し＝全展開が既定。静的描画面はその状態のスナップショット（bare file では非対話）。
- **カテゴリ集合は拡張可能**: v1 は `external` / `infra`。`CategoryId` は string で将来 users/clients/edge を追加可能。

## 検討した選択肢（相互作用方式）

データ機構は共通 ── `collapsedCategories?: Set<CategoryId>` option を `render()` 内で `layout()` 直前に viewSlice 変換（畳むカテゴリを 1 スタブに置換、edge は自動 drop、reflow）。両 layout 経路を一様に扱え `layout()` シグネチャを変えない。相違は**コントロールの出し方**:

### 案A: in-SVG ⊕/⊖ affordance + app event-delegation（推奨）

core が collapsed カテゴリにスタブ（⊕-circle + 件数 + `data-collapse-category`）、open カテゴリのグループ右上に ⊖-circle（`data-collapse-category`）を描く。app は `collapsedCategories: Set` + `toggleCategory` を持ち、`PreviewPane` の delegation で `[data-collapse-category]` を拾ってトグル。**org-tree の expand/collapse と同型**。

**メリット**: 既存パターン流用で de-risk。その場展開・hidden の可視化。#1822/#1815 と machinery 共有。cross-surface（core 一点）。
**デメリット**: 静的 export は非対話（スナップショット）。

### 案B: app の toolbar ボタン（原 #1821）

**メリット**: 実装が最小。
**デメリット**: SVG 上に affordance が無く「その場で展開」できない／畳むと in-place のシグナルなく消える／#1822/#1815 と machinery を共有しない。→ 副次的、不採用。

### 案C: pure-CSS `:target` / foreignObject checkbox

**メリット**: 静的 export でも対話可能。
**デメリット**: `:target` は単一 active で独立複数トグルに不向き。checkbox は foreignObject 依存で img/background/PNG 埋め込み時に壊れる。→ 複雑性に見合わず不採用（将来「export でも畳みたい」要求が出たら再検討）。

## 比較

| 観点 | 案A in-SVG+app | 案B toolbar | 案C pure-CSS |
| --- | --- | --- | --- |
| その場展開・hidden 可視化 | ◎ | ✕ | ○ |
| 既存パターン流用 | ◎（org-tree） | ○ | ✕ |
| 独立複数トグル | ◎ | ◎ | △ |
| #1822/#1815 と machinery 共有 | ◎ | ✕ | △ |
| 静的 export で対話 | ✕（snapshot） | ✕ | ◎ |

## Related TPLs

- [TPL-20260510-06](../test-perspectives/TPL-20260510-06-display-mode-cross-surface.md) — グローバル描画トグルは全描画面の点検 + precedence 設計が必須。`collapsedCategories` は layout/svg-builder/legend/export/useSystemView 等に影響。known_consumers を横断点検。
- [TPL-20260510-05](../test-perspectives/TPL-20260510-05-implicit-data-filtering.md) — 暗黙の表示フィルタは legend/node-detail/matrix/org-view の全経路で確認。畳んだカテゴリのスタール表示が残らないこと。
- [TPL-20260623-04](../test-perspectives/TPL-20260623-04-tier-split-no-edge-penetration.md) — ティアのノード集合が変わったら残る段跨ぎ edge が中間カードを貫通しないこと（スタブ化後レイアウト）。
- [TPL-20260510-02](../test-perspectives/TPL-20260510-02-round-trip-guarantee.md) — collapse は `.krs` を変更しない。
- [TPL-20260519-02](../test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md) — infra kind と `[external]` タグの二重表現。判定は `systemTier` を単一の真実として再利用。

> 既存 TPL が本設計のリスク（cross-surface / 暗黙フィルタ / edge 貫通 / round-trip）を被覆するため、新規 proactive TPL は起こさない。

## 現時点の方針

**案A を採用**（in-SVG affordance + app delegation + collapse-to-stub）。

用語: **stub** = 畳んだ状態の ⊕ プレースホルダ（カテゴリの実ノードを置き換える箱）。**group hover frame** = 開いた状態でグループ範囲を hover で輪郭表示する別 affordance（畳む前に対象を可視化）。

- core（collapse）: `RenderOptions`/`CompileOptions` に `collapsedCategories?: Set<CategoryId>`（`"external" | "infra"`）。`render()` 内 `layout()` 直前に `collapseCategoriesToStub(viewSlice, collapsedCategories)`（畳むカテゴリの実ノードを 1 stub ノードへ置換）。stub は **⊕-circle + 件数ラベル**（例 "Infra (4)"）、`data-collapse-category`。open グループ**右上に ⊖-circle**（`data-collapse-category`、node badge と同位置）。判定は `systemTier` 同規則を再利用。
- core（group hover frame）: 開いているカテゴリのノード群を `data-category-group` で括り、**hover で輪郭枠を表示**（pure-CSS `:hover` + SVG `<style>`、JS 不要・export でも効く）。infra はティア行＝1 枠、external はサイド左右列＝各列を枠（bbox が全幅に広がらないよう領域別）。**枠の bbox 計算は #1822 クラスタ枠と machinery 共有**。
- legend: stub 化後に usage を計算する順序を担保し、畳んだカテゴリが legend から落ちることを確認（[TPL-20260510-05]）。
- app: `useSystemView` に `collapsedCategories: Set` + `toggleCategory`（`expandedTeamIds`/`toggleTeamExpand` と同型）→ `compileProject` へ。`PreviewPane` delegation に `[data-collapse-category]` 分岐を追加（click=collapse は app 駆動、hover=枠は pure-CSS）。
- **out of scope（follow-up）**: `/render` の `collapsedCategories` query param（静止画スナップショットを畳んだ状態で出す用途。対話機能の本体は app 側で、TPL-20260510-06 の一貫性は「`/render` は option 未指定＝全展開で挙動不変」で満たす）。app Share ボタンへの状態埋め込みも follow-up。context menu 版の ⊖ も follow-up。

### 影響範囲・マイグレーション

- 後方互換: option 未指定＝全展開で挙動不変。`.krs` 形式・既存スナップショットに影響なし。
- 検証面（[TPL-20260510-06] known_consumers）: layout / svg-builder / legend-footer / node-detail-panel / full-view-svg / export-svg / useSystemView を横断確認。

## 決めたこと（壁打ち結果）

- ⊖ は**グループ右上の ⊖-circle**（context menu は follow-up）。
- collapsed stub は **⊕-circle + 件数ラベル**。
- 開状態の **group hover frame** を v1 に含む（pure-CSS `:hover`、#1822 と machinery 共有）。
- **`/render` query param は out of scope**（follow-up）。v1 は app 上の対話 collapse/expand + hover frame。
