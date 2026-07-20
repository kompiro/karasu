---
id: ADR-1884
title: "multi-system root view でも Group by: team を効かせる（per-(system, team) 境界フレーム）"
status: accepted
date: 2026-07-16
topic: renderer
related_to: [ADR-1858, ADR-1859]
scope:
  concerns: []
---

# ADR-1884: multi-system root view でも Group by: team を効かせる（per-(system, team) 境界フレーム）

- **日付**: 2026-07-16
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#1884](https://github.com/kompiro/karasu/issues/1884)（P2a follow-up bug、親 epic [#1817](https://github.com/kompiro/karasu/issues/1817) comprehension）
  - 前提 ADR: [ADR-1858](1858-system-view-group-by-team.md)（P2a: team 軸グループ化。本 ADR はそれを multi-system root view にも通す follow-up）
  - 実装 PR: #1906（`layoutMultipleSystems` に per-system grouping を注入）/ #1915（collapsed-stub id を生成時点で per-system namespace 化）
  - 設計（本 ADR に集約し削除）: `docs/design/system-view-grouping.md` § 「multi-system root view の grouping」
  - TPL: [TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md)（並列関数ファミリの parameter parity — 本 bug の失敗クラス）, [TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md)（再配置で全要素ちょうど一度 + 枠 disjoint + 参照エッジ端点保持）
  - コード: `packages/core/src/renderer/layout.ts`（`layoutMultipleSystems`）/ `group-collapse.ts`

## 背景

P2a（ADR-1858）は `layout()` の **single-system focus 分岐**にだけ grouping 機構（`collapseGroups` + `assignGroupedLayers` + 境界フレーム）を実装し、**multi-system root view 分岐**（`layoutMultipleSystems`）には `groupBy` / `collapsedGroups` を渡していなかった（signature にも無かった）。結果、**system を 2 つ以上宣言した瞬間**（＝ cross-system ghost エッジが存在する状況と一致する。ghost エッジは参照先の第 2 system を要求するため）root view の team 境界フレームと per-team collapse が黙って消え、利用者からは「ghost エッジがあると Group by: team が壊れる」ように見えていた。

これは [TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md)（並列関数ファミリの parameter parity）の失敗クラスそのもの — dispatch する分岐にも「兄弟」があり、options は全分岐へ通す必要があった。

## 決定

grouping を **各 system フレームの内側**に適用する（**per-(system, team) フレーム**）。root view は各 system を独立に side-by-side 配置する（`layoutMultipleSystems` は system ごとに独自 tier layout + 座標オフセット + 枠を持つ）ので、grouping もその per-system の枠内で完結させる。

- team が 1 つの system 内だけで `owns` するなら、その system フレーム内に境界フレームが 1 つ。
- team が**複数 system をまたいで** `owns` する場合（`owns` の対象は system-scoped ではない）、**各 system フレーム内に 1 つずつ**フレームを描く（同一ラベル・disjoint な複数フレーム）。「Shop 内の payments チーム」と「PaymentGateway 内の payments チーム」は視覚的に別枠だが同じチーム名を共有する — 正直な表現。

実装は `layoutMultipleSystems` の per-system ループに grouping を注入する（`groupBy === "team"` gate 内）: この system のノードに `collapseGroups`（`collapsedGroups` 対応）→ `assignGroupedLayers` → grouped layers で tier layers を置換 → 配置後に per-(system, team) の `__group_<team>__` ContainerRect を組む。single-system 分岐と**同じヘルパ**を使うので見た目は一致し、ungrouped / single-system 出力は gate により byte-identical（回帰なし）。

### 退化ケースの fence（実装で担保）

- **collapsed かつ cross-system edge を持つ team**: collapse でメンバーが stub に畳まれると、そのメンバーを端点に持つ cross-system edge が `crossSystemEdges` の端点解決に失敗して黙って drop される。per-system の collapse remap を全 system 分蓄積した `crossSystemRemap` で端点を stub に再アンカーし drop を防ぐ（TPL-20260624-02「畳んだノードの edge は両端点を解決」）。再ターゲットされた edge のみ dedup。
- **collapsed かつ system をまたぐ team**: 各 system が同じ `__group_collapsed_<team>__` stub id を生成すると、後段 system の stub が前段を上書きして 1 ノードを失う（全域性違反）。`collapseGroups` に `stubScope`（= system id）を渡し、multi-system では stub id を**生成時点で** `__group_collapsed_<sys>_<team>__` と system 単位に namespace する（single-system は scope なしで従来 id）。衝突検出や後付け rewrite を持たず構造的に一意（#1915）。frame id（`__group_<team>__`）は team 単位で共有のまま（app の「全 system 一括 collapse」が team id キーで効く意図どおり）。

## 理由

- **per-system フレーム**は `layoutMultipleSystems` の「system は独立に配置される」前提をそのまま活かせ、single-system と同じヘルパで実装できる（見た目一致・回帰なし）。
- **stub id を生成時点で namespace** するのは、衝突検出や後付け rewrite より構造的に安全（一意性が生成規則で保証される）。frame id は team 単位のまま残すことで app の一括 collapse 意図と両立する。

## 却下した案

- **cross-system をまたぐ 1 枚のフレーム** — 1 つの team フレームが複数の side-by-side system フレームをまたいで囲む案。`layoutMultipleSystems` の「system は独立」前提を崩し（配置空間を共有）、フレーム矩形が system フレームと**重なる**ため TPL-20260624-02 の「全要素ちょうど一度・枠は disjoint」不変条件を壊す。大幅な re-architecture でリスクが見合わないため却下し、per-system フレームを採る。

## 補足: スコープ外

- **P2c ルーティング（直交・集約トランク・hop/junction）の multi-system への適用** — multi-system はそもそも orthogonal routing を使わず直線エッジ（`computeEdgePoints`）で描いており、本修正も直線のままとする（P2c の marks/routing は single-system 限定。ADR-1859 参照）。root view の grouped エッジ磨き込みが必要になれば別 Issue。
