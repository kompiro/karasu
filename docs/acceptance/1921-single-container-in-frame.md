# AT-1921: In-place container expansion — single-container mixed-LOD (Phase 1)

- **日付**: 2026-07-13
- **Issue**: #1921（親 tracking #1815 / epic #1817 comprehension、goal #1923）
- **PR**: feat/expand-container-in-frame
- **設計**: [ADR-1815](../adr/1815-expand-container-in-place.md)
- **Related TPLs**: [TPL-1223](../test-perspectives/TPL-1223-scoped-glance-drill-down.md)（scoped glance を first-class に保つ）, [TPL-1738](../test-perspectives/TPL-1738-relayout-into-group-preserves-placement-and-edges.md)（要素を再配置しても全要素ちょうど一度配置 + 端点保持）, [TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md)（`.krs` 不変）
- **対象**: `packages/core/src/view/view-extract.ts` / `renderer/layout.ts` / `renderer/svg-renderer.ts`、`packages/app`（`useSystemView` / `useCollapsibleSet` / `PreviewPane` ほか）

## 概要

system view で 1 つの service コンテナをその場で展開（in-place expansion）する。展開した service はその domain 子要素を境界フレームの中に描き、兄弟 service は畳んだ箱のまま隣に並ぶ。越境エッジは — domain 由来のものは正確な内部 domain に、explicit service edge / infra edge はフレーム境界に — 再アンカーされ、drop されない。単一フレーム内の混在 LOD（mixed level-of-detail）の最小ケース（案1 goal の Phase 1）。同時展開は高々 1（scoped glance 保持、C1）。`.krs` は変更しない view 操作。

## 受け入れ条件

### AC-1: mixed-LOD スライス導出（core）

> ✅ Automated by `packages/core/src/view/view-extract.expand.test.ts` (suite-wide)

- [x] `expandedContainers` に service を渡すと、その service が childNodes から消え、domain 子要素に置換される
- [x] 兄弟 service は畳んだ箱のまま残る
- [x] 越境 domain edge は近端 = 正確な内部 domain、遠端 = 畳んだ兄弟 service に再アンカーされる（出入り両方向）
- [x] 展開 service 内部の domain→domain edge は implicit タグなしの real edge として描かれる
- [x] 全ノードちょうど一度配置（重複・drop なし、TPL-1738）
- [x] 存在しない / domain を持たない id は no-op

### AC-2: レイアウト — band + フレーム + エッジ端点保持（core）

> ✅ Automated by `packages/core/src/renderer/layout.expand.test.ts` (suite-wide)

- [x] 展開 service の domain は連続 band に配置され、service ラベルを冠した境界フレーム（`expanded` / `nodeId`）で囲まれる（`buildGroupFrames`/`assignGroupedLayers` 再利用）
- [x] domain はフレーム矩形の内側、兄弟はフレーム外
- [x] 再アンカー済みの越境・内部エッジが端点を保って描かれる（TPL-1738）
- [x] **domain provenance を持たない explicit service edge はフレーム境界にアンカーされ drop されない**（`computeEdgePoints` の container-border fallback）

### AC-3: 描画 affordance と interactive gating（core）

> ✅ Automated by `packages/core/src/renderer/expand-render.test.ts` (suite-wide)

- [x] 畳んだ drillable service 箱に ⊕、展開フレームに ⊖ が付く（どちらも `data-expand-node=<serviceId>`）
- [x] 展開フレームは team collapse 対象にならない（`data-collapse-group` を出さない）
- [x] `interactive` 指定時のみ affordance を描画。static 出力（SVG export / `/render` / CLI）には出ない（C3）

### AC-4: app の対話配線と単一展開不変条件

- [x] `[data-expand-node]` のクリックで `onExpandToggle(serviceId)` が発火する
> ✅ Automated by `packages/app/src/components/PreviewPane.test.tsx`
- [x] `useCollapsibleSet(single)` は高々 1 要素を保持（2 つ目を展開すると 1 つ目が畳まれる、C1）
> ✅ Automated by `packages/app/src/hooks/useCollapsibleSet.test.ts`
- [x] 展開状態は app の view-state で `.krs` を変更しない（round-trip 保持、TPL-1101）
> ✅ Automated — 展開は compile option のみで AST/シリアライズに触れない（`packages/core/src/renderer/expand-render.test.ts` が SVG 差分のみを確認）
- [x] live app で ⊕ が service をその場展開し、フレームの ⊖ で畳み直せる（開いた後ちゃんと閉じられる）
> ✅ Automated by `packages/e2e/tests/at-1921-expand-in-place.spec.ts` › `⊕ expands a service in place; ⊖ collapses it back (AT-1921-01)`

### AC-5: scoped glance を壊さない（B1–B3、TPL-1223）

受け入れバーは `examples/ja/payment-platform` で `Gateway` を展開して実測した
（design doc「Phase 1 計測結果」節）。数値: 1 画面ノード数 9 → 10（+1、上限内）、
描画エッジ数 9 → 9（**drop ゼロ**）、兄弟（RiskEngine / Ledger / 外部群）はすべて残存。

- [x] B1: 展開ノードの内部要素と兄弟が同一フレームに共存し、越境エッジが端点を保って drop せず描かれる
> ✅ Automated by `packages/core/src/renderer/layout.expand.test.ts`
- [x] B3: 全ノードちょうど一度だけ配置される（重複・drop なし、TPL-1738）
> ✅ Automated by `packages/core/src/view/view-extract.expand.test.ts`
- [x] B2: 展開した service のフレームと、それに接続する edge（例: `Customer -> OrderService`）が展開中も描かれる
> ✅ Automated by `packages/e2e/tests/at-1921-expand-in-place.spec.ts` › `⊕ expands a service in place; ⊖ collapses it back (AT-1921-01)`
- [ ] **[人間確認]** live app で大きめの生成図の 1 service を ⊕ 展開し、「内部を兄弟との関係のなかで読めるか」の主観的可読性（受け入れバー B1）を確認する
