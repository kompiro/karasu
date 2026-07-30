---
id: TPL-1954
title: "新しいエッジ route 形（waypoint 構成）を足したら、既存の overlap 回避パス（lane 分離・port fan-out）がその形を素通りしていないか確認する"
status: active
date: 2026-07-15
applicable_to:
  - "既存ルーターに新しい route 形（waypoint 数・bend 構成の違う経路）を追加する機能"
  - "route を後続で加工するパス（レーン分離・port 分散・束ね・marks）が『特定の waypoint 形』を gate 条件にしている箇所"
known_consumers:
  - system-view-group-routing
  - renderer
discovered_from:
  - root_cause_file: "packages/core/src/renderer/edge-routing-groups.ts"
  - issue: "#1954"
related_to:
  - TPL-1927
topic: renderer
scope:
  packages:
    - core
---

# TPL-1954: 新しいエッジ route 形を足したら、既存の overlap 回避パスがその形を素通りしていないか確認する

## 観点

ルーターに**新しい route 形**（従来と waypoint 数や bend 構成が違う経路）を追加するとき、その route を**後続で加工するパス**が「特定の waypoint 形」を暗黙の前提（gate）にしていると、新しい形は**そのパスを黙って素通りし**、パスが担保していた不変条件（overlap ゼロ等）が新 route に対してだけ破れる。

#1954 の実例:

- grouped ルーティングの overlap 回避パス（`distributeGutterLanes` / `fanOutGutterPorts`）は `isVerticalGutterRoute`（`waypoints.length === 2` かつ両 waypoint 同一 x）を gate にしていた。
- 貫通を直すために **4 waypoint の channel route** を足すと、この gate を外れて 2 パスの対象外になり、channel route のガター回廊が既存 2-waypoint route と**共線オーバーラップ**（偽の接続）を新たに生んだ。
- 貫通（[TPL-1927](TPL-1927-routing-measures-crossings-and-penetrations.md) 第1・2軸）はゼロになるが、**共線オーバーラップ（第3軸）が増える** — 片方の可読性軸を直して別軸を悪化させる、計測しないと見えない退行。

**教訓**: 新 route 形の追加は「経路を作る」だけで完結しない。**その route を消費する下流パスの gate を洗い出し、新形も同じ不変条件の下に置く**（gate を waypoint 数依存でなく「回廊を持つか」「どの辺にアンカーするか」のような**形不変な述語**に一般化する）まで含めて 1 つの変更である。

## 想定される失敗モード

- 新 route 形を追加した PR が、**その形を後段パスに参加させ忘れる**。gate（`waypoints.length === N` 等）に一致しないので後段パスが黙ってスキップし、後段パスが守っていた不変条件（overlap ゼロ・レーン非衝突・fan-out・marks 付与）が新 route にだけ効かない。
- 既存テストは**古い route 形の fixture しか無い**ため全部 green のまま。新形の退行は新 fixture を足すまで顕在化しない（#1954 は synthetic fixture が貫通・overlap ゼロを通す一方、実サンプルで漏れていた）。
- gate が**構造ではなく偶然の形**（waypoint 数・特定 index の座標）に依存している。route 形が一つ増えるたびに gate の分岐が漏れる。

## チェックリスト

新しい route 形（waypoint 構成の違う経路）をルーターに追加する実装で確認する:

- [ ] その route を**消費する下流パスを列挙**した（レーン分離 / port fan-out / 束ね / crossing marks / 描画 / diff）。
- [ ] 各下流パスの **gate 条件**を確認し、新 route 形が意図せず除外されていないか点検した（`waypoints.length === N`・`waypoints[0]` 決め打ち等の**形依存 gate**が典型）。
- [ ] 除外すべきでないパスには、gate を**形不変な述語**（「ガター回廊を持つか」「どの辺にアンカーするか」等）に一般化して新形を参加させた。除外してよいパス（例: 束ねは対象外）は**意図的な除外だと明記**した。
- [ ] 一般化後も**既存 route 形の結果が不変**であることを既存テスト（snapshot / 不変条件 assert）で確認した（＝一般化の回帰柵）。
- [ ] 新 route 形を**実際に生む fixture**で、下流パスが守る不変条件（[TPL-1927](TPL-1927-routing-measures-crossings-and-penetrations.md) の貫通ゼロ＋共線オーバーラップゼロ等）を assert した。synthetic fixture だけでなく、退行が出た**実サンプル**を柵に加えた。

## 既知の対処パターン

- **形不変な抽出ヘルパー**: 「route のガター回廊（極値 x の縦セグメント）」を waypoint 数に依らず取り出すヘルパー（`gutterCorridor`）を 1 つ用意し、レーン分離・fan-out・overlap 計測が全員それを使う。gate は「回廊があるか（= null でないか）」に一本化する。
- **アンカー辺の一般化**: port fan-out を「左右辺（高さ方向に分散）」だけでなく「上下辺（幅方向に分散）」も扱えるよう、辺の判定（`attachSide`）と分散軸を一般化する。side stub / channel stub の両方が同じ fan-out に載る。
- **既存 fixture を回帰柵に**: 新形を足す前の 2-waypoint route の結果・不変条件 assert を触らず green に保ち、一般化が旧形を変えないことを担保する。

## 関連テスト

- `packages/core/src/renderer/edge-routing-groups.test.ts`（`SYS`/`TRUNKS` = 旧 2-waypoint 形の回帰柵、`examples/en/getting-started` = mixed route を生む実サンプルで貫通・overlap ゼロを assert）

## 派生元 spec / 設計

- `docs/adr/1859-system-view-p2c-grouped-edge-routing-and-marks.md`（ADR-1859）— mixed route ＋ #1927 パス一般化（本観点の一次ソース、#1954）
- [TPL-1927](TPL-1927-routing-measures-crossings-and-penetrations.md) — 交差・貫通・共線オーバーラップの三重計測（本 TPL が守らせる不変条件の中身）
