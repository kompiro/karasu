# AT: Infra/external nodes pulled up to the row of their deepest consumer

- **日付**: 2026-04-29
- **関連 Issue**: [#974](https://github.com/kompiro/karasu/issues/974)（親 [#966](https://github.com/kompiro/karasu/issues/966)）
- **対象ファイル**: `packages/core/src/renderer/layout.ts`
- **設計**: `docs/design/auto-layout-infra-by-consumer.md`
- **姉妹**: [AT-0967](./0967-actor-row-by-first-target.md)（A — actor row by first target）

## 受け入れ条件

- [x] 上段のサービスのみが消費する dep（infra/external）は、その消費者の直下行に引き上げられる
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `pulls a dep used only by an upper service up to one row below its consumer (Issue #974)`

- [x] incoming edge を持たない dep は従来通り bottom tier の既定位置に残る
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `keeps a dep with no incoming edges at the bottom-tier default (Issue #974)`

- [x] 複数の consumer に共有された dep は最も深い consumer の直下行に置かれる
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `places a shared dep just below its deepest consumer (Issue #974)`

- [x] dep の引き上げは strictly upward（dep を下方向に押し下げない）
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `does not push a dep down when its source is below it (Issue #974, downward-safe)`

- [x] dep が別の dep に消費されるチェーン（例: `Backend → Stripe → Auth`）でも、宣言順に依らず正しく伝播する
  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `propagates pull-up through a dep-on-dep chain regardless of declaration order (Issue #974)`

- [ ] 既存の図（深いサービスチェーンを含まない一般的な構成）で目視で regression が無いこと
  > 🧑 Manual — Preview URL（`https://feat-auto-layout-infra-by-consumer.karasu.pages.dev`）または `pnpm dev` で Getting Started サンプルを開き、視覚的に確認する。

## 補足

- 本 post-pass は `assignForcedSystemLayers()` の最終段で動き、既存の actor pull-down（[AT-0967](./0967-actor-row-by-first-target.md)）と対称な構造を持つ。
- 固定点反復で実装しており、`dep1 → dep2 → dep3` のような連鎖が宣言順に依らず収束する。反復回数は `byTier[3].length` で打ち切る。
