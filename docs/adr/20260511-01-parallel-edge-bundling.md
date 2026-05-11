---
id: ADR-20260511-01
title: 同一ペア間の並列エッジ束ね
status: accepted
date: 2026-05-11
topic: edges
related_to: [ADR-20260429-01, ADR-20260506-02, ADR-20260506-03, ADR-20260509-05]
assumptions:
  - "file: packages/core/src/renderer/edge-routing-bundles.ts"
  - "symbol: packages/core/src/renderer/edge-routing-bundles.ts :: markParallelBundles"
  - "grep: packages/core/src/renderer/layout-types.ts :: bundleIndex"
  - "grep: packages/core/src/renderer/edge-routing.ts :: bundleSize"
---

# ADR-20260511-01: 同一ペア間の並列エッジ束ね

- **日付**: 2026-05-11
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1185](https://github.com/kompiro/karasu/issues/1185)（親 brainstorm [#1071](https://github.com/kompiro/karasu/issues/1071)）
  - 設計 PR [#1187](https://github.com/kompiro/karasu/pull/1187)、実装 PR [#1222](https://github.com/kompiro/karasu/pull/1222)
  - Design Doc: 旧 `docs/design/parallel-edge-bundling.md` は本 ADR で置き換え
  - 関連 ADR:
    - [ADR-20260429-01](20260429-01-orthogonal-edge-routing-skip-layer.md) — 直交チャネルルーティング（パイプライン順序の前段）
    - [ADR-20260509-05](20260509-05-edge-label-position-offset.md) — `label-position` / `label-offset` （author override が本 ADR の slide に優先する）

## 背景

karasu は同一ペア `(A, B)` の間に複数のエッジを記述できる
（例: `A -> B "create"` と `A -> B "update"`、または `A -> B` + `A --> B` の同期/非同期混在）。
従来は次の経路で並列エッジを描画していた:

1. `computeEdgePoints` が各エッジの port をノードサイドの中心に置く
2. `distributePorts`（ADR-20260429-01 系の Phase 3）が同一 `(node, side)` の port を
   `i/(N+1)` で分散
3. `routeOrthogonalEdges` / `distributeChannelLanes` が skip-layer L 字とレーンを整える

この経路でも線の経路は分かれるが、

- ラベルは各エッジの polyline 中点に anchor されるため、隣接した並列ラベルが矩形ベースで重なる
- ghost / cyclic エッジは `distributePorts` が skip するため、`fromPoint` / `toPoint` が完全に同一になり線が overdraw する

という残課題があり [#1185](https://github.com/kompiro/karasu/issues/1185) として Direction C
（[#1071](https://github.com/kompiro/karasu/issues/1071) の方向性）の独立タスクに切り出された。

## 決定

`packages/core/src/renderer/edge-routing-bundles.ts` を新設し、
`layout()` の最後（単一 system パスでも multi-system パスでも）に
`markParallelBundles(layoutEdges)` を呼ぶ。

- グルーピング鍵は `(from, to)` のみ。kind（sync/async）は分けない
  — 視覚衝突は kind に無関係であり、kind は stroke style で既に区別されている
- 同一鍵を共有するエッジが N ≥ 2 のとき、各エッジに 0-based の `bundleIndex` と `bundleSize`
  （optional な `LayoutEdge` フィールド）を付与する
- `renderEdge` は `style.labelPosition === 0.5`（author が `label-position` を未設定）
  かつ `bundleSize >= 2` のときに限り、ラベル位置を `t = (bundleIndex + 1) / (bundleSize + 1)`
  にスライドする。author override がある場合は ADR-20260509-05 の挙動を優先
- ghost / cyclic エッジで bundle に該当するものは、`fromPoint` / `toPoint` をエッジ方向の
  perpendicular に `(i - (N-1)/2) * BUNDLE_GAP`（`BUNDLE_GAP = 12px`）だけずらす。
  ゼロ長エッジは判定で除外し NaN を出さない
- 通常エッジ（非 ghost / 非 cyclic）の port 位置は本パスでは触らない
  — 線の分離は `distributePorts` の責務に残す

bundling は常時自動で、並列が無いケースは no-op（`bundleSize` が付かない）になる。

## 理由

- **責務分離**: `distributePorts` は per-side（同一サイドに集まる N 本を分散）、本パスは
  per-pair（同一 `(from, to)` の N 本にメタを付ける）と関心が直交する。両者を別パスに保つ
  ことで、`distributePorts` の port 計算ロジックを変更せずに済み既存 snapshot が安定する
- **author override の自然な共存**: `style.labelPosition` の閾値判定 (`=== 0.5`) を
  switch にすることで、ADR-20260509-05 で導入したスタイル制御が本 ADR の自動 slide を
  常に上書きできる。後方互換が破れない
- **ghost / cyclic の救済**: `distributePorts` が意図的に skip する対象は本パスでカバーする
  のがコストが小さい。本パス側で perpendicular nudge を行えば、`distributePorts` の
  「サイド単位」前提を壊さずに完全 stack を解消できる
- **決定論性**: グループ内順序は input array（AST 出現順）に固定。乱数・DOM metric に
  依存しないので snapshot diff が安定する
- **将来の opt-out 拡張余地**: 現在は常時自動だが、`bundleIndex` / `bundleSize` を
  optional field として持っているので、将来 `style` 経由で抑止したくなった場合は
  「set する条件」を狭めるだけで後方互換に対応できる

## 却下した案

### 案 1: ラベルの中点を辺に沿ってずらすだけ（label slide 単独）

線の経路は変えず、ラベルだけを `t = (i + 0.5) / N` にずらす案。
ラベル衝突は確実に解消するが、ghost / cyclic で線そのものが overdraw する問題には対処できない。
採用案は label slide を **既に分散済みの線** の上で行うことで、両側の問題を分業で解決する。

### 案 2: bundling pass で全エッジの port を perpendicular に offset

Design Doc 初稿で検討した案。`distributePorts` の前段で全エッジの port を perpendicular
にずらす方針。実装してみると、`distributePorts` が groups 単位でゼロからリセットして
port を再割り当てするため、bundling の出力が完全に上書きされ意味を持たないことが分かった。
本 ADR では通常エッジの port 操作を `distributePorts` に集約し、本パスは ghost / cyclic の
救済のみに留める。

### 案 3: 並列を「単一の論理エッジ + 複数ラベル」に集約

renderer 内で `(from, to)` を key にエッジを 1 本に統合し、ラベルを並べる案。
edge id selector（ADR-20260506-02）や edge direction style（ADR-20260506-03）が edge 単位で
動くため、論理統合すると identity が壊れ diff renderer の表示も狂う。さらに親 Issue で
direction E（count badge による集約）として out-of-scope に明示されている。

## 影響

- 既存図のうち並列エッジを含むものはラベル位置が変わる（merge 前後の snapshot 比較で
  確認）。並列を含まない図は byte-stable
- AT-1185 で 9 件の自動チェック + 2 件の manual を整備済み
- 例ファイル `examples/feature-samples/parallel-edges.krs` を追加（`examples.ts` 未登録の
  ディレクトリなので同期不要）
