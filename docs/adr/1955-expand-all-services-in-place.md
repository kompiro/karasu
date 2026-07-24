---
id: ADR-1955
title: 全 service をその場一括展開する — Collapse all / Expand all トグルの overload
status: accepted
date: 2026-07-15
topic: app-ui
related_to:
  - ADR-1815
  - ADR-1858
  - ADR-1872
  - ADR-2120
scope:
  packages: [app]
assumptions:
  - "symbol: packages/app/src/hooks/useSystemView.ts :: extractCollapsibles"
  - "symbol: packages/app/src/hooks/useSystemView.ts :: onCollapseAllToggle"
  - "file: docs/acceptance/1955-expand-all-services.md"
---

# ADR-1955: 全 service をその場一括展開する — Collapse all / Expand all トグルの overload

- **日付**: 2026-07-15
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#1955](https://github.com/kompiro/karasu/issues/1955)（親 epic [#1817](https://github.com/kompiro/karasu/issues/1817) comprehension）。実装 PR [#1968](https://github.com/kompiro/karasu/pull/1968)、設計 PR [#1964](https://github.com/kompiro/karasu/pull/1964)
  - 前提: [ADR-1815](1815-expand-container-in-place.md)（in-place expansion / true mixed-LOD。Phase 2 #1923 で複数同時展開・「Collapse all」で全畳み・ソフト警告・ハード上限なしを確定）
  - 再利用機構: [ADR-1858](1858-system-view-group-by-team.md) §3（per-axis 状態/コントロールの直交）, [ADR-1872](1872-category-collapse-retarget-edges.md)（category band の折り畳み）
  - 姉妹: [ADR-2120](2120-group-by-bulk-collapse.md)（#1872。bulk collapse の「描画済み SVG から id 集合を得る」「軸の有無で駆動する」パターンの初出。本 ADR はその expansion 軸版）
  - 制約 TPL: [TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md)（scoped glance を first-class に保つ）, [TPL-20260510-03](../test-perspectives/TPL-20260510-03-enum-member-addition.md)（軸の有無で駆動し `groupBy` に分岐しない）, [TPL-20260516-01](../test-perspectives/TPL-20260516-01-control-a11y-contract-survives-migration.md)（コントロールの a11y 契約維持）, [TPL-20260623-01](../test-perspectives/TPL-20260623-01-user-facing-surface-docs-sync.md)（user-facing surface の docs 同期）
  - AT: [AT-1955](../acceptance/1955-expand-all-services.md)
  - コード: `packages/app/src/hooks/useSystemView.ts`

## 背景

in-place expansion（ADR-1815）は各 service に ⊕/⊖ を与え、「Collapse all」で全展開を俯瞰へ畳む一括操作を持つ。だが対称の一括操作 — **全 service を一気にその場展開する** — が無く、「まず全体を開いて見渡し要らない所を畳む」探索のたびに service を 1 つずつ ⊕ する必要があった（#1955）。

現状コードは既に一括操作の骨格を持ち、expansion 軸は collapse 側だけ実装済みだった: `allCollapsed` は既に `expandedContainers.size===0` を含み、`onCollapseAllToggle` の collapse 方向は既に展開をクリアする。欠けていたのは expand 方向に「全 service 展開」を足すことだけ。

## 決定

**既存の「Collapse all / Expand all」トグルを overload し、その Expand-all 方向が frames/bands の展開に加え、単一 system・ungrouped view の全 drillable service をその場展開するようにする。** 新規コントロール・i18n キー・prop 配線は設けない。

実装は `useSystemView` に閉じる:

1. `extractCollapsibles` が `data-collapse-*` に加え `data-expand-node` も走査し、drillable service 集合 `serviceIds` を返す（`data-collapse-group` と同じ SVG 走査 idiom。`data-expand-node` は ⊕/⊖ 両状態に付くので「展開しうる service 全体」になる）。
2. `anyCollapsible` に `serviceIds.length > 0` を OR — frames/bands の無い純 service view でもトグルが出る。
3. `onCollapseAllToggle` の expand 方向で `expansions.replace(serviceIds)` を呼ぶ。

**scope は renderer 側ゲートに一元化する。** `data-expand-node` は `!groupBy && expandable`（単一 system）のときしか emit されないため、`serviceIds` は Group-by team / multi-system で自然に空になり、app 側で `groupBy` を条件分岐せずに no-op を得る（TPL-20260510-03）。

**scoped-glance ガードはソフトのまま。** 全展開は overload 閾値（4）を超えて ⚠ ヒントを出すが、それは仕様どおり。「Collapse all」が 1 クリックで俯瞰へ戻す（ADR-1815 のハード上限なし方針を踏襲）。

## 受け入れた制約（2 クリック）

overload トグルは二値（全畳み ⇄ 全開き）でラベルは `allCollapsed` に従う。`allCollapsed` は「展開なし かつ 全 frame/band 畳み済み」で、layer band（external/infra）は **起動時は展開状態**である。したがって store を持つモデル（＝ infra 帯あり = 実質ほとんどのモデル）は起動時 `allCollapsed=false` で「Collapse all」表示になり、全 service 展開は俯瞰状態からの枝でのみ起きるため **Collapse all → Expand all の 2 クリック**になる。band の無い純 service モデルのみ 1 クリック。

#1955 の受け入れ条件「単一操作で全 service 展開」は band 無しモデルで厳密に満たし、band ありモデルでは 2 クリックに緩む。この gap は code review（PR #1968）で表面化し、ユーザー判断で **2 クリック運用を受容**した（コントロールを増やさないことを優先）。挙動は AT-1955 AC-1b で固定している。

## 理由

- **最小差分**: 現状コードが既に `allCollapsed` / collapse 方向で expansion を織り込んでいたため、overload は expand 方向 1 箇所 + id 抽出のみで成立し、PreviewColumn / i18n / prop 配線 / core を触らない（changeset も不要）。
- **軸非依存の駆動**: 「今そのビューで展開しうる service」を描画済み SVG から読むことで、将来 Group-by 軸が増えても bulk 操作が silent に壊れない（姉妹 bulk-collapse と同じ設計、TPL-20260510-03）。
- **既存 a11y 契約の維持**: `anyCollapsible` / `allCollapsed` / `onCollapseAllToggle` の 3 フィールドの内部計算・挙動だけを変え、`aria-pressed`/click 契約は不変（TPL-20260516-01）。

## 却下した案

- **独立した一方向ボタン「⊕ Expand all services」（Option 1）**: 2 軸（frames/bands ↔ service 展開）が直交したまま常時 1 クリックで展開でき、#1955 の AC を band の有無に依らず満たす。だがコントロール・i18n キー・prop 配線を新設する。今回は「コントロールを増やさない」を優先して不採用（2 クリック制約を受容する代償）。band ありモデルの 1 クリック展開が要件化されれば再検討する第一候補。
- **独立したトグル（Option 2）**: service 展開軸専用のトグル。「Collapse all」に加えもう 1 つの collapse 経路ができ冗長。
- **トグルの tri-state 化（overload + gate 修正）**: 「展開可能だが未展開」なら常に「Expand all」を出す案。band が開き service が閉じた混在状態でラベル/意味が曖昧になり、二値の明快さを失うため不採用。
- **深い入れ子展開**: 展開 domain の子をさらに展開するのは drill-down の領域（ADR-1815 で却下済み）。
