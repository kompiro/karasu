# Expand all services in place（Collapse all / Expand all トグルの overload）

- **日付**: 2026-07-15
- **ステータス**: 検討中
- **Issue**: #1955
- **PR**: [#1964](https://github.com/kompiro/karasu/pull/1964)
- **関連**:
  - 引き金 Issue: [#1955](https://github.com/kompiro/karasu/issues/1955)（Comprehension: expand all services in place with one action）
  - 親 Issue: epic [#1817](https://github.com/kompiro/karasu/issues/1817)（comprehension / explorable viewer）
  - 関連 ADR: [ADR-20260714-04](../adr/20260714-04-expand-container-in-place.md)（in-place expansion / true mixed-LOD。Phase 2 #1923 で複数同時展開・「Collapse all」で全畳み・ソフト警告・**ハード上限なし**を確定）, [ADR-20260711-03](../adr/20260711-03-system-view-group-by-team.md)（team 軸グループ化。§3 で per-axis 状態/コントロールの直交を規定）
  - 姉妹 Design Doc: [group-by-bulk-collapse.md](group-by-bulk-collapse.md)（#1872。bulk collapse の「描画済み SVG から id 集合を得る」「軸の有無で駆動する」パターンの初出。本 doc はその expansion 軸版）
  - 関連 TPL: [TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md), [TPL-20260623-01](../test-perspectives/TPL-20260623-01-user-facing-surface-docs-sync.md), [TPL-20260510-03](../test-perspectives/TPL-20260510-03-enum-member-addition.md), [TPL-20260516-01](../test-perspectives/TPL-20260516-01-control-a11y-contract-survives-migration.md), [TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md)
  - コード: `packages/app/src/hooks/useSystemView.ts`, `packages/app/src/components/PreviewColumn.tsx`, `docs/tools/app.md` / `app.ja.md`

## 背景・課題

in-place expansion（ADR-20260714-04 / #1815）は各 service に ⊕/⊖ を与え、**「Collapse all」で全展開を俯瞰へ畳む**一括操作を持つ。だが対称の一括操作 — **全 service を一気にその場展開する** — が無い。読み手が「まず全体を開いて見渡し、要らない所を畳んでいく」探索をしたいとき、service を 1 つずつ ⊕ する必要がある（#1955）。

一括展開は scoped-glance の閾値（4）を意図的に超える重い操作だが、ADR-20260714-04 はハード上限を却下しソフト警告 + 「Collapse all」の戻り導線で牽制する方針を確定済みで、本機能はその前提の上に乗る（[TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md)）。

## 現状（インベントリ）

`useSystemView`（`packages/app/src/hooks/useSystemView.ts`）は既に一括操作の骨格を持ち、**expansion 軸は collapse 側だけ実装済み**。

| 観点 | 現状 | 位置 |
| --- | --- | --- |
| 折り畳み可能 id の抽出 | `extractCollapsibles(svg)` が `data-collapse-(group\|category)` を正規表現で走査し `{ groupIds, categoryIds }` を返す | `useSystemView.ts:139-147, 364` |
| 展開可能 service の SVG マーカー | renderer が drillable service に `data-expand-node="<serviceId>"` を付与（**⊕ 折り畳み状態・⊖ 展開フレーム両方**に付く → 「今展開しうる service 全体」が得られる） | `svg-renderer.ts:771-816`（`renderExpandControls`）。`!groupBy && expandable`（= 単一 system・ungrouped）のときのみ emit（`svg-renderer.ts:432-435`） |
| 一括の可否フラグ | `anyCollapsible = groupIds>0 \|\| categoryIds>0 \|\| expandedContainers.size>0` | `useSystemView.ts:367-368` |
| 全畳み判定 | `allCollapsed = anyCollapsible && expandedContainers.size===0 && groupIds.every(collapsed) && categoryIds.every(collapsed)` | `useSystemView.ts:369-372` |
| 一括トグル | `onCollapseAllToggle`: **collapse 方向**は frames/bands を畳み `clearExpansions()`; **expand 方向（`if(allCollapsed)`）は frames/bands を開くだけで service は展開しない** | `useSystemView.ts:377-393` |
| コントロール | `PreviewColumn.tsx` の `⊖ Collapse all ⇄ ⊕ Expand all` トグル 1 個。`activeView==="system" && view.anyCollapsible` でゲート、`aria-pressed={allCollapsed}` | `PreviewColumn.tsx:309-322` |
| ソフト警告 | `expansionOverload = expandedContainers.size >= 4` → ⚠ ヒント | `useSystemView.ts:114,407` / `PreviewColumn.tsx:323-330` |

**要点**: 欠けているのは `onCollapseAllToggle` の expand 方向に「全 service 展開」を足すことだけ。collapse 方向・`allCollapsed`・overload 警告は既に expansion を織り込み済み。

## 制約・前提

- **view state のみ**。`.krs` は不変（interactive プレビュー限定）。
- **単一 system・ungrouped view 限定**。`data-expand-node` は `!groupBy && expandable`（system 数 ≤ 1）のときしか emit されない → Group-by team / multi-system では抽出集合が空になり、自動的に no-op（#1955 の受け入れ条件と一致）。この scope は renderer 側のゲートに一元化されており、app 側で `groupBy` を条件分岐しない（[TPL-20260510-03](../test-perspectives/TPL-20260510-03-enum-member-addition.md) の silent fallback を避ける — 姉妹 doc と同じ設計判断）。
- **ハード上限を設けない**（ADR-20260714-04 踏襲）。全展開は overload 閾値を超えるが、それは仕様通り。⚠ ヒントが出て「Collapse all」で 1 クリック復帰できることで牽制する。
- **out of scope**: 深い入れ子展開（drill-down の領域 / ADR-20260714-04 却下済み）、展開状態の URL/Share 符号化、group-by team 下での service 展開。
- app（`@karasu-tools/app`）・i18n（`@karasu-tools/i18n`）は changesets の `ignore` 対象。core を触らなければ changeset 不要。

## 検討した選択肢（トリガの形）

Issue が実装時判断に委ねた論点は「一括展開のトリガをどこに置くか」。

### 案1: 独立した一方向ボタン

`⊕ Expand all services` を別ボタンとして追加。展開できる service がある時だけ表示し、全展開後は消える。戻りは既存「Collapse all」。

**メリット**: 2 軸（frames/bands ↔ service 展開）が直交したまま（ADR-20260711-03 §3）。冗長な collapse 経路が無い。
**デメリット**: コントロールが 1 個増える。既存トグルの「Expand all」と新ボタン「Expand all services」の 2 つの ⊕ が並び、差異の説明が要る。i18n キー・prop 配線・PreviewColumn を新設。

### 案2: 独立したトグル

service 展開軸専用のトグル（`aria-pressed=allExpanded` で expand-all ⇄ collapse-all）を別に置く。

**メリット**: codebase の既存トグル idiom と対称。
**デメリット**: 「Collapse all」に加えもう 1 つの collapse 経路ができ冗長。案1 同様コントロール増。

### 案3: 既存「Collapse all / Expand all」トグルの overload（採用）

既存トグルの **expand 方向**に「全 service その場展開」を足す。`Expand all` = frames/bands を開く **かつ** 全 service を展開、`Collapse all` = 既存どおり全畳み（frames/bands + 展開クリア）。

**メリット**: コントロール数が増えない（最小の UI）。`allCollapsed` は既に `expandedContainers.size===0` を含み、collapse 方向は既に `clearExpansions()` する → 変更は expand 方向 1 箇所 + id 抽出のみ。i18n 追加・prop 配線・PreviewColumn 変更が **不要**。
**デメリット**: 1 コントロールが 2 軸（frames/bands + service 展開）にまたがり意味がやや重くなる。「Expand all」を bands 展開のつもりで押した人が全 service 展開まで一気に起こす驚きがある。

## 比較

| 観点 | 案1（独立ボタン） | 案2（独立トグル） | 案3（overload・採用） |
| --- | --- | --- | --- |
| 変更量 | 中（hook + i18n + preview-context + AppShell + useAppViews + PreviewColumn） | 中 | **小（useSystemView 1 関数 + docs）** |
| コントロール数 | +1 | +1 | ±0 |
| 軸の直交性 | ◎ 保たれる | ◎ 保たれる | △ 1 コントロールが 2 軸に跨る |
| 冗長な collapse 経路 | 無 | 有 | 無 |
| scoped-glance 保護 | 同等（ソフト警告 + 戻り） | 同等 | 同等 |

## 現時点の方針

**案3（既存トグルの overload）を採用する。** #1955 のレビュー判断としてユーザーがこの形を選択。決め手は「コントロールを増やさない」こと、および現状コードが既に `allCollapsed`／collapse 方向で expansion を織り込んでいるため overload が最小差分になること。

受け入れる tradeoff（軸が跨ることの意味の重さ）は次で緩和する:
- 全 service 展開は overload 閾値（4）を超えて ⚠ ヒントが出る（意図どおり）。
- 「Collapse all」が 1 クリックで俯瞰へ戻す（既存挙動）。
- ラベルは `Expand all`（frames + service を「すべて開く」）で honest。docs/tools でこの拡張された意味を明記する。

### 実装の指針

1. **`extractCollapsibles` を拡張**（`useSystemView.ts:139-147`）: `data-expand-node="([^"]+)"` も走査し `serviceIds: string[]`（重複排除）を返す。`data-collapse-*` と同じ正規表現 idiom。`data-expand-node` は ⊕/⊖ 両状態に付くので「展開しうる service 全体」になる（姉妹 doc 案 A1 と同型・軸非依存）。
2. **`anyCollapsible` に `serviceIds.length > 0` を OR**（`useSystemView.ts:367-368`）: ungrouped 単一 system で frames/bands が無く service だけの view でもトグルが出るようにする。これにより `allCollapsed` のガードにも serviceIds が織り込まれ、その view の俯瞰状態が正しく `allCollapsed=true`（→ ラベル「Expand all」）になる。コメントを「展開可能 service も一括対象に含む」旨へ更新。
3. **`onCollapseAllToggle` の expand 方向に `expansions.replace(serviceIds)` を追加**（`useSystemView.ts:378-380`）: `if (allCollapsed) { collapseGroupsAll(); collapseCategoriesAll(); expandServicesAll(serviceIds); }`。collapse 方向は既存どおり（`clearExpansions()`）。deps に `serviceIds` を追加。
4. **PreviewColumn / i18n / preview-context / AppShell / useAppViews**: 変更なし（`view.anyCollapsible` / `view.allCollapsed` / `view.onCollapseAllToggle` の内部計算・挙動を変えるだけ。既存 3 フィールドの契約は不変で `aria-pressed` 契約も保たれる — [TPL-20260516-01](../test-perspectives/TPL-20260516-01-control-a11y-contract-survives-migration.md)）。
5. **docs/tools 同期**（[TPL-20260623-01](../test-perspectives/TPL-20260623-01-user-facing-surface-docs-sync.md)）: `docs/tools/app.md` と `app.ja.md` の「Collapse all / Expand all」節に、Expand all が単一 system・ungrouped view で全 service もその場展開する旨を追記。
6. **テスト**:
   - `useSystemView.test.tsx`: 4 service fixture（既存 #1923 テストのものを再利用）で、俯瞰状態から `onCollapseAllToggle()` → 全 service が `expandedContainers` に入る／`expansionOverload` が立つ／再度 `onCollapseAllToggle()` で全クリアされ俯瞰へ戻る、を検証。Group-by team では `serviceIds` が空 → expand 方向が service を展開しない no-op を検証。
   - `PreviewColumn.test.tsx`: 既存トグルの契約（表示・`aria-pressed`・click → `onCollapseAllToggle`）が不変であることを確認（回帰）。
7. **AT**: `docs/acceptance/1955-expand-all-services.md`。TC:
   - 単一 system・ungrouped の `index.krs`（複数 service）で「Expand all」を 1 クリック → 全 service が domain フレームで展開されエッジが接続される。
   - ⚠ overload ヒントが出る／「Collapse all」で 1 クリック俯瞰復帰。
   - Group by: team・multi-system root では service 展開が起きない（no-op）。
   - `.krs` は不変。
8. **ADR 昇格**: 実装完了後、本 Design Doc を `docs/adr/1955-...`（または規約採番）へ昇格し同 PR で削除。ADR-20260714-04 に本トグル overload を追記する形も検討（小さな決定なので追補が妥当なら本 doc は ADR-20260714-04 への追記 + 削除でもよい — 昇格時に判断）。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 「Expand all」の意味が拡張される（frames/bands 展開 → + 全 service その場展開）。単一 system・ungrouped view のみ。他 view では従来どおり。
- ドキュメント更新: `docs/tools/app.md` / `app.ja.md`。
- テスト・examples への影響: なし（既存 fixture 再利用）。core・changeset 不要。

## Related TPLs

- [TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md) — scoped glance を first-class に保つ。全展開は閾値超だがソフト警告 + 戻り導線で許容（ADR-20260714-04 準拠）。
- [TPL-20260623-01](../test-perspectives/TPL-20260623-01-user-facing-surface-docs-sync.md) — user-facing surface（トグルの挙動）変更時は docs/tools を同 PR で同期。
- [TPL-20260510-03](../test-perspectives/TPL-20260510-03-enum-member-addition.md) — 軸の増加に対し「フレーム/service の有無」で駆動し `groupBy` に条件分岐しない（silent fallback 回避）。renderer 側ゲートに scope を一元化。
- [TPL-20260516-01](../test-perspectives/TPL-20260516-01-control-a11y-contract-survives-migration.md) — `aria-pressed` 等コントロールの a11y 契約を維持（overload でも不変）。
- [TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md) — 全展開に伴う再レイアウトで端点保持（Phase 2 #1923 で担保済み）。

proactive TPL の新規起票は不要と判断。本 PR は spec/concepts に新規セクションを追加せず、跨る原則（scoped-glance / docs 同期 / 軸 fallback / a11y 契約 / relayout 端点保持）は上記既存 TPL で被覆される。
