---
id: ADR-2598
title: 層間チャネルに容量を持たせ、配線の需要を配置へ返す
status: accepted
date: 2026-09-06
topic: renderer
related_to: [ADR-968, ADR-1859, ADR-2330, ADR-1737, ADR-2593, ADR-1728, ADR-1185, ADR-2521]
scope:
  packages: [core]
assumptions:
  - "symbol: packages/core/src/renderer/edge-routing-lanes.ts :: collectChannels"
  - "symbol: packages/core/src/renderer/edge-routing-lanes.ts :: distributeChannelLanes"
  - "symbol: packages/core/src/renderer/edge-routing-lanes.ts :: LANE_PITCH"
  - "symbol: packages/core/src/renderer/layout.ts :: channelReservations"
  - "symbol: packages/core/src/renderer/layout-types.ts :: placementPasses"
  - "symbol: packages/core/src/renderer/layer-layout-logics.ts :: extraGapBeforeRow"
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: cheapestSide"
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: fanOutGutterPorts"
  - "symbol: packages/core/src/renderer/deploy-layout.ts :: routeDeployEdges"
  - "file: docs/acceptance/2608-channel-capacity.md"
  - "file: docs/acceptance/2609-deploy-routing-chain.md"
  - "file: docs/acceptance/2610-gutter-side-by-capacity.md"
  - "file: docs/test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md"
---

# ADR-2598: 層間チャネルに容量を持たせ、配線の需要を配置へ返す

- **日付**: 2026-09-06
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2598](https://github.com/kompiro/karasu/issues/2598)（親）、設計 PR [#2613](https://github.com/kompiro/karasu/pull/2613)、実装 PR [#2702](https://github.com/kompiro/karasu/pull/2702)（slice A [#2608](https://github.com/kompiro/karasu/issues/2608)）/ [#2708](https://github.com/kompiro/karasu/pull/2708)（slice B [#2609](https://github.com/kompiro/karasu/issues/2609)）/ [#2710](https://github.com/kompiro/karasu/pull/2710)（slice C [#2610](https://github.com/kompiro/karasu/issues/2610)）
  - [ADR-968](./968-orthogonal-edge-routing-skip-layer.md)（チャネル L 字ルーティングとレーン割り当ての原型）、[ADR-1859](./1859-system-view-p2c-grouped-edge-routing-and-marks.md)（ガター / mixed route・集約トランク・マーク）、[ADR-2330](./2330-ungrouped-routing-parity.md)（計測柵で ungrouped を保証）
  - [ADR-1737](./1737-balanced-grid-sibling-layout.md)、[ADR-2593](./2593-canvas-space-objective.md)（配置に測定値を返すときの線引き。本 ADR はその隣に 2 本目のフィードバックを置く）
  - [ADR-1728](./1728-external-on-sides-layout.md)（external のサイド配置。ガター側の選択が保つ affordance）、[ADR-1185](./1185-parallel-edge-bundling.md)（parallel edge の nudge は宣言順）、[ADR-2521](./2521-multi-system-pipeline-convergence.md)（共有ヘルパーに寸法フラグを足さない）
  - TPL: [TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)（設計時に起こした proactive TPL）、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)、[TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)、[TPL-2593](../test-perspectives/TPL-2593-layout-feedback-is-floor-first-and-monotone.md)、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)
  - AT: [AT-2608](../acceptance/2608-channel-capacity.md)、[AT-2609](../acceptance/2609-deploy-routing-chain.md)、[AT-2610](../acceptance/2610-gutter-side-by-capacity.md)
  - コード: `packages/core/src/renderer/edge-routing-lanes.ts`、`layout.ts`、`layer-layout-logics.ts`、`edge-routing-groups.ts`、`deploy-layout.ts`、`layout-edges.ts`

## 背景

「エッジが重なる」症状は #1927 / #1954 / #2477 / #2490 と繰り返し報告され、その都度パスを足して直してきた。10,000 行規模の外部モデル（reverse-engineered な dify）で計測すると、原因は配線アルゴリズムの精度ではなく**段間の欠落**だった。パイプラインはノード座標を先に確定してから配線する。層間チャネルの高さは `LAYER_GAP` / `NODE_GAP` という定数の余りで、そこを何本のエッジが通るかは配置時点で誰も知らない。

- レーン割り当て（`distributeChannelLanes`）は 18px の帯を `N + 1` 分割していた。31 本が 1 チャネルを共有すると間隔は 0.56px になり、パスは「成功」を報告しながら線を重ねて描いていた。
- 同パスは waypoint がちょうど 2 個の経路しか対象にしておらず、実際に重なっていたガター経路の復路（waypoint 3〜4 個）は最初から対象外だった。TPL-1954 の言う「形でゲートしたパスは新しい形を素通りする」そのものである。
- 縦方向（ガター / トランク）が #1927 で直ったのは `maxRight + GUTTER_GAP + lane × 24` と**外へ無限に伸ばせた**からで、横方向（層間チャネル）は伸ばす場所が無かった。

`routing-parity.test.ts` の柵は 12 の実モデルで overlap 0 を assert して green だったが、どのモデルも 1 つのチャネルを混雑させていなかった。これは [TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md) として設計時に起こした。

同じ計測で 2 つの隣接する欠陥も見えた。deploy view は `runRoutingChain` を一度も通らず、コンテナ辺の中心同士を直線で結んでいた（dify の deploy 16 本中 12 本が同一座標で終端）。ガターの側は「右を試して駄目なら左」の定数で、内部回廊に入れないエッジは全部右に積み上がっていた。

## 決定

**レーン割り当てを資源（内部 waypoint 間の水平 run）でキー付けし、ピッチを固定し、1 回目の配線で数えた需要分の場所を行間に予約して配置をもう 1 回だけ走らせる。** 併せて deploy view を共有チェーンへ載せ、ガターの側を占有と経路長で選ぶ。

1. **資源キーのレーン**（`collectChannels` / `distributeChannelLanes`）。run は「内部 waypoint 間の水平 segment で、前後の segment が垂直なもの」。経路の形は問わない。ポートで終わる segment は run ではない — 動かすとノードから外れるので、その分離はポート側のパスの仕事。チャネルは正確な y ではなく**行間の帯**（カードとフレームの上下の最近接）でキー付けする。
2. **固定ピッチ** `LANE_PITCH = 14px`。需要は通る本数ではなく、x 範囲が重なる run の最大同時数（greedy interval partitioning、`distributeGutterLanes` と同じ規則）。
3. **2 パス、ループではない**。`layout()` は幅予算の探索後に各チャネルの需要を数え、既定 gap に収まらないチャネルが 1 つでもあれば、その行の直前の gap を `lanes × LANE_PITCH` まで広げて `layoutInner` をもう 1 回走らせる。3 回目は存在しない。幅予算は探索が選んだものを固定する。`LayoutResult.placementPasses` に 1 か 2 を**出力**する（入力にはしない — ADR-2521）。
4. **予約の無い経路では帯に圧縮する**。複数 system の root view はキャンバス全体で一意な行序数を持たないので予約しない。そこではレーンを帯の中に圧縮して、行へは溢れさせない（貫通は重なりより悪い — TPL-1927）。
5. **ガター fan-out は attachable span の上で行い、辺に付く全エッジを対象にする**（`fanOutGutterPorts`）。bbox 上に散らした位置は `seatPortsOnOutline` が keep-out の縁へ寄せて 1 点に重ねていた。gutter 経路だけを対象にしていた fan は、同じ辺に残る内部 L や直線のポートと衝突していた。
6. **deploy view は共有チェーンを通る**（`routeDeployEdges`）。非 ghost コンテナを box にしてチェーンへ渡し、`ghost` は配線後に付ける style flag とする。
7. **ガターの側は容量で選ぶ**（`cheapestSide`）。両側で候補経路を作り、その側で既に y 範囲が重なる回廊の数だけ外へ押し出されたレーン位置での経路長で価格づけし、安い側を採る。同点は右（従来の順序）。処理順は宣言順ではなく端点の幾何で正準化する。
8. **in-place expansion は配線上 grouped ではない**。expansion は band stack を借りて枝を置くが、チェーンへ band stack を渡すと P2c-B の trunk 集約が走り（#2364 が ungrouped で却下したもの）、2 本の parallel edge を 1 本の spine と 1 つの target entry に束ねていた。これが #2490 の正体だった。Group-by 軸があるときだけ band stack を渡す。

## 理由

- **重なりを「後で直すもの」から「起き得ないもの」にする。** 資源に割り当てが無いのが根だった。割り当てだけでは場所が無い — ピッチ固定のみの中間状態は `Knowledge` view で重なり 989 → 17 と引き換えに貫通 0 → 113 を生んだ。予約とピッチは組でしか機能しない。
- **決定性と差分の局所性を保つ。** パス数は構成で 1 か 2 に決まり、収束判定・乱数・viewport 依存を持ち込まない。「同じ入力 → 同じ SVG」（`docs/concepts.md` Goals）を明示的に設計した形で満たす（TPL-2593）。
- **既定 gap で足りる view は 1 バイトも変わらない。** 閾値は「現行 gap に収まるなら 0」。ADR-2593 の floor-first と同じ形で、直す必要の無かった図を伸ばさない。束ねられた examples では 2 回目の配置が走った view は 0。
- **計測（dify 22 view、約 1,100 本）**:

  | 指標 | main | A のみ | A + B + C |
  | --- | --- | --- | --- |
  | 水平の共線ペア | 9,037 | 3 | **3** |
  | 垂直の共線ペア | 181 | 18 | **13** |
  | 貫通 | 7 | 7 | 7（root view の既存分） |
  | 面積 | 120.6 Mpx | +28% | **+6%** |

  A だけでは面積 +28% だったが、C で経路が左右に分かれてチャネルの需要が減り +6% に収まった。ADR-2593 の −17% で相殺できる。deploy（dify `docker-compose`）は貫通 29 → 0、終端の共有 3 → 0。

### ADR-1859 が却下した「配置レベルで解消」との線引き

ADR-1859 は「共有 infra はどこに置いても誰かの直下に来うるので配置だけでは解けない。routing で構成的に解く」として配置レベルの解消を却下した。本決定はこれと矛盾しない。却下されたのは**特定のエッジを避けるためにノードを動かす**ことで、本決定が配置に返すのは**通行量から決まる通路の寸法**だけである。どのエッジがどの経路を取るかは引き続き routing が決め、ノードの相対順序・層割当・列は変えない。

### ADR-1737 / ADR-2593 の線との関係

ADR-2593 は「候補が入力だけで決まり、既定候補が先頭で、厳密改善のみが勝つなら、フィードバックがあっても既定レイアウト規則の側に留まる」と線を引いた。本決定は候補を探索せず、予約量を `測定した lanes × 定数ピッチ` で 1 つに決める。測定値は 1 回目のパスの結果から取るが、その結果自体がモデルと定数の純関数なので、合成も純関数である。**3 回目を走らせない**のは上限の明示であって不動点の保証ではない。2 回目の配置で経路選択が変わりうることは事実で、実測では全 view で悪化しなかった。

## 実装で設計を覆した点

1. **需要は本数ではなく最大同時数。** 設計は `demand × pitch` と書いていたが、x 範囲が離れた run はレーンを共有できる。interval partitioning にしたことで面積の伸びが抑えられた。
2. **fan-out の一般化は 2 段階で必要になった。** 混雑 fixture は、fan した位置が輪郭の keep-out へ寄せられて 1 点に重なることを露わにし（A で span 写像に載せた）、C で経路が左右に分かれると、gutter 経路だけを fan していた位置が内部 L のポートと衝突した（辺に付く全エッジを 1 回の分配で並べる形にした）。いずれも TPL-1954 の「形でゲートしたパスは素通りする」の変奏である。
3. **#2490 の原因は expansion の trunk 集約だった。** Issue は「`fanOutGutterPorts` が source しか分けない」と書いていたが、trace すると trunk 兄弟が設計どおり entry を共有していた。修正は gate の条件（band stack の有無 → Group-by 軸の有無）であって fan ではない。
4. **`Knowledge` view の右端は側の選択では減らない。** 受け入れ条件は「右半分比率 204/460 が大幅に下がる」だったが、この view は内部回廊が 0 本で、154 本のガター回廊は既に左 75 / 右 79 に分かれていた。85% 超の 58 waypoint は 79 レーン目そのものであり、減らせるのは内部列を確保する slice D（[#2611](https://github.com/kompiro/karasu/issues/2611)）だけである。`Conversation` 53% → 45%、`Workflow` 54% → 41% は下がった。
5. **側の価格づけは経路長 + レーン分。** 占有を第一キーにする案（lanes 優先、次に経路長）も測ったが、`Knowledge` は変わらず面積 +10%・垂直ペア 19 と悪化したので採らなかった。
6. **multi-system root で左レーンが隣の system に食い込む。** 左ガターが使われるようになった帰結で、system 全体を張り出し分だけ右へずらしてから次の system を置く。

## 却下した案

- **衝突を見てノードを動かし、衝突が消えるまで再配線を繰り返す**: 収束保証が無く、上限を付ければ結果が上限に依存する。エッジ 1 本の追加で全体が組み替わり、diff の局所性と compare/diff を壊す。原因（予約の無い通路の取り合い）にも当たっていない。
- **レーンのピッチだけ固定にする**: 場所が無いので行へ溢れる。実測で貫通 0 → 113。
- **占有を第一キーにした側の選択**: 上記「実装で設計を覆した点」5。
- **expandedFrames を lane の障害物として別途渡す**: expansion の枝は `buildGroupFrames` が必ず `group: true` を付けるので group frames に含まれており、重複を足すだけになる。テストで固定した。

## 残る限界

- **複数 system の root view は予約しない**（決定 4）。system ごとの行序数で予約する案は slice D の設計で再検討する。
- **deploy view も予約しない**。レーンは `ROW_GAP`（64px、4 レーン）に圧縮される。コンテナ間のエッジは少なく、実モデルで混雑したら追う。deploy に crossing marks は無い（muted に描かれる）。
- **trunk lane は Group-by canvas で右側のみ**（P2c-B）。
- **どのエッジが内部回廊を取れるかは変わらない**。内部回廊が無い view では重なる回廊 1 本につき 1 レーン積み上がる。slice D の担当。
- **ポートで終わる run の分離は本 ADR の外**。boundary 軸で残る共線ペアは trunk 兄弟が spine と target entry を設計どおり共有しているもので、それを「1 本に見える」と読むか「集約の表現」と読むかは slice E（[#2631](https://github.com/kompiro/karasu/issues/2631)）の判断。同じ列間の隙間に入った 2 本の内部回廊が、隣り合うカードへ反対向きに入る stub を同じ高さで交差させる件も同じ領域にある。
