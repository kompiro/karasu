# AT-1859-C: Group by team — hop/junction crossing marks (P2c-C)

- **日付**: 2026-07-14
- **Issue**: #1926（親 #1859 / #1822 / Epic #1817 comprehension）
- **PR**: (P2c-C — hop/junction crossing marks)
- **設計**: [ADR-1859](../adr/1859-system-view-p2c-grouped-edge-routing-and-marks.md)
- **Related TPLs**: [TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)（可読性検証は交差数と貫通数を両方測る。交差は表現で無害化するので「全交差が mark 付き」を assert し、残存交差を欠陥視しない）
- **対象**: `packages/core/src/renderer/crossing-marks.ts`（`computeCrossingMarks` 追加） / `layout.ts` / `layout-types.ts` / `svg-renderer.ts`（`renderCrossingMarks` + `crossing-marks` レイヤ）

## 概要

Group by: team の P2c 最終 slice。P2c-A（直交ルーティング）/ P2c-B（集約トランク）で貫通ゼロ・トランク束ねまで済んだが、**残る交差は無印**で「交差か接続か」が曖昧なままだった。本 slice は回路図の慣習で交差を**表現で無害化**する:

- **hop（◠）**: 横セグメントが**別エッジ**の縦セグメントを直角で跨ぐ交点を検出し、横線側にアークを描く（交差＝非接続）。縦（ガター回廊 / トランク spine）は直通線のまま。近接交点は 1 幅広アークにクラスタ化。
- **junction（●）**: トランク合流 elbow（`waypoints[0]`）に接続ドット（合流＝接続）。

交差判定は `edge-geometry.ts` と同一の **strict-interior**（`1e-6` epsilon）を使う。これにより stub が spine の端点で合流する点（トランク合流）やエッジ自身の曲がり角は hop にならず、junction / 無印に正しく振り分けられる。marks は**最終座標のみ**から決定論的に導出（snapshot 安定）。

## 受け入れ条件

### AC-1: hop 検出（core, #1859 AC-3 / TPL-1927）

> ✅ Automated by `packages/core/src/renderer/crossing-marks.test.ts` (suite-wide)

- [x] 別エッジの H×V が strict-interior で交差する点に hop を 1 つ記録する
- [x] stub が spine 端点で合流する点（T 字合流）やエッジ自身の折れ角には hop を作らない（strict-interior 判定）
- [x] 同一横線上の近接交点は `HOP_CLUSTER_GAP` 以内で 1 幅広 hop にクラスタ化、離れた交点は別 hop
- [x] ghost / cyclic エッジは対象外
- [x] グループレイアウトの**全右角交差**が hop で覆われる（`res.crossingMarks.hops` が `rightAngleCrossings(res)` を全被覆）

### AC-2: junction 検出（core, #1859 AC-2 の junction dot）

> ✅ Automated by `packages/core/src/renderer/crossing-marks.test.ts` (suite-wide)

- [x] `trunkId` を持つエッジの `waypoints[0]` のうち、spine がその点より上へ延びる **T/＋ 合流点にだけ** junction を置く（最上段 stub ＝ spine の頭 = L コーナーには打たない）
- [x] 同一座標の junction は dedupe

### AC-3: 描画レイヤ（core）

> ✅ Automated by `packages/core/src/renderer/group-by-render.test.ts` (suite-wide)

- [x] grouped view で `crossing-marks` レイヤを **edges レイヤの後**に emit（marks が線の上）。hop = `<path>`（アーク）、junction = `<circle>`
- [x] hop / junction がどちらも無いときはレイヤを emit しない
- [x] 各 mark は所有エッジの色/線幅で描く（`edge { color: … }` で色付けした図では marks もその色になり、既定 slate にならない）

### AC-4: Group by: none 不変 / scope 境界（回帰, #1859 AC-5・review #1）

> ✅ Automated by `packages/core/src/renderer/group-by-render.test.ts` (suite-wide)

- [x] ungrouped では `LayoutResult.crossingMarks` が undefined（renderer は何も描かない）→ SVG は byte-identical
- [x] 既存 core スイート（2216 tests）が全通過（回帰なし）
- [x] multi-system の Group-by ビューは marks を emit しない（#1939 Part 2 で対応予定・それまでは境界を固定）
- [x] ~~斜めエッジの交差は hop 対象外~~ → **#1939 Part 1 で被覆**（斜めも oriented hop で marked。[AT-1939-A](1939-crossing-marks-diagonal.md) 参照）

## 手動検証

- [ ] **AC-manual**: app で複数チームが同一 infra/external を参照するモデル（`index.krs`）を Group by → Team で開く。エッジの交差箇所に**跨ぎアーク（hop）**が描かれて「非接続」が明示され、トランク合流点に**接続ドット（junction）**が付いていることを目視確認する。ungrouped（Group by: none）に戻すと marks が消えることも確認する。
