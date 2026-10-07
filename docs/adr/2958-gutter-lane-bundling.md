---
id: ADR-2958
title: ガターを通るエッジを、共有する端ごとに 1 レーンへ束ねる
status: accepted
date: 2026-10-07
topic: renderer
refines: [ADR-2330]
depends_on: [ADR-2631]
related_to: [ADR-1859, ADR-2598, ADR-1185, ADR-2521, ADR-2593, ADR-2761]
scope:
  packages:
    - core
  concerns:
    - performance
assumptions:
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: bundleGutterCorridors"
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: distributeGutterLanes"
  - "symbol: packages/core/src/renderer/layout-types.ts :: trunkJoin"
  - "symbol: packages/core/src/renderer/edge-routing-lanes.ts :: collectChannels"
  - "symbol: packages/core/src/renderer/crossing-marks.ts :: hopGrid"
  - "symbol: packages/core/src/renderer/edge-routing.ts :: ownLabelSegment"
  - "file: packages/core/src/renderer/edge-routing-lane-bundles.test.ts"
  - "grep: packages/core/src/renderer/routing-parity.test.ts :: saturated gutter — lane bundle fence"
  - "grep: packages/core/src/renderer/routing-parity.test.ts :: en/hato/index.krs"
---

# ADR-2958: ガターを通るエッジを、共有する端ごとに 1 レーンへ束ねる

- **日付**: 2026-10-07
- **ステータス**: 決定済み
- **関連**:
  - Issue #2958（起点）、実装 PR #3089、設計 PR #2967（本 ADR に集約し削除: `docs/design/gutter-lane-bundling.md`）
  - 前提 bug #2966（トランク兄弟が共有する端点が本数分平行移動される。PR #3081 で修正済み）
  - 派生 bug #3088（接するだけの corridor が同じレーンに載り、行間チャネルのレーン分けで重なる。main から存在）
  - [ADR-2330](2330-ungrouped-routing-parity.md)（#2364 で ungrouped の集約トランクを却下。本 ADR はその却下を refine する）、[ADR-2631](2631-trunk-legibility-by-count.md)（本数チップ・帯・fan-out トランク、交差アーチ半径 6px と corridor 柵 = #2884）、[ADR-1859](1859-system-view-p2c-grouped-edge-routing-and-marks.md)（ガター・集約トランク・交差マーク）、[ADR-2598](2598-edge-routing-channel-capacity.md)（チャネル容量。決定 8 = #2490）、[ADR-1185](1185-parallel-edge-bundling.md)（束ねても edge identity は保つ）、[ADR-2521](2521-multi-system-pipeline-convergence.md)（共有ヘルパーに寸法フラグを足さない）
  - TPL: [TPL-2958](../test-perspectives/TPL-2958-bundle-shared-geometry-survives-later-passes.md)（設計時に起こした TPL）、[TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)、[TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)、[TPL-2631](../test-perspectives/TPL-2631-decoration-must-not-hide-a-crossing-mark.md)
  - AT: `docs/acceptance/2958-gutter-lane-bundling.md`、`docs/acceptance/2884-hop-arc-radius.md`（AT-A / AT-B の入力を更新）
  - コード: `packages/core/src/renderer/edge-routing-groups.ts`、`edge-routing-lanes.ts`、`crossing-marks.ts`、`edge-routing.ts`、`layout-types.ts`、`routing-parity.test.ts`、`edge-routing-lane-bundles.test.ts`

## 背景

reverse した Dify モデルの `Dify.ApiBackend.Knowledge`（usecase 23 → resource 26、エッジ 155 本）を Group by なしで開くと、左右のガターに平行線の帯ができてカードが読めなかった。どのエッジも、行き先や出元を他と共有していても、ガターに自分専用のレーンを 1 本取っていた。レーンを共有できるのは、y の範囲が重ならない場合だけだった（`assignGutterLanes` の区間分割）。

束ねる仕組み（fan-in / fan-out トランク）は ADR-1859 / ADR-2631 にすでにあったが、この図には効かなかった。

1. **Group by 軸があるときしか走らない。** #2364 で ungrouped への適用を計測して却下したためである（ADR-2330）。却下の理由は、トランクの spine が右ガターにあるので、内部 corridor（#2365）で短くなった fan-in 経路をキャンバスの端へ引き戻すことだった。
2. **2 waypoint の素直なガター経路しか扱わない。** Knowledge 画面の経路は 155 本中 102 本が mixed 経路（塞がれた側の端だけ行間チャネルへ逃がしてからガターへ出る経路、#1954）で、トランクの候補にならない。

ADR-2330 の却下理由は「短い経路を外へ引き戻す」ことにあり、**すでにガターにあるエッジ**には当たらない。#2364 で計測した 9 本の corpus には、この密度の図が含まれていなかった。

## 決定

**ガターの corridor のうち、corridor より後ろ（target 側）が完全に同じものを fan-in の束に、残りのうち corridor より前（source 側）が完全に同じものを fan-out の束にして、束ごとに 1 レーンを割り当てる。** 経路の形も側も変えず、レーンの x だけを変える。grouped / ungrouped / multi-system root の全モードで、同じ `distributeGutterLanes` が走る。

### 束の規則

1. **判定**: fan-in は `(種別, target, corridor の終端 y, corridor 以降の点列)` が一致する corridor。fan-out は `(種別, source, corridor の始端 y, corridor 以前の点列)` が一致する corridor。点列は座標の完全一致で比べ、経路の形（素直 / mixed）は問わない。
2. **順序**: fan-in を先に取る。共有 target のほうが強い主張であることは ADR-2631 と同じ。どちらにも入らない corridor は今までどおり 1 本 1 区間で、図は変わらない。
3. **種別（同期 `->` / 非同期 `-->`）が違うエッジは同じ束に入れない。** 1 本の spine に実線と破線が重なって描かれるのは、#2490 で問題になった「parallel edge が 1 本に重なる」と同じ状態だからである（ADR-2598 決定 8）。同じ種別の parallel edge は束ねてよい。
4. **レーン**: 束は兄弟の y 範囲の和集合を 1 区間として、既存の区間分割に渡す。右ガターは既存トランク lane の外側、左ガターは外へ並べる規則も変えない。
5. **id**: 兄弟には束ごとに一意な `trunkId` / `outTrunkId` を付ける（`<target>#lane-in-<n>` / `<source>#lane-out-<n>`）。同じ node に入り方の違う束が複数ありうるうえ、`fanOutGutterPorts` は同じ id の兄弟を 1 スロットとして動かすからである。既存トランクパスの id（node id そのもの）とも衝突しない。
6. **合流点**: `LayoutEdge.trunkJoin` に、兄弟が spine に乗る waypoint の index を持たせる。fan-in は corridor の始点、fan-out は終点。合流マーク（`crossing-marks.ts`）とラベル区間（`ownLabelSegment`）はこれを読む。既存トランクパスの 2 waypoint 経路では未設定のままで、従来の `waypoints[0]` / 最後と一致するので出力は変わらない。
7. **行間チャネル**: `collectChannels` は、同じ束の兄弟が持つ座標の同一な水平 run を 1 本として 1 レーンに置く。分けると、共有区間がチャネルで平行線に戻ってしまう（TPL-2958）。
8. **`groupBackward`**: 束の兄弟からは外す。共有した線の一部だけが破線に見えるのを避けるためで、既存トランクの扱いと揃える。

### 既存トランクパスとの関係

grouped 限定の `aggregateGroupTrunks` / `aggregateGroupSourceTrunks`（右ガターの spine への付け替え）はそのまま残す。先にそれらが走り、残ったガター corridor が束の対象になる。統合すると grouped の出力が大きく変わり、評価の軸が 2 つ混ざるためである。

### ADR-2330 との関係（refine）

ADR-2330 の「ungrouped で集約トランクを使う」の却下は正しいまま残す。却下したのは「右ガターの trunk lane へ経路を付け替えて、内部 corridor で短くなった経路を外へ引き戻すこと」である。本決定は経路を付け替えず、すでにガターにある corridor のレーンを共有させるだけなので、却下の根拠に当たらない。

### 交差アーチの corridor 柵（#2884）の入力を、実在の図に替える

#2884 の柵（ADR-2631）は「既定半径 6px のアーチが最も狭い corridor に収まる」と「その corridor が 7px 以下まで詰まっている（半径を 7 に上げると落ちる）」の 2 つを assert する。後者は、前者が事故を検出できる入力であることの証明である（TPL-2598）。

その 7px を作っていたのは、合成入力 WIDE（hub が 12 target を呼ぶ）で、hub の 1 辺から 11 本のガターエッジが別々のスロットで出る扇だった。束ねるとこの扇が 1〜2 スロットに畳まれ、最狭の corridor は 125px に広がる。

- 束を割る合成入力を 12 通り作った（種別を交互にする、hub を 2 つにする、各 target に同じ側から入る相方を付ける など）。どれも 8px を切れなかった。種別は 2 つしかないので 1 つの source からは最大 2 束にしかならず、相方を付ける形は N=36（108 エッジ）でも 8.4px だった。
- `examples/en` の 55 ファイル × 3 モードを実測すると、7px 以下の corridor は `hato/index.krs` の 1 か所（6.7px）だけで、束ねる前後で値が変わらなかった。

そこで柵の入力を **hato（Group by team）+ アーチ数を確保する合成入力 PARTNERED**（WIDE の各 target に、hub と同じ帯の呼び出し元を 1 つずつ足したもの、アーチ 82 個）に替えた。最狭は hato の 6.7px で、半径を 7 にすると柵が落ちることを確認した。アーチの膨らむ向きの柵も PARTNERED に移した。

### 交差マークの帯・チップ処理を空間グリッドで引く

束ねると ungrouped の図にも帯と本数チップが現れる。`clearMarksOfBands`（全 hop × 全帯）と `slideOffCrossings`（チップ候補位置 × 全 hop）が総当たりだったため、Dify の DifyDB 階層の描画が 98 → 124 ms に悪化した。hop の中心を `BoxGrid` に入れ（`hopGrid`）、帯とチップごとに届く範囲のセルだけを引くようにした。厳密な判定はそのままでグリッドは候補を絞るだけなので、出力はバイト一致する（Dify・`examples/en`・飽和フィクスチャで確認）。`bench:render` の Dify 全体は main と同等（459〜470 ms 対 462〜472 ms）に戻った。

## 理由

- **困っている形に効く。** 束ねられたのは Knowledge 画面で 112 / 155 本（fan-in 69 + fan-out 43）。mixed 経路を同じ規則で扱えるのは、経路の形ではなく「兄弟が一緒に描く部分」だけを比べるからである。
- **#2364 のコストが構成上起きない。** 経路の側も形も変えないので、短い経路が外へ引き戻されることはない。貫通しないことも、既存のガターレーンと同じ根拠（レーンは全コンテンツの外側）で構成的に保証される。
- **1 つの仕組みで全モードに効く**（ADR-2521）。grouped でも、トランクパスの後に残ったガター corridor が束になる。
- **束ねる対象がない図は 1 バイトも変わらない。** examples の ungrouped ルートビュー 12 本（#2364 の corpus を含む）はバイト一致した。変わったのは grouped の getting-started（team）だけで、交差 4 → 3、幅 1170 → 1146 px、総長も短くなった。
- **既存の語彙に乗る。** `trunkId` / `outTrunkId`、本数チップ、帯（ADR-2631）をそのまま使い、エッジは 1 本ずつ残る（ADR-1185）。

計測（Knowledge 画面、ungrouped、貫通は前後とも 0）:

| | 実装前 | 実装後 |
|---|---|---|
| ガターのレーン | 135 | 48 |
| キャンバス | 4563 × 3758 | 2930 × 2984 |
| 交差マーク | 8262 | 2539 |
| 総エッジ長 | 620,642 | 433,768 |

レーンが減って幅が空いたので、配置の幅予算の探索（ADR-2593 / ADR-2761）が 2 列ではなく 4 列の配置を選び、縦長の図が正方形に近づいた。

### 柵

- **飽和フィクスチャ**（`routing-parity.test.ts`「saturated gutter — lane bundle fence」）: usecase 16 → table 10（各 5 本）、ungrouped、左ガターの束を含む。束が実際にできること（fan-in・fan-out・mixed 経路）、レーン数が「束の数 + 単独の数」以下であること（実装前 41 → 実装後 18）、全チェーン後も兄弟の spine と共有区間が同一座標であること、貫通 0・兄弟以外の共線 0 を測る。main では落ち、行間チャネルの束対応を外しても落ちる。usecase あたり table 4 本では共有区間がチャネルを通らず、チャネル対応を外しても緑のままだったので 5 本にした（TPL-2958）。
- **単体テスト**（`edge-routing-lane-bundles.test.ts`）: 束になる / ならない条件、同期と非同期を混ぜない規則、fan-in が先に取ること、端を共有しない corridor が以前と同じレーンに置かれること、チャネル run、合流マークとラベル区間。
- **#2513 のキャンバス幅柵**: 各 store へのペアを同期・非同期の混在にして、束にならず「経路がコンテナより外へ出る」前提を保った（TPL-2598）。

## 却下した案

### 案A: grouped 限定の条件を外し、既存トランクパスを ungrouped でも走らせる

spike では Knowledge 画面で束ねられたのが 155 本中 2 本だった。mixed 経路と階段経路が候補にならず、右ガターの spine へ付け替えるという #2364 で問題になった動きそのものを ungrouped に持ち込むため却下した。

### 案C: 既存トランクパスを mixed 経路へ一般化する

経路の側を右に寄せるので、左ガターを使っていた経路が長くなる（#2364 と同じ種類のコスト）。付け替えのたびに clearance の検証もやり直す必要があり、レーン x を変えるだけの本案より重い。

### 交差アーチ柵の扱いで採らなかったもの

- **合成入力を大きくして 7px に届かせる**: N=36 でも 8.4px で、届く保証がない。届いても「各 target に同じ側から入る相方がいる」という実際には珍しい形を柵が守ることになる。
- **「7px 以下まで詰まっている」の assert を外す**: 半径を 7 以上に上げる変更を柵が検出できなくなる。実在の図（hato）に 6.7px の corridor が残っているので、外す理由がない。

## 影響

- 既存ユーザー: ガターに共有端を持つエッジが複数ある図だけ、描画が変わる（束になり、図が縮む）。`.krs` の構文は変えない。
- `LayoutEdge.trunkJoin` を追加した。`crossingMarks.junctions` / `bands` は ungrouped の図にも現れるようになった。

## 未解決の問い

- **既存トランクパスとの統合。** grouped の右 spine への付け替えを本案に置き換えるかどうか。grouped の出力が大きく変わるので、別 Issue で計測する。
- **階段経路と内部 corridor の束ね。** Knowledge 画面で束ねられずに残る経路の大半がこれにあたる。内部に claim 済みの列を持つので、レーン x を動かすだけでは束ねられない。
- **後続パスが 1 本ずつ判断する箇所。** ポートの輪郭への載せ直し（`seatPortsOnOutline`）と parallel edge の平行移動（`markParallelBundles`）は束を知らない。試したどの入力でも束は割れなかったが、出口ポートが重なったままの同種 parallel edge が同じ束に入ると、割れる余地が理屈の上で残る（TPL-2958）。
- **帯の最大幅。** 帯は 9 本以上で 26px まで太り、帯に乗るアーチもそれに合わせて高くなる（ADR-2631）。束が ungrouped にも増えたので、最大幅を絞って「複数本あること」だけを示す案が実装中に挙がった。ADR-2631 の決定の変更にあたるので、本 ADR では決めない。
- **密度集約**（ハブの減光・boundary 単位の集約）は #2728 で扱う。
