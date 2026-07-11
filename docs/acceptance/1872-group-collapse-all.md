# AT-1872: Group by team — Collapse all / Expand all bulk control (system view)

- **日付**: 2026-07-11
- **Issue**: #1872（親 #1858 / Epic #1817 comprehension）
- **PR**: (this PR)
- **設計**: [docs/design/group-by-bulk-collapse.md](../design/group-by-bulk-collapse.md)
- **関連 ADR**: [ADR-20260711-03](../adr/20260711-03-system-view-group-by-team.md)（決定 4「bulk 操作は #1872 で追加」）
- **Related TPLs**: [TPL-20260510-03](../test-perspectives/TPL-20260510-03-enum-member-addition.md)（列挙メンバー追加時の網羅性を型で強制 — bulk collapse を軸非依存にして追加漏れを防ぐ）, [TPL-20260623-01](../test-perspectives/TPL-20260623-01-user-facing-surface-docs-sync.md)（toolbar action の docs 同期）, [TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md)（再配置時の端点保持）
- **対象**: `packages/app/src/hooks/useSystemView.ts` / `useAppViews.ts` / `usePreviewContextValue.ts`、`packages/app/src/state/preview-context.tsx` / `active-view-data.ts`、`packages/app/src/components/PreviewColumn.tsx` / `AppShell.tsx`、`packages/i18n`

## 概要

Group by: Team の system view に **Collapse all / Expand all** の一括操作を追加する。per-group ⊖/⊕（#1858 slice B）はあるが一括手段が無かった。ADR-20260711-03 の P1 検証が示すとおり「既定で畳んでおき必要な所だけ開く」（全折り畳み = group 依存 DAG ビュー）が最も読みやすく、そこへ 1 クリックで入る手段を用意する。

制御は **折り畳み可能フレームの有無（`groupIds`）で駆動し、`groupBy === "team"` に紐付けない**（軸非依存）。`groupIds` は描画済み SVG の `data-collapse-group` 属性から導出するため、将来 Group-by 軸が増えても（P2b `group`）この制御は無改修で有効になる（設計 doc 参照）。`.krs` は不変・app のみの変更（core 不変につき changeset 不要）。

## 受け入れ条件

### AC-1: group id の導出（軸非依存）

> ✅ Automated by `packages/app/src/hooks/useSystemView.test.tsx` (suite-wide)

- [x] Group by: Team のとき、`groupIds` が描画済み SVG の `data-collapse-group` から全 team 分（展開・折り畳み双方）そろう
- [x] ungrouped（Group by: None）では `groupIds` は空、`allGroupsCollapsed` は false

### AC-2: 一括トグルの挙動（core 再コンパイル込み）

> ✅ Automated by `packages/app/src/hooks/useSystemView.test.tsx` (suite-wide)

- [x] `onCollapseAllToggle()` が全 team を stub に畳む（`__group_collapsed_<team>__` が全 team 分出る / 所有サービスカードが消える）→ `allGroupsCollapsed` が true
- [x] 全折り畳み状態でもう一度呼ぶと全展開に戻る（サービスカードが復帰 / stub が消える）→ `allGroupsCollapsed` が false

### AC-3: toolbar ボタンの表示・状態（app component）

> ✅ Automated by `packages/app/src/components/PreviewColumn.test.tsx` (suite-wide)

- [x] 折り畳み可能フレームが無いとき（`groupIds` 空）はボタンを出さない
- [x] `groupByAvailable` が false のときはフレームがあってもボタンを出さない
- [x] 未折り畳みでは **「⊖ Collapse all」**（`aria-pressed=false`）、全折り畳みでは **「⊕ Expand all」**（`aria-pressed=true`）を表示する（icon + text label、shadcn `Button`）
- [x] クリックで `onCollapseAllToggle` が発火する
- [x] ラベルは i18n 経由（`preview.groupBy.collapseAll` / `expandAll`、en/ja 両方 — 型で全ロケール網羅を強制）

### AC-4: docs 同期（TPL-20260623-01）

- [ ] **手動（レビュー）**: toolbar action の追加が `docs/tools/app.md` と `docs/tools/app.ja.md` の両方に反映されている（本 PR で対応済み — レビューで確認）

### AC-5: 手動（app 目視確認）

app で `examples/en/feature-samples/team-ownership.krs` を開き、system view で「Group by」を **Team** に切り替える:

- [ ] toolbar に **⊖ Collapse all** ボタンが現れる
- [ ] クリックすると全チームが `Team (N)` stub に畳まれ、図が詰まって group 依存の俯瞰ビューになる。ボタンは **⊕ Expand all** に変わる
- [ ] **⊕ Expand all** をクリックすると全チームが展開に戻り、ボタンは **⊖ Collapse all** に戻る
- [ ] per-group ⊖/⊕ で一部だけ畳んだ状態から **Collapse all** を押すと残りも畳まれる（一部畳み → ボタンは Collapse all のまま）
- [ ] 「Group by」を None に戻すとボタンが消える
