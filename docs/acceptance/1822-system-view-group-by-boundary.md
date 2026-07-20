# AT-1822: Group by boundary — the declared-boundary grouping axis (system view, P2b-B)

- **日付**: 2026-07-15
- **Issue**: #1822（umbrella / Epic #1817 comprehension）
- **PR**: (P2b-B — axis wiring)
- **設計**: [docs/design/system-view-grouping.md](../design/system-view-grouping.md)「P2b 詳細設計」
- **Related TPLs**: [TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md)（新 group-by 軸を全 `groupBy` call site へ通す — 一つでも漏れると軸が黙って落ちる）, [TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md)（全要素ちょうど一度配置 + 参照エッジ端点保持）
- **対象**: `packages/core/src/renderer/layout.ts` / `svg-renderer.ts` / `index.ts` / `all-layers-svg.ts` / `drill-down-svg.ts`、`packages/app`（`useSystemView` / `useAppViews` / `PreviewColumn` / preview-context 配線）

## 概要

P2b-A で追加した `boundary` 宣言（`boundaryIndex`）を **第二の Group-by 軸**として配線する。`groupBy: "boundary"` を選ぶと、宣言された `boundary` ごとにノードを束ね、P2a（team 軸）と同じ二段トポロジカルレイアウト・境界フレーム・折り畳み・P2c ルーティングをそのまま再利用して描く。team 軸（`ownerIndex`）とは**排他・独立**で、`ownerIndex` は軸に関わらず常にカードの team バッジ源として残る。experimental notation（ADR-1820）。

## 受け入れ条件

### AC-1: boundary 軸で境界フレームが出る（core, compile e2e）

- [x] `groupBy: "boundary"` で宣言 `boundary` ごとに境界フレーム（`data-container-id="__group_<boundaryId>__"`）が1つずつ出る
> ✅ Automated by `packages/core/src/renderer/group-by-boundary-render.test.ts`
- [x] grouped でも全ノードがちょうど一度描かれる（TPL-20260624-02 の全域性 — team 軸と同じ機構を継承）
> ✅ Automated by `packages/core/src/renderer/group-by-boundary-render.test.ts`
- [x] `groupBy` 未指定は option 無しと **byte 一致**（opt-in・後方互換・回帰なし）
> ✅ Automated by `packages/core/src/renderer/group-by-boundary-render.test.ts`
- [x] `boundary` の無いモデルでは `groupBy: "boundary"` でも既定レイアウトに一致（フォールバック）
> ✅ Automated by `packages/core/src/renderer/group-by-boundary-render.test.ts`

### AC-2: 軸の独立性（team ⊥ boundary）

- [x] 同じノードが team A・boundary X の両方に属していても、`groupBy: "boundary"` は boundary で束ね、team フレームは出さない
> ✅ Automated by `packages/core/src/renderer/group-by-boundary-render.test.ts`
- [x] `groupBy: "team"` は `boundary` 宣言があっても owns で束ねる（team バッジは両軸で不変）
> ✅ Automated by `packages/core/src/renderer/group-by-boundary-render.test.ts`

### AC-3: 全 `groupBy` サーフェスへの配線（回帰・parity）

- [x] `layout()` / `layoutMultipleSystems()` / `svg-renderer` / `index.ts`（単一 + diff）/ `all-layers-svg` / `drill-down-svg` の `groupBy` 型が `"team" | "boundary"` に拡張され、`boundaryIndex` が全 render 経路に通っている（TPL-20260510-11）
> ✅ Automated — 既存 core スイート全体（2292 tests）が軸追加後も無変更で通過（既存 team snapshot 不変）
- [x] team 軸の既存挙動は byte 不変（`groupIndex` は軸選択のみで team ロジックを変えない）
> ✅ Automated by `packages/core/src/renderer/group-by-render.test.ts`（team snapshot 不変）/ `group-by-boundary-render.test.ts`（team 軸独立）

### AC-4: app の Group-by セレクタ（data-driven 可視性）

- [x] `boundary` を宣言したモデルで system view の「Group by」に **Boundary** 選択肢が出る（`hasBoundaryAxis` ゲート）
> ✅ Automated by `packages/app/src/components/PreviewColumn.test.tsx`
- [x] 選択肢は**データがある軸のみ**表示 — org のみ → Team のみ、boundary のみ → Boundary のみ、両方 → 両方（None は常時）
> ✅ Automated by `packages/app/src/components/PreviewColumn.test.tsx`
- [x] Boundary を選ぶと `groupBy: "boundary"` で再コンパイルされる（off-sentinel gate: `groupBy === "none" ? undefined : groupBy`）
> ✅ Automated by `packages/app/src/components/PreviewColumn.test.tsx`（`onGroupByChange("boundary")`）
- [x] ラベルは i18n 経由（`preview.groupBy.boundary`、en/ja 両方 — key 欠落は typecheck 失敗）
> ✅ Automated — `packages/i18n` の型で全ロケール網羅を強制

### AC-5: 手動（描画の目視確認）

feature-samples の `boundary-clusters.krs`（P2b-C で追加）を app で開く（`examples/en/feature-samples/boundary-clusters.krs` — payments / catalog の 2 boundary、org なし）:

- [ ] **手動**: system view の「Group by」を **Boundary** に切り替える → payments / catalog が破線フレームで囲まれる。None に戻すと従来表示に戻る
- [ ] **手動**: org を持たないこのモデルでは「Group by」に Team は出ず、Boundary と None のみが並ぶ
- [ ] **手動**: フレームの ⊖ で boundary が `Boundary (N)` に畳まれ、⊕ で戻る（team 軸と同じ折り畳み機構）
