# AT-1872: Group by team — Collapse all / Expand all bulk control (system view)

- **日付**: 2026-07-11
- **Issue**: #1872（親 #1858 / Epic #1817 comprehension）
- **PR**: (this PR)
- **設計**: [docs/design/group-by-bulk-collapse.md](../design/group-by-bulk-collapse.md)
- **関連 ADR**: [ADR-20260711-03](../adr/20260711-03-system-view-group-by-team.md)（決定 4「bulk 操作は #1872 で追加」）, [ADR-20260712-01](../adr/20260712-01-category-collapse-retarget-edges.md)（category collapse を edge re-target 化）
- **Related TPLs**: [TPL-20260510-03](../test-perspectives/TPL-20260510-03-enum-member-addition.md)（列挙メンバー追加時の網羅性を型で強制 — bulk collapse を軸非依存にして追加漏れを防ぐ）, [TPL-20260623-01](../test-perspectives/TPL-20260623-01-user-facing-surface-docs-sync.md)（toolbar action の docs 同期）, [TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md)（再配置時の端点保持 — category re-target の柵）
- **対象**: core `packages/core/src/renderer/category-collapse.ts`（`collapseCategories`）/ `layout.ts` / `group-collapse.ts`；app `packages/app/src/hooks/useSystemView.ts` / `useAppViews.ts` / `usePreviewContextValue.ts`、`packages/app/src/state/preview-context.tsx` / `active-view-data.ts`、`packages/app/src/components/PreviewColumn.tsx` / `AppShell.tsx`、`packages/i18n`

## 概要

Group by: Team の system view に **Collapse all / Expand all** の一括操作を追加する。per-group ⊖/⊕（#1858 slice B）はあるが一括手段が無かった。ADR-20260711-03 の P1 検証が示すとおり「既定で畳んでおき必要な所だけ開く」（全折り畳み = group 依存 DAG ビュー）が最も読みやすく、そこへ 1 クリックで入る手段を用意する。

ラベルが「all」なので、**ビュー内で畳めるものすべて** を対象にする — team 境界フレーム（#1858, `data-collapse-group`）**と** external / infra カテゴリ帯（#1821, `data-collapse-category`）の両軸。per-axis の状態（`collapsedGroups` / `collapsedCategories`）と個別コントロールは従来どおり直交（ADR-20260711-03 §3）で、束ねるのは bulk トグルだけ。ボタンの表示は `groupBy` ではなく **「畳めるものがあるか」（`anyCollapsible`）** で判定するため、グループ化していない（Group by: None・org 無し）ビューでも external / infra 帯があれば出る。team 側は SVG 由来の id で駆動するため軸非依存で、将来 Group-by 軸が増えても（P2b `group`）無改修（設計 doc 参照）。

あわせて、両軸を畳んだときに **team→external/infra の依存線が消えない**よう、core の category collapse を group collapse と同じ **edge re-target** に揃えた（[ADR-20260712-01](../adr/20260712-01-category-collapse-retarget-edges.md)）。`.krs` は不変。core を変更するため **changeset あり**（`@karasu-tools/core` / `karasu` minor）。

## 受け入れ条件

### AC-1: 折り畳み対象 id の導出（軸非依存 + カテゴリ）

> ✅ Automated by `packages/app/src/hooks/useSystemView.test.tsx` (suite-wide)

- [x] Group by: Team のとき、`groupIds` が描画済み SVG の `data-collapse-group` から全 team 分（展開・折り畳み双方）そろい、`anyCollapsible` が true になる
- [x] ungrouped かつカテゴリ無しでは `groupIds` 空・`anyCollapsible` false・`allCollapsed` false
- [x] XML エスケープされた id（例 `R&D` → `R&amp;D`）を decode し、collapse-all が実 id にマッチする（未 decode だと当該 group が畳まれず `allCollapsed` も立たない）

### AC-2: 一括トグルの挙動（両軸・core 再コンパイル込み）

> ✅ Automated by `packages/app/src/hooks/useSystemView.test.tsx` (suite-wide)

- [x] `onCollapseAllToggle()` が全 team を stub に畳む（`__group_collapsed_<team>__` が全 team 分出る / 所有サービスカードが消える）→ `allCollapsed` が true
- [x] `onCollapseAllToggle()` が **external / infra カテゴリ帯も畳む**（`collapsedCategories` に external / infra が入り、カテゴリメンバーが消える）
- [x] **ungrouped（Group by: None・org 無し）でも** external / infra だけで `anyCollapsible` が true になり、collapse-all がカテゴリを畳む（groups は関与しない）
- [x] 全折り畳み状態でもう一度呼ぶと **両軸とも**展開に戻る（サービスカード・カテゴリメンバーが復帰、stub が消える、`collapsedCategories` が空）→ `allCollapsed` が false

### AC-2b: category collapse の edge re-target（core, ADR-20260712-01）

> ✅ Automated by `packages/core/src/renderer/category-collapse.test.ts` (suite-wide)

- [x] external/infra を畳むと、境界を越えるエッジが **stub に re-target** される（drop されない）— 展開時と折り畳み時で edge の arrow が保たれる（実測 0→1 の回帰を防ぐ）
- [x] カテゴリ内で完結するエッジは drop、re-target 後は `(from,to,kind)` で de-dup、展開ノード間の authored edge は素通し
- [x] external・infra 両方を畳むと cross-category エッジが **stub→stub トランク**として残る

### AC-3: toolbar ボタンの表示・状態（app component）

> ✅ Automated by `packages/app/src/components/PreviewColumn.test.tsx` (suite-wide)

- [x] 畳めるものが何も無いとき（`anyCollapsible` false）はボタンを出さない
- [x] **グループ化していなくても（`groupBy: none` / `groupByAvailable` false）**、畳めるもの（external / infra 帯）があればボタンを出す
- [x] 未折り畳みでは **「⊖ Collapse all」**（`aria-pressed=false`）、全折り畳みでは **「⊕ Expand all」**（`aria-pressed=true`）を表示する（icon + text label、shadcn `Button`）
- [x] クリックで `onCollapseAllToggle` が発火する
- [x] ラベルは i18n 経由（`preview.groupBy.collapseAll` / `expandAll`、en/ja 両方 — 型で全ロケール網羅を強制）

### AC-4: docs 同期（TPL-20260623-01）

- [ ] **手動（レビュー）**: toolbar action の追加が `docs/tools/app.md` と `docs/tools/app.ja.md` の両方に反映されている（本 PR で対応済み — レビューで確認）

### AC-5: 手動（app 目視確認）

app で `examples/en/feature-samples/team-ownership.krs` を開き、system view で「Group by」を **Team** に切り替える:

- [ ] toolbar に **⊖ Collapse all** ボタンが現れる
- [ ] クリックすると全チームが `Team (N)` stub に畳まれ、**external / infra 帯も畳まれ**、図が詰まって俯瞰ビューになる。ボタンは **⊕ Expand all** に変わる
- [ ] **⊕ Expand all** をクリックすると team・カテゴリとも展開に戻り、ボタンは **⊖ Collapse all** に戻る
- [ ] per-group ⊖/⊕ や per-category ⊖/⊕ で一部だけ畳んだ状態から **Collapse all** を押すと残りも畳まれる（一部畳み → ボタンは Collapse all のまま）
- [ ] 「Group by」を None に戻すとボタンが消える
