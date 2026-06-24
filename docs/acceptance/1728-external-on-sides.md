# AT-1728: System-view external-on-sides layout

- **日付**: 2026-06-24
- **Issue**: #1728
- **PR**: なし（実装 PR で追記）
- **関連ADR**: [ADR-20260623-06](../adr/20260623-06-system-view-infra-external-tier-split.md)（本変更が refine）
- **Related TPLs**: [TPL-20260624-04](../test-perspectives/TPL-20260624-04-external-side-placement-invariant.md)（external サイド配置の不変条件）, [TPL-20260623-04](../test-perspectives/TPL-20260623-04-tier-split-no-edge-penetration.md)
- **対象**: `packages/core/src/renderer/layout.ts`（`placeExternalServicesOnSides`）, `docs/spec/style.md`（`column`）, `examples/en/hato/`（実モデル測定用、`index.krs` + `hato.krs.style`）

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

実モデルは `examples/en/hato/index.krs`（+ `hato.krs.style`）をコミットして測定対象にする。3 つの front/back hub（WebApp / HatoMcp / HatoApi）が owned infra と external SaaS にファンアウトする hato 構成。

- [x] `examples/en/hato/index.krs`（system view）で `[external]` 6 件がすべてサイド列に置かれ（HatoApi が消費する 5 件は consuming-hub auto 振り分けで左、front-door 共有の `CloudflareAccess` は `#CloudflareAccess { column: right }` で右へ override）、external-on-sides + inner-side アンカーでエッジ交差が **0**（15 エッジ）。bottom-band baseline（Design Doc PoC の hato 計測で 33 交差）から解消
> 🟡 Partially automated — 配置・側・アンカーの不変条件は `layout.test.ts` で自動化。`examples/en/hato/index.krs` 実モデルの交差数は `karasu render examples/en/hato/index.krs --view system` 出力で測定。視覚的可読性は人間レビュー。
- [x] 同一 `.krs` で配置が決定的（再レンダリングで変わらない）
> 🟡 Partially automated — レンダリングは決定的（`Math.random`/時刻非依存）。スナップショット安定性は guide 図の round-trip テストでも担保。

### AC-5: サイド external のエッジは内側アンカーで矢印が内向き

- [x] 左サイドの external へのエッジは external の**右辺**に着地（矢印頂点が右＝内向き）、右サイドは**左辺**に着地（矢印頂点が左＝内向き）
> ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `anchors side-external edges on the external's inner side, arrowhead inward (#1728)`

## 検証方法

- 自動: `pnpm --filter @karasu-tools/core test -- layout`（AC-1〜AC-3, AC-5）。
- 手動 / 測定: `node packages/cli/dist/index.js render examples/en/hato/index.krs --view system -o /tmp/hato.svg` の出力で external のサイド配置・矢印の内向き・交差数を確認（AC-4。実測 0 交差、viewBox 1490×1060）。
