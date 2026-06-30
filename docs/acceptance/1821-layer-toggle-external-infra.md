# AT-1821: Layer toggles — collapse/expand external/infra categories

- **日付**: 2026-06-30
- **Issue**: #1821（親 Epic #1817 comprehension）
- **PR**: #（後で反映）
- **設計**: [docs/design/layer-toggles.md](../design/layer-toggles.md)
- **Related TPLs**: [TPL-20260510-06](../test-perspectives/TPL-20260510-06-display-mode-cross-surface.md)（全描画面の点検）, [TPL-20260510-05](../test-perspectives/TPL-20260510-05-implicit-data-filtering.md)（暗黙フィルタの legend/detail 点検）, [TPL-20260623-04](../test-perspectives/TPL-20260623-04-tier-split-no-edge-penetration.md)（段跨ぎ edge 貫通）, [TPL-20260510-02](../test-perspectives/TPL-20260510-02-round-trip-guarantee.md)（`.krs` 不変）
- **対象**: `packages/core/src/renderer/category-collapse.ts` / `svg-renderer.ts` / `layout.ts`、`packages/app`（`useSystemView` / `PreviewPane` ほか）

## 概要

system view の **external**（`[external]` service）と **infra**（database/queue/storage）を、SVG 上の affordance で対話的に collapse/expand し、横の密度を下げる。collapse すると当該カテゴリは ⊕ stub に畳まれて図が reflow、open のグループには ⊖ と hover で範囲を示す枠が出る。`.krs` は変更しない view 操作。

## 受け入れ条件

### AC-1: collapse-to-stub と reflow（core）

> ✅ Automated — `packages/core/src/renderer/category-collapse.test.ts`

- [x] `collapsedCategories` に `infra` を渡すと infra ノード（と接続 edge）が消え、`Infra (N)` の stub に畳まれる
- [x] `external` も同様（`External (N)` stub）。両カテゴリは独立に collapse できる
- [x] option 未指定/空集合では全表示（挙動不変・後方互換）
- [x] 単一 system / 複数 system（root）両経路で機能する

### AC-2: 描画 — stub ⊕ / ⊖ / hover frame（core）

> ✅ Automated — `packages/core/src/renderer/category-collapse.test.ts`

- [x] open カテゴリごとに `data-category-group` の枠（`krs-cat-frame`）と ⊖ コントロール（`krs-cat-collapse` / `data-collapse-category`）が出る
- [x] collapsed カテゴリは ⊕ stub（`krs-category-stub` / `data-collapse-category`）として描かれ、open group には出ない
- [x] hover frame は `pointer-events="none"` でノードのクリックを妨げない

### AC-3: app の対話配線

> ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx`

- [x] `[data-collapse-category="infra"|"external"]` のクリックで `onCategoryToggle(category)` が発火する
- [x] 未知のカテゴリ値はトグルしない

### AC-4: 非破壊・cross-surface（TPL-20260510-02 / -06）

- [x] collapse 状態は app の view-state で、`.krs` を変更しない（round-trip 保持）
> ✅ Automated — collapse は compile option のみで AST/シリアライズに触れない（`category-collapse.test.ts` が SVG 差分のみを確認）
- [ ] `/render`・export は option 未指定で全展開のまま（挙動不変。collapsed 静止画の query param は本 PR では out of scope）
> 🟡 Manual — `karasu render <index>.krs --view system` が従来どおり全表示で出力されることを目視

### AC-5: 手動（app での視覚・操作確認）

`examples/en/getting-started/index.krs` を app の system view で開く:

- [ ] **hover**: infra グループの ⊖ にカーソルを乗せると、infra ノード群を囲む破線枠が現れる（external も同様）
- [ ] **collapse**: ⊖ をクリックすると当該カテゴリが `Infra (N)` / `External (N)` の ⊕ stub に畳まれ、図が詰まる（穴が残らない）
- [ ] **expand**: ⊕ stub をクリックすると元に戻る
- [ ] **独立**: infra と external を別々に畳める
- [ ] **scope**: deploy / org view にはカテゴリ affordance が出ない（system view 限定）
- [ ] **legend**: 畳んだカテゴリが legend footer から落ちる（TPL-20260510-05）

## 検証方法

- 自動: `pnpm --filter @karasu-tools/core test -- category-collapse` / `pnpm --filter @karasu-tools/app exec vitest run src/components/PreviewPane.test.tsx`。
- 手動: app（`pnpm --filter @karasu-tools/app dev`）で `examples/en/getting-started/index.krs` を開き AC-5 を確認。`/render` 不変は CLI render の出力で確認（AC-4）。
