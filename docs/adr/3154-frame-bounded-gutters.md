---
id: ADR-3154
title: ドリルダウンのガターは枠の内側のカードで測り、足りない幅を枠の側面に予約する
status: accepted
date: 2026-10-22
topic: renderer
refines: [ADR-3132, ADR-2598]
related_to: [ADR-2593, ADR-2611, ADR-2958, ADR-1859, ADR-3026]
scope:
  packages:
    - core
assumptions:
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: contentBounds"
  - "symbol: packages/core/src/renderer/layout-reservations.ts :: gutterReservations"
  - "grep: packages/core/src/renderer/layout-reservations.ts :: const FRAME_SIDE_MARGIN = 12"
  - "grep: packages/core/src/renderer/edge-routing-lanes.ts :: right: frame.x \\+ frame.width"
  - "grep: packages/core/src/renderer/routing-parity.test.ts :: drill-down gutters stay inside the frame"
  - "file: packages/core/src/renderer/edge-routing-frame-sides.test.ts"
  - "file: docs/test-perspectives/TPL-3132-resource-inside-a-frame-measured-against-the-frame.md"
---

# ADR-3154: ドリルダウンのガターは枠の内側のカードで測り、足りない幅を枠の側面に予約する

- **日付**: 2026-10-22
- **ステータス**: 決定済み
- **関連**:
  - Issue #3154（起点。#3132 の計測中に見つかった）、設計 PR #3255（本 ADR に集約し削除: `docs/design/frame-bounded-gutters.md`）、実装 PR #3308
  - [ADR-3132](3132-frame-bounded-channels.md)（縦方向の同型。チャネルを枠の内側で測り、足りなければ枠を広げる。本 ADR はこれを横方向に当てる）
  - [ADR-2598](2598-edge-routing-channel-capacity.md)（2 パスの予約。3 回目は無い）、[ADR-2593](2593-canvas-space-objective.md)（行幅予算の探索）、[ADR-2611](2611-layer-spanning-edge-columns.md)（列の予約と `TRUNK_LANE_GAP`）、[ADR-2958](2958-gutter-lane-bundling.md)（ガターのレーンの束ね）、[ADR-1859](1859-system-view-p2c-grouped-edge-routing-and-marks.md)（ガターは内容の外にあるので構成的に貫通しない）、[ADR-3026](3026-same-row-channel-route.md)（同じ行を回る経路）
  - TPL: [TPL-3132](../test-perspectives/TPL-3132-resource-inside-a-frame-measured-against-the-frame.md)（本件を「横方向の同型」として挙げていた。対処パターンとテストを追記した。新しい TPL は起こしていない）、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)、[TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)、[TPL-2611](../test-perspectives/TPL-2611-feedback-key-survives-the-next-pass.md)
  - AT: `docs/acceptance/3154-frame-bounded-gutters.md`
  - 後続: #3309（同じ行を回る経路が両側とも塞がれたときの直線）

## 背景

ドリルダウンのビューでは、表示中のコンテナが 1 つの枠になってカードを囲む。枠の左右の余白は `CONTAINER_PADDING`（40px）で、配線の前に決まる。
一方、ガターの縦の線は内容の端から `GUTTER_GAP`（28px）の位置に置かれ、重なるものは `TRUNK_LANE_GAP`（24px）ずつ外へ積まれる。
2 本目（内容から 52px）で枠の線を越え、本数が多いと祖先の ghost 枠の外まで出た。

さらに、ガターの基準 x を決める `contentBounds` は枠の外の ghost カードも数えていた。枠の横に ghost の利用者（`placeGhostUsers`）や呼び出し元の
ghost system がいると、1 本目から枠の外に置かれた。

逆生成した 4 モデル（umami / dify / twenty / wordpress）のドリルダウン全ビューで、ghost でも循環でもない edge の縦の線分のうち、
x が枠の側面の上か外にあるものは 3,100 本（79 ビュー）あった。

## 決定

#3132 と同じ「枠の内側で測り、足りなければ枠を広げる」規則を横方向に当てる。

1. **基準**: `ChannelLimits` に枠の側面（`left` / `right`）を足す。`contentBounds` は枠の内側にあるカードだけで `minLeft` / `maxRight` を測る。
   ガターを使う 4 つのパス（`routeGroupedEdges` / `aggregateGroupTrunks` / `aggregateGroupSourceTrunks` / `distributeGutterLanes`）は
   同じ `limits` を受け取る（TPL-219）。枠が無ければ `left` / `right` は無限大で、今の挙動になる。
2. **容量**: `layout()` は 1 回目の配線を見て、ghost でも循環でもない edge の縦の線が、枠の側面から `FRAME_SIDE_MARGIN`（12px =
   `CONTAINER_PADDING - GUTTER_GAP`、1 本目と枠の間の隙間）より外に出た最大の量を、左右それぞれ測る（`gutterReservations`）。
   どちらかが正なら、既存の 2 回目の配置で、カードを左の予約分だけ右へずらし、枠の幅に左右の予約を足す。ghost カードと祖先の枠は枠から配置されるので、一緒に外へ動く。
3. **探索の採点は変えない**: 行幅予算の探索（ADR-2593）は予約を含めずに採点する。行間チャネルの予約（ADR-2598）と同じ扱い。
4. **配置の回数**: 最大 2 回のまま（ADR-2598）。2 回目で経路が変わって増えたレーンは、はみ出したまま残る。

## 理由

- 枠の内側にガターの基準を置けば、枠の外の物（ghost カード）でガターの位置が決まることが無くなる。基準が決まれば、行間チャネルと同じ
  「足りなければ 2 回目の配置で予約する」がそのまま使える。
- 予約は既存の 2 パス目に相乗りするので、配置の回数は増えない（コーパスで 2 回目を走らせたビュー数は main と同じ 99）。
- 試作の計測（1,542 ビュー、7,659 本）で、はみ出す縦の線分は 3,100（79 ビュー）→ 31（21 ビュー）。キャンバス面積は +1.5%、幅が増えたのは 80 ビュー。
- 図の変化を枠の幅に留める。探索の採点まで変える案2 は交差の合計で勝るが、その差はほぼ `Twenty.TwentyServer` 1 ビューから来ており、
  代わりに 11 ビューのカードの並びを組み替える。

## 却下した案

- **案2: 行幅予算の探索を予約込みの幅で採点する**: ADR-2593 の「採点は最終キャンバス」に沿うが、予算の変わるビューが 1 → 11 に増え、
  カードの並びごと組み替わる。交差の main との差は +548（案1 は +2,000 で、ほぼ `Twenty.TwentyServer` 1 ビュー分）。ADR-2598 は
  行間チャネルの予約を採点に入れていないので、側面だけ入れると予約の扱いが軸ごとに分かれる。入れるなら両方を同時に決める。
- **案3: 予約せず、枠の内側にレーンを詰める**: ADR-2598 が「ピッチと予約は組でしか機能しない」として却下した形と同じ。レーンが十数本ある
  ビュー（Umami の `Analytics`）では間隔が 1px を割る。
- **案4: 枠の側面を配線の後に決める**: ghost の edge は ghost カードの位置から配線されるので、ghost の配置と配線の順番を入れ替える必要があり、
  `layoutInner` の構成を組み替えることになる。予約でほぼ同じ結果が得られる。

## 影響

- ガターを 2 本以上使うドリルダウンは、枠が左右に広がる（コーパスで 80 ビュー、多くは +100〜+150px）。枠の横に ghost カードがあるビューは、
  1 本目のガターが枠の内側に移る。基準がすでに枠の内側にあり、1 本しか使わないビューは変わらない（既存のスナップショットで確認）。
- 柵は `routing-parity.test.ts` の T / M / B fixture（4 列・5 列、修正前のツリーで 2 件が落ちる）。ghost カードが基準にならないことは
  `contentBounds` を直接確かめる（`edge-routing-frame-sides.test.ts`）。設計は配置したドリルダウンでの確認を予定していたが、小さなモデルでは
  枠の横の ghost の利用者がいても内側の通り道が先に選ばれ、ガターまで届かなかった。
- 決めずに残したこと:
  - 2 回目の配置で増えたレーン（コーパスで 31 本、21 ビュー）。直すには 3 回目の配置か、2 回目の経路を 1 回目に寄せる仕組みが要る。
  - 予約を探索の採点に入れるか（案2）。行間チャネルの予約と同時に決める。
  - `Twenty.TwentyServer` の貫通 1 件。探索が別の予算を選んだ結果、同じ行を回る経路が両側とも塞がれて直線のまま残る。経路の欠落そのものは本件の前からあり、#3309 で扱う。
  - 枠の側面を見ないラベル配置（#3132 の follow-up と同じ扱い）、group 枠の内側のガター、複数 system の root の system 枠。
