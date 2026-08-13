---
id: ADR-2477
title: 並列エッジの perpendicular nudge は「重なっているか」で判定する
status: accepted
date: 2026-08-13
topic: edges
refines: [ADR-1185]
related_to: [ADR-968, ADR-1815, ADR-1955]
scope:
  packages:
    - core
assumptions:
  - "file: packages/core/src/renderer/edge-routing-bundles.ts"
  - "symbol: packages/core/src/renderer/edge-routing-bundles.ts :: markParallelBundles"
  - "grep: packages/core/src/renderer/edge-routing-ports.ts :: layoutNodes"
---

# ADR-2477: 並列エッジの perpendicular nudge は「重なっているか」で判定する

- **日付**: 2026-08-13
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2477](https://github.com/kompiro/karasu/issues/2477)
  - [ADR-1185](1185-parallel-edge-bundling.md) — 並列エッジ束ね（本 ADR が refine する）
  - [ADR-968](968-orthogonal-edge-routing-skip-layer.md) — `distributePorts` を含む Phase 3
  - [ADR-1815](1815-expand-container-in-place.md) / [ADR-1955](1955-expand-all-services-in-place.md) — in-place 展開（frame へのアンカーを生んだ変更）

## 背景

ADR-1185 は `markParallelBundles` の nudge 対象を **ghost / cyclic エッジ**と定めた。
当時これは正しかった。線が完全に重なるのは `distributePorts` が skip する対象だけで、
その skip 条件が `edge.ghost || edge.cyclic` だったからである。

in-place 展開（ADR-1815 / ADR-1955）は ADR-1185 より後に入り、**3 つ目の重なる形**を
作った。展開された service は `ExpandedFrame` であって layout node ではないため、
`distributePorts` は端点を `layoutNodes` から引けず、その時点でエッジを skip する。
結果、両端が展開済み service の並列エッジ（`S1 -> S2` と `S1 --> S2`）は同一座標に
描かれ、後から描いた 1 本しか見えない（[#2477](https://github.com/kompiro/karasu/issues/2477)）。

ghost / cyclic は「port が分散されていない」という事実の**当時の代理表現**であり、
事実そのものではなかった。代理で書かれた gate は、事実を満たす新しい形が増えるたびに
黙って取りこぼす。

## 決定

`markParallelBundles` の nudge 判定を、カテゴリの数え上げから**幾何の事実**に変える。

- 束の中で **polyline が他のエッジと一致している**（端点・waypoint が全て 0.5px 未満の差）
  エッジを nudge する。0.5px は「サブピクセルは重なりとして描かれる」という閾値
- ghost / cyclic は明示的な disjunct として残す。アンカーロジックの都合で座標が
  完全一致しない場合でも従来どおり nudge され、既存の描画が変わらない
- `distributePorts` が実際に分散したエッジは触らない（ADR-1185 の責務分離は維持）
- nudge は端点だけでなく **polyline 全体を平行移動**する。ルーティング済みのエッジが
  束に入っても形が保たれ、両端だけがずれて kink になることがない

## 理由

- **事実で書けば新しい形が自動的に入る**: 「重なっている」は frame アンカーでも、
  将来また別の理由で port 分散を外れる形が出ても同じように成立する。カテゴリ列挙は
  形が増えるたびに改訂が要る（[TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)）
- **既存図が動かない**: 分散済みのエッジは判定を通らないので、並列エッジを含む既存の
  図は byte-stable。ghost / cyclic は disjunct を残したので挙動不変
- **ADR-1185 の却下案 2 とは別物**: 却下されたのは `distributePorts` の**前段**で
  全エッジをずらす案で、後段の再割り当てに上書きされて無意味という理由だった。本 ADR は
  すべてのパスが終わった後に、まだ重なっているものだけを動かす

## 却下した案

### 案 1: `distributePorts` を frame にも対応させる

`ExpandedFrame` を `distributePorts` が扱えるようにして、frame 辺上に port を分散する案。
筋は良いが、`distributePorts` は `LayoutNode`（および #2422 の port frame / keep-out）を
前提に組まれており、frame を第 2 の node 型として通すと per-side 分散・shape outline
シーティングの双方に分岐が増える。#2477 が求めているのは「重なりの解消」であって
「frame 辺での port 分散」ではないので、コストに見合わない。frame 辺の分散が独立に
必要になった時点で改めて検討する。

### 案 2: gate に frame アンカーの条件を足す（`ghost || cyclic || frameAnchored`）

最小の差分だが、**カテゴリ列挙という形を維持する**ため次の形でまた同じ漏れが起きる。
#2477 の根因はそこにある。

## 影響

- 両端が展開済み service の並列エッジが `BUNDLE_GAP`（12px）間隔で分離して描かれる
- 分散済みエッジ・ghost / cyclic の描画は変わらない（`packages/core` 全テスト green）
- 受け入れ条件は `docs/acceptance/2477-parallel-edges-between-expanded-frames.md`
