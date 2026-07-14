# AT-1923: General mixed-LOD — multiple simultaneous container expansion (Phase 2)

- **日付**: 2026-07-14
- **Issue**: #1923（親 tracking #1815 / epic #1817 comprehension、前段 #1921）
- **PR**: feat/expand-multi-container
- **設計**: [ADR-20260714-04](../adr/20260714-04-expand-container-in-place.md)
- **Related TPLs**: [TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md)（scoped glance を first-class に保つ）, [TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md)（再配置時の端点保持）, [TPL-20260623-04](../test-perspectives/TPL-20260623-04-tier-split-no-edge-penetration.md)（段跨ぎ edge のフレーム貫通）
- **対象**: `packages/core/src/renderer/edge-routing-groups.ts` / `layout.ts`、`packages/app`（`useSystemView` / `useCollapsibleSet` / `PreviewColumn`）、`packages/i18n`

## 概要

Phase 1 の「同時展開数 ≤ 1」制約を外し、system view で **複数の service を同時に in-place 展開**できるようにする（一般 true mixed-LOD）。複数フレームがあっても越境エッジは自分のフレーム/domain に接続し、他のフレームは side gutter で迂回する（`routeGroupedEdges` の frame 端点対応）。scoped-glance ガードはソフト — 「Collapse all」で全展開を畳んで俯瞰へ戻れ、同時展開が多いときは警告ヒントを出す（ハード上限なし）。

## 受け入れ条件

### AC-1: 複数同時展開（core）

> ✅ Automated by `packages/core/src/renderer/expand-render.test.ts` (suite-wide)

- [x] `expandedContainers` に複数 service を渡すと、それぞれのフレームが同時に描かれ（`data-expanded="true"` が複数）、各 domain が表示される
- [x] 非展開の兄弟 service は箱のまま残る
- [x] core のレイアウト機構は Phase 1 のまま（複数 group / 複数フレームを既に処理）

### AC-2: 複数フレーム間の越境エッジルーティング（core）

> ✅ Automated by `packages/core/src/renderer/layout.expand.test.ts` (suite-wide)

- [x] frame 端点（service レベルのエッジ）が両フレームの境界に接続する（`routeGroupedEdges` が frame 端点を解決し、skip されない）
- [x] 内部 domain 端点のエッジは自分のフレームに入り、他のフレームは side gutter で迂回する（貫通しない、TPL-20260623-04）
- [x] 再アンカー済みエッジは全要素ちょうど一度配置 + 端点保持（TPL-20260624-02、Phase 1 の不変条件を維持）

### AC-3: scoped-glance ガード — ソフト（app）

> ✅ Automated by `packages/app/src/hooks/useSystemView.test.tsx` (suite-wide)

- [x] `useCollapsibleSet` の単一制約を外し、複数 service を同時に展開できる
- [x] 「Collapse all」が展開もすべて畳んで俯瞰へ戻す（`expandedContainers` を clear）。展開が 1 つでもあれば bulk トグルが出る
- [x] 同時展開数が閾値（4）以上で `expansionOverload` が立つ（ソフト警告のトリガ、ハード上限なし）

### AC-4: 非破壊・cross-surface

- [x] 展開状態は app の view-state で `.krs` を変更しない（round-trip 保持）
> ✅ Automated — 展開は compile option のみで AST に触れない（`packages/core/src/renderer/expand-render.test.ts`）
- [x] Group by: team では expansion は無効（Phase 1 同様、直交機構）
> ✅ Automated by `packages/core/src/renderer/expand-render.test.ts`

### AC-5: 深い入れ子展開は不採用

- [x] 展開ノードの内部 domain をさらに展開する UI は提供しない — ⊕ は `renderExpandControls` の `node.kind === "service"` gate により service ノードにのみ付く（domain には付かない）
> ✅ Automated by `packages/core/src/renderer/expand-render.test.ts`

### AC-6: 手動確認

- [ ] **[人間確認]** live app で大きめの生成図の複数 service を ⊕ 展開し、フレームが重ならず・エッジが自フレーム/domain に接続し他フレームを貫通しないこと、多数展開時に警告ヒントが出て「Collapse all」で俯瞰へ戻れることを確認する
