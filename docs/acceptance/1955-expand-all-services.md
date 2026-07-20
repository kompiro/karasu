# AT-1955: Expand all services in place（Collapse all / Expand all トグルの overload）

- **日付**: 2026-07-15
- **Issue**: #1955（epic #1817 comprehension、前段 #1815 / #1923）
- **PR**: feat/expand-all-services
- **設計**: [ADR-1955](../adr/1955-expand-all-services-in-place.md)（overload 決定 + 2 クリック tradeoff） / [ADR-1815](../adr/1815-expand-container-in-place.md)
- **Related TPLs**: [TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md)（scoped glance を first-class に保つ）, [TPL-20260623-01](../test-perspectives/TPL-20260623-01-user-facing-surface-docs-sync.md)（user-facing surface の docs 同期）, [TPL-20260510-03](../test-perspectives/TPL-20260510-03-enum-member-addition.md)（軸の有無で駆動し `groupBy` に分岐しない）, [TPL-20260516-01](../test-perspectives/TPL-20260516-01-control-a11y-contract-survives-migration.md)（コントロールの a11y 契約維持）
- **対象**: `packages/app/src/hooks/useSystemView.ts`、`docs/tools/app.md` / `app.ja.md`

## 概要

in-place expansion（ADR-1815）が持つ「Collapse all」の対称操作 — **全 service を一気にその場展開する** — を追加する。実装は既存の「Collapse all / Expand all」トグルの overload: その **Expand all** 方向が frames/bands の展開に加え、単一 system・ungrouped view の全 drillable service をその場展開する。コントロール・i18n キー・prop 配線の新設なし。scope は renderer 側（`data-expand-node` は `!groupBy && expandable` のときのみ emit）に一元化され、Group-by team / multi-system では自動的に no-op。トグルは二値（全畳み ⇄ 全開き）なので、layer band を持つモデル（= store あり）では Collapse all → Expand all の 2 クリックで全 service 展開に到達する（AC-1b、Option 3 の受け入れ済み tradeoff）。

## 受け入れ条件

### AC-1: 全 service 一括展開（app）

> ✅ Automated by `packages/app/src/hooks/useSystemView.test.tsx` (suite-wide)

- [x] 単一 system・ungrouped の俯瞰状態（frames/bands なし・service のみ）で `anyCollapsible` が true、`allCollapsed` が true（→ トグルは「Expand all」表示）
- [x] Expand all（`onCollapseAllToggle`）で全 drillable service が `expandedContainers` に入り、各 domain フレームが描画される（`data-node-id` 複数）
- [x] 全展開で `expansionOverload`（閾値 4）が立つ = ソフト警告のトリガ（ADR-1815 準拠・ハード上限なし）

### AC-1b: layer band があるモデルは Collapse all → Expand all の 2 クリック（app）

> ✅ Automated by `packages/app/src/hooks/useSystemView.test.tsx` (suite-wide)

overload トグルは二値（全畳み ⇄ 全開き）でラベルは `allCollapsed` に従う。store を持つモデルは infra 帯が描かれ起動時は展開状態なので `allCollapsed=false`（トグルは「Collapse all」表示）。全 service 展開は俯瞰状態からの枝でのみ起きるため、band ありモデルでは 2 クリック（Collapse all で帯を畳み俯瞰へ → Expand all で帯を開き全 service 展開）。これは Option 3 の受け入れ済み tradeoff（design doc 参照）。

- [x] infra 帯ありモデルはマウント時 `allCollapsed=false`。1 クリック目（Collapse all）は帯を畳むだけで service を展開しない。2 クリック目（Expand all）で帯が開き全 service が展開される
- [x] band が無い純 service モデルは起動時 `allCollapsed=true` で 1 クリック展開

### AC-2: Collapse all で 1 クリック復帰（app）

> ✅ Automated by `packages/app/src/hooks/useSystemView.test.tsx` (suite-wide)

- [x] 再度 Collapse all で `expandedContainers` が空になり `allCollapsed` が true に戻る（俯瞰へ復帰）

### AC-3: Group by: team / multi-system では service を展開しない（app）

> ✅ Automated by `packages/app/src/hooks/useSystemView.test.tsx` (suite-wide)

- [x] Group by: team では `data-expand-node` が emit されず、Expand all は frames のみ開き service は展開しない（`expandedContainers.size === 0`）
- [x] scope 判定は renderer 側ゲートに一元化され、app 側で `groupBy` を条件分岐しない（TPL-20260510-03）

### AC-4: 既存コントロール契約の非破壊（app）

> ✅ Automated by `packages/app/src/components/PreviewColumn.test.tsx` (suite-wide)

- [x] 「Collapse all / Expand all」ボタンの表示・`aria-pressed`・click → `onCollapseAllToggle` 契約は不変（overload は hook 内部の挙動変更のみ、TPL-20260516-01）

### AC-5: 非破壊（view-state only）

> ✅ Automated by `packages/core/src/renderer/expand-render.test.ts` (suite-wide)

- [x] 展開状態は app の view-state のみ（compile option 経由）で `.krs` / AST を変更しない — 一括展開も #1921/#1923 と同じ機構を通るため継承

> user-facing surface（トグルの拡張された意味）は本 PR で `docs/tools/app.md` / `app.ja.md` に反映済み。toolbar surface は機械チェック対象外でレビュー担保（TPL-20260623-01）。

### AC-6: 手動確認

- [ ] **[人間確認]** store を持たない純 service モデル（`index.krs`）で、起動時トグルが「Expand all」表示、1 クリックで全 service が domain フレームに展開されエッジが接続されること、⚠ overload ヒントが出ること、「Collapse all」1 クリックで俯瞰へ戻れることを確認する
- [ ] **[人間確認]** database を含むモデルで、起動時トグルが「Collapse all」表示、Collapse all → Expand all の 2 クリックで全 service 展開に到達すること（band ありの受け入れ済み tradeoff）を確認する
- [ ] **[人間確認]** Group by: team に切り替えると「Expand all」が team フレームのみ開き、service はその場展開されないことを確認する
