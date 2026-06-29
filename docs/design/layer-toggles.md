# layer toggles: external / infra カテゴリの表示トグル

- **Issue**: [#1821](https://github.com/kompiro/karasu/issues/1821)（親 Epic [#1817](https://github.com/kompiro/karasu/issues/1817) comprehension）
- **PR**: #（後で反映）
- **日付**: 2026-06-28
- **ステータス**: 検討中

## 背景・課題

comprehension 柱（[#1817](https://github.com/kompiro/karasu/issues/1817)）で、大規模／AI 生成図の「壁」は**縦の深さではなく横の密度**だと整理した（縦は drill-down が既にカバー）。system view の root は service / infra / external ノードが多数並び、越境 edge が混雑する。最も安く密度を下げる手が「**カテゴリ単位で表示/非表示**を切り替える」レイヤートグル（地図のレイヤーのように）。本 Design Doc はその v1（external / infra）の設計を残す。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| カテゴリの実体 | `systemTier()`（`layout.ts`）が kind/タグで 5 ティアに分類（user/client/service/**infra**/**external**）。[ADR-20260623-06](../adr/20260623-06-system-view-infra-external-tier-split.md) で infra(3) と external(4) を分離済み。infra = `INFRA_KIND_SET`（database/queue/storage）、external = `tags.includes("external")` |
| external の配置 | `placeExternalServicesOnSides()` で左右サイド列に置く（[ADR-20260624-06](../adr/20260624-06-external-on-sides-layout.md)） |
| render entry | `render(viewSlice, …, options?: RenderOptions)` が `layout()` を呼ぶ。root 複数 system は `layoutMultipleSystems` の**別経路**（早期 return） |
| 描画オプション | `RenderOptions` / `CompileOptions` に `displayMode` `theme` 等。`compile()` → `render()` → `layout()` と伝播 |
| edge | `computeLayoutEdges()` は endpoint が `layoutNodes` に無ければ自動で drop |
| app トグル前例 | `isAllLayersOpen` / `displayMode` = AppShell の local state → preview context → PreviewColumn / useSystemView |
| legend | usage 駆動（描画されたノード種別から構築）。`legendUsage` |
| 他描画面 | `/render`（`share-render.ts`）、export-svg、CLI、full-view-svg が同じ core を使う |

## 制約・前提

- **非破壊な view フィルタ**: `.krs` を一切変更しない（round-trip 保持、[TPL-20260510-02]）。keystone の「view state を model に持たせない」とも整合。
- **system view 専用**: external/infra は system view の概念。deploy/org には無い → トグル UI は system view のときだけ出す。
- **cross-surface 一貫性**（[TPL-20260510-06]）: グローバル描画トグルは app / `/render` / export / CLI の全描画面で矛盾なく振る舞う必要がある。option を渡さなければ「全表示」が既定。
- **カテゴリ集合は拡張可能**: v1 は `external` / `infra` の 2 つ。将来 users/clients/edge クラスを足せる string ベースの `CategoryId`。
- out of scope: app の Share ボタンが現トグル状態を共有 URL に埋め込む配線（follow-up）。

## 検討した選択肢

### 案A: renderer-side option + pre-layout の viewSlice フィルタ（推奨）

`RenderOptions`/`CompileOptions` に `hiddenCategories?: Set<CategoryId>` を足し、**`render()` 内で `layout()` 呼び出しの直前に viewSlice を pure 関数で絞る**（隠すカテゴリの node と、それに触れる edge を除去）。app はトグル UI と view-state を持ち、option を core へ渡すだけ。

**メリット**
- app / `/render` / export / CLI が**同一実装で honor**（cross-surface 一貫性、[TPL-20260510-06]）。
- **pre-layout なので reflow**（穴が残らない）。edge は `computeLayoutEdges` の既存ガードで自動 drop。
- `render()` の一点で絞るので、単一 system も `layoutMultipleSystems`（root 複数 system）も**両経路を一様**に扱える。`layout()` のシグネチャを変えない。
- legend が usage 駆動なら、フィルタ後に usage を計算すれば legend からも自然に落ちる（[TPL-20260510-05] の暗黙フィルタ点検に合致）。

**デメリット**
- core に新オプションが増える（ただし `displayMode` 等と同列で、前例どおり）。

### 案B: app だけで描画後に DOM/CSS で hide

**メリット**: core を触らない。
**デメリット**: **reflow しないので穴が残る**（横密度が下がらず目的を達さない）。`/render`・export・CLI が無視し cross-surface 一貫性を破る（[TPL-20260510-06] 違反）。legend/detail も残る。→ 不採用。

### 案C: `layout()` に 6th 引数を足す

**メリット**: 局所的。
**デメリット**: positional 引数の肥大化。さらに root 複数 system は `layoutMultipleSystems` の別経路で、両方に引数を通す二重配線が要る。→ 案A の「render で一点フィルタ」のほうが薄い。不採用。

## 比較

| 観点 | 案A pre-layout filter | 案B DOM hide | 案C layout 引数 |
| --- | --- | --- | --- |
| reflow（穴を残さない） | ◎ | ✕ | ◎ |
| cross-surface 一貫性 | ◎（core 一点） | ✕ | ○ |
| 両 layout 経路を一様に | ◎（render で一点） | ◎ | ✕（二重配線） |
| legend/detail 連動 | ◎（filter→usage） | ✕ | ○ |
| 変更の薄さ | ○ | ◎ | △ |

## Related TPLs

- [TPL-20260510-06](../test-perspectives/TPL-20260510-06-display-mode-cross-surface.md) — グローバル描画トグルは全描画面の点検 + precedence 設計が必須。`hiddenCategories` は layout/svg-builder/legend/export/useSystemView 等に影響するため、known_consumers を横断点検する。
- [TPL-20260510-05](../test-perspectives/TPL-20260510-05-implicit-data-filtering.md) — 暗黙の表示フィルタは legend / node-detail / matrix / org-view の全経路で確認する。ノードを隠すとき legend/detail にスタール表示が残らないことを検証。
- [TPL-20260623-04](../test-perspectives/TPL-20260623-04-tier-split-no-edge-penetration.md) — ティアのノード集合が変わったら、残る段跨ぎ edge が中間カードを貫通しないことを検証（フィルタ後レイアウト）。
- [TPL-20260510-02](../test-perspectives/TPL-20260510-02-round-trip-guarantee.md) — view フィルタは `.krs` を変更しない（round-trip 保持）。
- [TPL-20260519-02](../test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md) — infra kind と `[external]` タグの二重表現。カテゴリ判定は `systemTier` を単一の真実として再利用する。

> 既存 TPL が本設計のリスク（cross-surface / 暗黙フィルタ / edge 貫通 / round-trip）を被覆するため、新規 proactive TPL は起こさない。

## 現時点の方針

**案A を採用**。

### 実装の指針

- core: `RenderOptions` + `CompileOptions` に `hiddenCategories?: Set<CategoryId>`（`CategoryId = "external" | "infra"`、拡張可能）。`render()` 内で `layout()` 直前に `filterViewSliceByCategory(viewSlice, hiddenCategories)`（新 pure 関数）。カテゴリ判定は `systemTier` と同規則を再利用。
- legend: フィルタ後に usage を計算する順序を担保し、隠したカテゴリが legend からも落ちることを確認（[TPL-20260510-05]）。
- app: `AppShell` に `hiddenCategories` view-state（`isAllLayersOpen` と同パターン）→ preview context → `PreviewColumn` の **system view 限定**トグルボタン（アイコン+ラベル、`aria-pressed`）→ `useSystemView` が `compileProject` へ渡す。
- `/render`: `share-render.ts` が `hiddenCategories` query param を parse して compile option へ（option 無し＝全表示で既定一貫）。

### 影響範囲・マイグレーション

- 後方互換: option 未指定時は挙動不変（全表示）。`.krs` 形式・既存スナップショットに影響なし。
- 検証面（[TPL-20260510-06] known_consumers）: layout / svg-builder / legend-footer / node-detail-panel / full-view-svg / export-svg / useSystemView を横断確認。

## 未解決の問い / 決めないこと

1. **`/render`・共有 URL の扱い**: core option は `/render` で honor 可能。v1 で `/render` の query param まで入れるか、それとも app トグルのみで `/render` は follow-up か。（[TPL-20260510-06] は「option を渡したら全面で一貫」を要求するが、UI 露出までは強制しない）
2. **legend を明示フィルタするか**: usage 駆動で自然に落ちる想定だが、計算順序次第。実装時に確認し、自然に落ちなければ明示フィルタを足すか。
3. **トグルの粒度**: v1 は external / infra の 2 ボタンで確定。将来の users/clients/edge は拡張点だけ用意して v1 では出さない、で良いか。
