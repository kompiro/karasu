# AT-1728: System-view external-on-sides layout

- **日付**: 2026-06-24
- **Issue**: #1728
- **PR**: なし（実装 PR で追記）
- **関連ADR**: [ADR-20260623-06](../adr/20260623-06-system-view-infra-external-tier-split.md)（本変更が refine）
- **Related TPLs**: [TPL-20260624-03](../test-perspectives/TPL-20260624-03-external-side-placement-invariant.md)（external サイド配置の不変条件）, [TPL-20260623-04](../test-perspectives/TPL-20260623-04-tier-split-no-edge-penetration.md)
- **対象**: `packages/core/src/renderer/layout.ts`（`placeExternalServicesOnSides`）, `docs/spec/style.md`（`column`）

## 概要

system view で `[external]` サービスを最下段バンドではなく左右のサイド列に配置し、`service → external` エッジを水平化して infra への下向きファンアウトとの交差を減らす（#1728、[ADR-20260623-06] を refine）。サイドは consuming-hub の x 重心で自動振り分け、`column: left/right` で override 可能。

## 受け入れ条件

### AC-1: external がサイド列に配置される

> ✅ Automated by `packages/core/src/renderer/layout.test.ts` (suite-wide)

- [x] `[external]` サービスは最下段の行ではなく、in-boundary ノードの水平スパン外（左右のサイド列）に配置される
- [x] infra（`database`/`queue`/`storage`）は従来どおり service の下の行に残る
- [x] infra が無いモデルでも external はサイドに置かれる（service の下ではない）

### AC-2: サイド振り分け（consuming-hub）と override

> ✅ Automated by `packages/core/src/renderer/layout.test.ts` (suite-wide)

- [x] 各 external は consume するハブの x 重心に応じた側へ自動振り分けされる（別ハブの fan を左右に分離）
- [x] `column: left` / `column: right`（`.krs.style`）が自動振り分けを override する

### AC-3: 境界ルール・回帰

> ✅ Automated by `packages/core/src/renderer/layout.test.ts` (suite-wide)

- [x] `database [external]` は infra 行に留まる（kind がタグに優先、[ADR-20260623-06] の境界ルール）
- [x] 既存の infra tier 配置（#1724）と infra pull-up（#974）が無変更で通る

### AC-4: 交差削減（実モデル・決定性）

- [ ] `hato` の `index.krs`（system view）でエッジ交差が baseline から大きく減る（実測: 35 → 7）
> 🟡 Partially automated — `karasu render <hato>/index.krs --view system` の出力でエッジ交差を測定して確認（実測 7、baseline-grid 35）。視覚的可読性は人間レビュー。
- [ ] 同一 `.krs` で配置が決定的（再レンダリングで変わらない）
> 🟡 Partially automated — レンダリングは決定的（`Math.random`/時刻非依存）。スナップショット安定性は guide 図の round-trip テストでも担保。

## 検証方法

- 自動: `pnpm --filter @karasu-tools/core test -- layout`（AC-1〜AC-3）。
- 手動 / 測定: `node packages/cli/dist/index.js render <hato>/index.krs --view system -o /tmp/out.svg` の出力で交差数・サイド配置を確認（AC-4）。
