# AT-1724: System-view infra/external tier split

- **日付**: 2026-06-23
- **Issue**: #1724
- **PR**: [#1736](https://github.com/kompiro/karasu/pull/1736)
- **関連ADR**: [ADR-20260623-06](../adr/20260623-06-system-view-infra-external-tier-split.md)（本変更の決定）, ADR-20260429-02（dep pull-up — 本 ADR が refine）, ADR-20260429-01（skip-layer 直交ルーティング）
- **Related TPLs**: [TPL-20260623-04](../test-perspectives/TPL-20260623-04-tier-split-no-edge-penetration.md)（proactive — ティア分割で段跨ぎエッジが中間カードを貫通しないこと）, [TPL-20260519-02](../test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md)（`database` 語彙と `[external]` タグの二重表現）
- **対象**: `packages/core/src/renderer/layout.ts`（`systemTier` / `assignForcedSystemLayers`）

## 概要

system view の dep ティア（infra + `[external]` を 1 行に詰め込む）を、**infra 行**と**その下の external 行**の 2 段に分割する。ノード数の多いモデルで横幅が爆発する問題（#1724）を解消する。設計判断は [ADR-20260623-06](../adr/20260623-06-system-view-infra-external-tier-split.md)。

## 受け入れ条件

### AC-1: infra と external の段分離

> ✅ Automated by `packages/core/src/renderer/layout.test.ts` (suite-wide)

- [x] infra（`database`/`queue`/`storage`）は内部サービスの下の 1 行に並ぶ
- [x] `[external]` サービスは infra 行の**下の別行**に置かれる（同一行に併合しない）
- [x] 単一サービスが infra と external を両方使う場合も、両者は別行に分離される（hato パターン）

### AC-2: `database [external]` の所属（境界ルール: kind がタグに優先）

- [x] infra kind（`database`/`queue`/`storage`）は `[external]` タグの有無に関わらず常に infra 行に置かれる（external 行へ昇格しない）。infra は定義上 system 境界の内側にあり、external 行は別 system のノード専用。タグはスタイルを変えるがティアは変えない
> ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `keeps a database [external] on the infra row, not the external row (kind wins over tag) (#1724)`

### AC-3: 縮退・回帰

> ✅ Automated by `packages/core/src/renderer/layout.test.ts` (suite-wide)

- [x] external のみのモデル（infra なし）で、空 infra 行による phantom gap が生じない（external が service 直下に来る）
- [x] infra のみのモデルは従来どおり（service の下に infra 1 段）
- [x] 既存の dep pull-up（#974）が温存される: 上位サービスだけが使う infra は consumer 直下に引き上げられる（`pulls a dep used only by an upper service…` / `places a shared dep just below its deepest consumer`）
- [x] column-hint（#969）の x 位置契約が無変更で通る

### AC-4: ティア分割で段跨ぎエッジが中間カードを貫通しない（TPL-20260623-04）

- [x] external を infra の下段に分けても、新たに段を跨ぐ `service → external` エッジは中間カードを直線貫通せず、直交チャネルルーティング（ADR-20260429-01）で救済される（TPL-20260623-04）
> ✅ Automated — `packages/core/src/renderer/edge-routing-channels.test.ts`（skip-layer 直交ルーティング）
- [x] external 用の固定バンドが既存 infra の #974 pull-up を抑止していない（TPL-20260623-04）
> ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `pulls a dep used only by an upper service up to one row below its consumer (Issue #974)`
- [ ] shape / icon 両 displayMode でティア構造が成立する（TPL-20260623-04 / TPL-20260510-06）

### AC-5: 幅削減（実モデル）

- [ ] `hato` の `index.krs`（system view）が分割前 3136×892（≈3.52:1）から、アスペクト比 ≈2:1 以下に改善する
> 🟡 Partially automated — `karasu render hato/index.krs --view system` の viewBox を測定して確認（実測値 1793×1096 ≈ 1.64:1）。視覚的な可読性判定は人間レビューに残す。

## 検証方法

- 自動: `pnpm --filter @karasu-tools/core test -- layout`（AC-1〜AC-3, AC-4 の一部）。
- 手動 / 測定: `node packages/cli/dist/index.js render <hato>/index.krs --view system -o /tmp/out.svg` で出力 viewBox を確認（AC-5）。icon モードは `--view system` のレンダリングを目視（AC-4 の displayMode 項）。
