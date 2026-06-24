---
id: ADR-20260624-02
title: deploy view は job-only container を専用の job 帯にまとめる（kind band 第一歩）
status: accepted
date: 2026-06-24
topic: renderer
related_to:
  - ADR-20260408-02
  - ADR-20260327-01
  - ADR-20260616-12
  - ADR-20260624-01
scope:
  concerns: []
---

# ADR-20260624-02: deploy view は job-only container を専用の job 帯にまとめる（kind band 第一歩）

- **日付**: 2026-06-24
- **ステータス**: 決定済み（実装済み — #1749、follow-up #1753）
- **関連**:
  - 引き金 Issue: [#1738](https://github.com/kompiro/karasu/issues/1738)
  - [ADR-20260408-02](20260408-02-deploy-layout-hierarchical-dag.md)（Longest Path Layering / 幅問題の解決）
  - [ADR-20260327-01](20260327-01-deployment-diagram-design.md)（deploy diagram design / flat container grouping / ghost edges）
  - [ADR-20260616-12](20260616-12-deploy-infra-dependency-edges.md)（service→infra ghost edges）
  - [ADR-20260624-01](20260624-01-balanced-grid-sibling-layout.md)（balanced-grid。同層内配置を共通化。本 ADR の実装はこの上に乗る）
  - 関連 TPL: [TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md)（主構造から抜き出して再配置する際の不変条件）
  - コード: `packages/core/src/renderer/deploy-layout.ts`, `packages/core/src/view/deploy-view-extract.ts`

## 背景

deploy view のレイアウトは **dependency-driven** で、kind ベースのグループ化を持たなかった（ADR-20260408-02）。ユニットは `realizes` で container にまとめられ、container は ghost edge 上の Longest Path Layering で縦に層化される。

`hato` の deploy view を描画して観測した症状:

- **store（infra）は既に最下部にクラスタ** — store は依存のリーフなので自然に沈む。
- **compute（oci）は最上部** — 依存の根。
- **`job`（cron）が散らばる** — 各 job が `realizes` するドメインの依存深度で配置されるため（`weekly-feedback` は上段、`daily-retitle` は中段…）。スケジュール job が一つの運用グループとして読めない。これが最も明確な可読性ギャップだった。

動機は **semantic grouping / cross-face consistency** であって幅ではない（幅は ADR-20260408-02 で解決済み）。

## 決定

**job-only container（その container のユニットが全て `kind === "job"`）だけを Longest Path Layering の DAG から外し、compute/store の DAG の下・`__unclassified__` row の上に置く専用の「job 帯」に集約する。** compute は依存 DAG のまま、store は自然に沈むので触らない（候補 C）。

確定した詳細:

1. **帯の判定単位**: job-only container のみ。混在 container（job + 他 kind）は帯に入れず DAG に残す（`realizes` ラベル単位の一塊を崩さない）。判定は `extractDeployView` で行い、`DeployContainer.kindBand?: "job"`（将来 `"infra"` 等に拡張可能な enum）として持つ。
2. **帯の位置**: DAG の下、`__unclassified__` の上。
3. **依存エッジを持つ job container（稀）**: job-only である限り帯に集める。ghost edge は container id で端点解決するため、帯をまたいでルーティングされる。
4. **視覚表現**: 位置クラスタ化 + ラベル付き ghost wrapper container（`__job_band__`、`data-kind-band="job"`）。背景色・style-system 統合（#30）・視覚スイムレーン（候補 D）は対象外。
5. **キャプションの i18n**: 帯および unclassified のキャプションは `EmptyStateLabels`（`deployJobBand` / `deployUnclassified`、`packages/i18n` の en/ja キー）の pass-through で供給する（`docs/spec/i18n.md` 準拠。英語定数は CLI/テスト用の fallback）。
6. **実装は ADR-20260624-01（balanced-grid）の上**: 同層内配置を共通ヘルパー `placeGroupBlock` に集約し、DAG 層・job 帯・unclassified が同一の wrap/grid 規則を共有する。

## 理由

- **job ≠ store（C ≠ B の原則的根拠）**: job の DAG 位置は *accidental* — `realizes` 先ドメインの依存深度で決まるだけで意味がない（だから散らばる）。一方 store の DAG 位置は *meaningful* — ADR-20260616-12 が意図的に service→infra 依存を描き「どの service がどの store に依存するか」を層の近接で表す。store を帯に抜くとこの依存シグナルを捨てる。job の帯化は無意味な配置を意味ある運用グループに変える純粋な改善。
- **deploy view は物理ビュー**: その価値は依存 DAG。compute を一律帯に潰すと核が壊れる。job だけを抜くので DAG は保たれる。
- **最小変更で痛点を直撃**: 既存の compute/store 層化に手を入れず、観測された「job の散らばり」だけを解消する。
- **段階的拡張**: `kindBand` enum と帯機構は、将来 infra 帯の正式化（候補 B）へ拡張できる形にした。

## 却下した案

- **案 A（全 kind 帯: compute → store → job 一律）**: 依存 DAG を平坦化し deploy view の核を壊す。store は既にクラスタするので冗長。`realizes` container と競合。
- **案 D（視覚スイムレーンのみ）**: 低リスクだが位置を動かさないため job の散らばり（本質的痛点）を解決しない。
- **案 B（store/infra 帯の正式コード化）**: 本 ADR では見送り。store は現状 emergent に沈むので C で痛点は解消する。上記の job ≠ store の理由から、store の帯化は意味ある依存構造の破壊になりうる。job 帯の運用実績を見てから別 Issue で評価する。

## 結果

- job を含む deploy view の縦配置が変わり、scheduled job が一塊で読める。job を含まない図は不変（後方互換）。
- `kindBand` / `data-kind-band` フックを残したので、将来の視覚レイヤ（背景帯・色）を layout 再設計なしに追加できる。
- 同層内配置が `placeGroupBlock` に一本化され、DAG・帯・unclassified の wrap/grid 規則の drift を防ぐ。

## 将来の読者への注意

- 帯機構を infra など他 kind に広げるとき（候補 B）は、その kind の DAG 位置が *meaningful* か *accidental* かを必ず判定する。意味ある依存構造を持つ kind を帯に抜くと情報を失う。
- 帯のような「主構造から要素を抜き出して別グループに再配置する」変更は、全要素がちょうど一度配置されること・参照エッジの端点が保たれることを必ず検証する（[TPL-20260624-02]）。
