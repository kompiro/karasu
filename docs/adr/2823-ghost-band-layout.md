---
id: ADR-2823
title: ghost entity / ghost domain を外部ドメインごとの枠に入れて焦点の枠の上下に並べ、焦点の線の後に routing chain で配線する
status: accepted
date: 2026-11-22
topic: renderer
refines: [ADR-460, ADR-1911, ADR-3027]
related_to: [ADR-328, ADR-2593, ADR-2598, ADR-3132, ADR-3154, ADR-2958, ADR-3022]
scope:
  packages:
    - core
assumptions:
  - "symbol: packages/core/src/renderer/ghost-band.ts :: placeGhostBand"
  - "symbol: packages/core/src/renderer/ghost-layout.ts :: placeGhostBands"
  - "symbol: packages/core/src/renderer/ghost-layout.ts :: ghostSystemTop"
  - "symbol: packages/core/src/renderer/container-frame.ts :: renderBandFrame"
  - "symbol: packages/core/src/renderer/layout-types.ts :: ghostBand"
  - "symbol: packages/core/src/view/entity-relations.ts :: parentDomainId"
  - "symbol: packages/core/src/view/ghost-synthesis.ts :: parentServiceId"
  - "symbol: packages/core/src/renderer/band-routing.ts :: isPeripheralEdge"
  - "symbol: packages/core/src/renderer/band-routing.ts :: CANVAS_PHASE"
  - "symbol: packages/core/src/renderer/band-routing.ts :: BAND_PHASE"
  - "symbol: packages/core/src/renderer/band-routing.ts :: BandRouting"
  - "symbol: packages/core/src/renderer/band-routing.ts :: NO_BAND"
  - "symbol: packages/core/src/renderer/band-phase.ts :: routeBandEdges"
  - "symbol: packages/core/src/renderer/band-reservations.ts :: bandGapReservations"
  - "file: packages/core/src/renderer/ghost-band.test.ts"
  - "file: packages/core/src/renderer/ghost-band-routing.test.ts"
  - "file: docs/test-perspectives/TPL-2823-late-placed-elements-reach-shared-layout.md"
---

# ADR-2823: ghost entity / ghost domain を外部ドメインごとの枠に入れて焦点の枠の上下に並べ、焦点の線の後に routing chain で配線する

- **日付**: 2026-11-22
- **ステータス**: 決定済み
- **関連**:
  - Issue #2823。スライス A #3880（PR #3882）、スライス B #3881（PR #3886）。design PR #3842
  - 切り出した Issue: #3804（ハブのエンティティに集まる線の密度。#2728 と同じ問い）、#3883（縦に長い canvas がプレビューの枠をはみ出す。既存）、#3884（draw.io の入れ子の枠が絶対座標のまま。既存）
  - スライス B の後追い: #3887（帯の線が焦点の相互の対の統合を止める）、#3888（障害物の無い帯の線は斜めの直線のまま。AT の「直交」の文言と合わない）、#3889（帯の線が焦点の線のラベルを横切る）
  - [ADR-460](460-ghost-domain-edges.md)（ghost domain を下に 1 行で置く）と [ADR-1911](1911-cross-domain-ghost-entities.md)（ghost entity に同じ行を使う）: 本 ADR はその「下に 1 行」を帯に置き換える。[ADR-3027](3027-mutual-edge-pair-merge.md)（相互の対を 1 本にする。決定 1 は ghost の線を除く）: 本 ADR は帯の線を対象に入れる
  - [ADR-328](328-ghost-system-rendering.md)（ghost system の枠）、[ADR-2593](2593-canvas-space-objective.md)（幅予算の探索）、[ADR-2598](2598-edge-routing-channel-capacity.md)（チャネルのレーンと 2 回目の配置の予約）、[ADR-3132](3132-frame-bounded-channels.md)（チャネルを枠の内側で測る）、[ADR-3154](3154-frame-bounded-gutters.md)（枠の側面の予約）、[ADR-2958](2958-gutter-lane-bundling.md)（gutter lane の束）、[ADR-3022](3022-edge-label-disclosure.md)（edge ラベルの段階的な開示）
  - TPL: [TPL-2823](../test-perspectives/TPL-2823-late-placed-elements-reach-shared-layout.md)（本件の design PR で起こした proactive TPL）、[TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)、[TPL-2593](../test-perspectives/TPL-2593-layout-feedback-is-floor-first-and-monotone.md)、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)、[TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)、[TPL-3026](../test-perspectives/TPL-3026-candidate-chain-covers-every-endpoint-relation.md)、[TPL-3132](../test-perspectives/TPL-3132-resource-inside-a-frame-measured-against-the-frame.md)、[TPL-1223](../test-perspectives/TPL-1223-scoped-glance-drill-down.md)、[TPL-2958](../test-perspectives/TPL-2958-bundle-shared-geometry-survives-later-passes.md)、[TPL-3027](../test-perspectives/TPL-3027-visual-merge-only-when-indistinguishable.md)
  - AT: [3880-ghost-band-placement.md](../acceptance/3880-ghost-band-placement.md)、[3881-ghost-band-routing.md](../acceptance/3881-ghost-band-routing.md)
  - コード: `packages/core/src/renderer/ghost-band.ts`（`placeGhostBand`）、`ghost-layout.ts`（`placeGhostBands` / `ghostSystemTop`）、`container-frame.ts`（`renderBandFrame`）、`band-routing.ts`（`isPeripheralEdge` / `CANVAS_PHASE` / `BAND_PHASE` / `BandRouting` / `NO_BAND`）、`band-phase.ts`（`routeBandEdges`）、`band-reservations.ts`（`bandGapReservations`）、`layout-edges.ts`（`runRoutingChain`）

## 背景

エンティティビューは、他ドメインのエンティティとの関連を muted な ghost として描く（ADR-1911）。ghost は焦点の枠の下に 1 行で並んでいた。この行は ADR-460 が ghost domain のために作り、ADR-1911 がエンティティに流用したもので、どちらの ADR も ghost が数件の場合しか見ていなかった。

この行は、その後に入った配置と配線の仕組みを 1 つも通っていなかった。

1. **配置**: `placeGhostRow` は x を 1 つずつ進めて全 ghost を 1 行に置き、外側の枠をその幅まで広げた。幅予算（ADR-2593）で折り返さないので、どの予算でも行の幅は同じになり、横長の canvas がそのまま選ばれた。
2. **順序**: ghost は `extractEntityView` が見つけた順に並び、相手の自エンティティの x とは関係が無かった。
3. **配線**: `pushGhostEdges` は相手のカードの下端中央と ghost の上端中央を直線で結んだ。ports・channel・gutter・lanes・outline seating・crossing marks など chain のほぼすべての段が `edge.ghost` を見て飛ばしたので、ghost が相手の真下に無いと、線は焦点の枠とカードを斜めに横切った。

逆生成した 3 つのモデル（Dify、Twenty、WordPress）で、ghost を持つエンティティビュー 82 件のうち 51 件が ADR-2593 の縦横比の範囲（16:9 から 9:16）の外にあった。最も横長の Dify `ApiBackend.IdentityAccess` は ghost 101 件で 36,053 × 1,372（26 : 1）だった。Twenty の `Files` は ghost 10 件で 5.2 : 1 で、原因は件数ではなく 1 行に並べる配置だった。service ビューの ghost domain は同じ `placeGhostRow` / `pushGhostEdges` を使うので同じ問題を持つが、3 モデルには service をまたぐ domain エッジが無かった。

ghost が 20 件を超えるビューでは、ghost の線の 70〜98% が自ドメインの 1〜2 エンティティに集まる。この密度は配置と配線を直しても残るので、#3804 に切り出した。

## 決定

ghost entity と ghost domain を、外部ドメイン（ghost domain なら外部 service）と帯の側の組ごとの枠に入れ、関連の向きで焦点の枠の上下に分け、幅予算で折り返して相手の x の順に並べる（帯）。帯の線は、焦点の線を帯が無いときと同じに配線した後の 2 段目で routing chain に通す。

### 帯の配置（スライス A）

1. **外部ドメインごとの枠**: 「外部ドメイン × 帯の側」の組に ghost が 2 件以上あれば、1 つの枠に入れる。枠のタイトルはドメインのラベルで、中のカードの subLabel は外す。ghost domain は「外部 service × 帯の側」の枠に入れ、タイトルは service のラベルにする。1 件だけの組は枠を作らず、今と同じ subLabel 付きのカードとして帯に並べる。帯のカードは今の ghost カードと同じ扱い（キー・クリック・詳細パネル）のまま。
   - 組の単位はドメインの id（ghost domain は service の id）とし、ラベルではない。そのため view slice の ghost の記録に所属の id（`parentDomainId` / `parentServiceId`）を足した。DomainId は system の中で一意（KRS018）なので、パスではなく id で分ける。
   - 帯の枠は `ContainerRect` で、`ghost: false` と `ghostBand: "above" | "below"` を持つ。`path` を持たないので、ノードのスタイル解決（`containerStyleOf`）・`data-node-path`・ドリルダウンの対象にならない。`id` は側とドメインを含み、同じドメインが上下に枠を持っても一意になる。
   - 帯の枠は `renderBandFrame` が描く。線は破線の `mutedBorder`、タイトルは `textMuted` で、どちらも暗くしない。枠の中には薄い色を敷く。中の ghost のカードと線は今と同じ muted のまま。draw.io への書き出しも、ghost の色の破線で ghost の不透明度をかけずに描く。
2. **向きで上下に分ける**: ghost ごとに incoming と outgoing の関連（`ghostEntityEdges` / `ghostDomainEdges`）の本数を数え、incoming が多ければ上の帯、outgoing が多いか同数なら下の帯に置く。片方向だけの ghost はその向きの帯になる。両方向の関連を持つ ghost は、少ない向き（同数なら incoming）の線だけが流れに逆らう。同じ相手との相互の対は両向きに 1 本ずつ数えるので、対だけなら同数で下になる。どちらの帯も 1 段目を焦点の枠に接する側に置く。下の帯は ghost user の下に置く。
3. **幅予算で折り返す**: 帯の枠と単独のカードは `max(幅予算, 焦点の枠の幅)` を超える手前で次の段へ折り返す。各段は焦点の枠を中心に揃える。枠の中のカードの列数も同じ幅で上限を切る。段か列が予算で切られた run は `widthBound: true` を返し、幅予算の探索がより広い予算を試せる。外側の枠は帯を囲むよう全方向に広がる。
4. **相手の x で並べる**: 枠と単独のカードは、中の ghost の関連ごとの相手（自ドメインのエンティティ）の中心 x の平均の昇順に並べる。平均は関連 1 本ごとに数えるので、多くの関連を持つ相手ほど重い。枠の中のカードも同じ値で並べる。同じ値なら発見順を使う。
5. **ghost system を焦点と同じ高さに保つ**: 上の帯が外側の枠を上へ広げても、ghost system の枠は帯が広げる前の外側の枠の上端（`ghostSystemTop`）に置き、焦点と同じ高さに残す。

### 帯の線の配線（スライス B）

6. **2 段階の routing**: `runRoutingChain` はまず焦点の線（帯の線以外）を帯が無いときと同じに配線し（`CANVAS_PHASE`）、その後 `routeBandEdges` で帯の線だけを同じ chain に通す（`BAND_PHASE`）。2 段目では焦点の線の経路を動かさない占有物として扱う。焦点の線が使う接続点・corridor・レーンを帯の線は避ける。焦点の枠の大きさと中の経路は、帯の線があっても無くても同じになる（相互の対を 1 本にするかは別。決定 11）。この方式は kompiro が 2026-11-21 に選んだ。
   - 2 段目の補助処理: 焦点の線が握る接続点に帯の線が載ったら外す（`clearHeldPorts`）、ほかの線と同じ区間を走らない（チャネルの L 字が焦点の線に重なったら経路を捨てる `dropRoutesOnHeld`、判定は `sharesStretch`）、枠の線に重なる横走り・縦走りを `LANE_PITCH` だけずらし、ずらした先が別の枠の線に載らない（`liftOffBorders`）、帯の線を囲むよう帯を囲む枠を広げる（`growAroundBandRoutes`）、そのとき横の ghost system の枠との間を詰めない（`keepBesideClear`）。
   - 帯の段の lane の束（ADR-2958）は焦点の段の束と別の名前（`band-` の接頭辞）を持つ。
7. **線の印と通す段**: 帯の線は `LayoutEdge.band`、帯のカードは `LayoutNode.ghostBand` で区別する。帯の線は ports・channel-L・gutter・mixed・corridor・gutter lane・port の fan-out・lanes・outline seating・平行線の束・相互の対・crossing marks を通る（`isPeripheralEdge` が帯の線を周辺の線から外す）。ghost user と ghost system の線とカードは、すべての段で今と同じく飛ばす。
   - trunk の集約（`aggregateGroupTrunks` / `aggregateGroupSourceTrunks`）は帯の段では動かさない（#3804 の密度の問い）。
   - ungrouped のときだけ使う候補のうち、帯の段で開くのは内部 corridor（#2365 のカードの列の間の corridor。group の枠が無いときだけ）だけで、同じ行のチャネル・階段・側面全体の再試行・列の corridor は閉じたままにする。
8. **帯の行と障害物**: 帯の段では帯のカードを行として数え、焦点の枠と帯の間にチャネルを作る。帯の枠、帯以外の枠のタイトル、帯を囲む枠、帯が抜ける枠は、`runRoutingChain` の必須の項目 `band: BandRouting` で渡す。複数 system の root と deploy ビューは `NO_BAND` を明示する（TPL-219）。帯の枠は group の枠と同じく端点ごとに免除する障害物で、端点を中に持たない線が横切らないように配線する（82 件で 10 本は残る。「残っている制限」）。帯の枠に入る線はその枠の上端を通るので、帯の枠自身のタイトルは障害物にしない。タイトルの障害物は、帯の枠と group の枠を除くすべての枠のタイトルの描いた文字の箱にする。group の枠は `groupFrames` として端点ごとの免除つきで渡るので、端点がその group の中にある帯の線はそのタイトルを横切りうる。
9. **予約は焦点の線で測る**: 焦点のチャネル・列・側面（`gutterReservations`、ADR-3154）・ラベルの余白の予約は、帯の線を除いて測る。帯のチャネルに足りない余白は、2 回目の配置で帯の行ごとに帯の前へ確保する（`bandGapReservations`）。`ChannelLimits`（ADR-3132）は変えない。
10. **ラベルは ghost のラベルのまま**: 帯の線のラベルは今の ghost のラベルと同じく、`label-display: auto` のときだけ、ほかのラベルの後に、本物のラベルを押しのけずに置く（#2360）。
11. **相互の対**: 相互の対（ADR-3027）に帯の線を入れ、帯の線どうしの対はほかの条件を満たせば 1 本で描く。焦点の線の対の分かれ目を帯の線が横切ると、ほかの交差と同じくその対は 2 本のまま残る（Umami の fixture で 14 対から 13 対）。これを止めるかは #3887 で決める。

## 理由

- **ドメインの境界が図に出る**: ghost の目的は他ドメインとの関係を見せることで、枠にまとめればドメイン名は 1 回で済み、図をドメイン単位で読める。Dify `IdentityAccess` の 101 件は 18 ドメインのもので、16 枠と単独のカード 2 枚になる。#3804 で集約するときの単位にもなる。
- **ADR-460 の案 A を 2 件以上に限って採る**: ADR-460 は ghost domain を所属 service の枠で包む案 A を、「ドメインが 1 つだけでも service の枠が出る過剰な包み」と「左右に置くと ghost system と衝突する」で却下した。前者は 1 件の組だけに当たるので、1 件の組は枠を作らない。後者は帯が上下にあるので当たらない。
- **上下に分けると線が流れに沿う**: エンティティの関連は参照する側から参照される側へ向かい、焦点の中の層配置も参照する側を上に置く。参照してくるものを上、参照されるものを下に置けば、片方向の線は上から下へ流れる。この規則は kompiro が PR #3842 で選んだ（常に下に置く案に代えて）。
- **縦横比の範囲に入る**: スライス A の後、82 件のうち範囲外は 0 件になった。Dify `IdentityAccess` は 36,053 × 1,372 から 4,360 × 3,514 になった。
- **帯の枠を暗くしない（スライス A で kompiro が選んだ）**: Design Doc は帯の枠を ghost system と同じ muted の枠で描くとしていた。spike で比べて、外部ドメインの名前が拡大せずに読めることを優先し、枠の線とタイトルは暗くせず、カードと線だけを muted に残す形（spike の案 C）を kompiro が選んだ。実装が単純になることは理由にしていない。
- **2 段階にすると焦点が変わらない（スライス B で kompiro が選んだ）**: 帯の線を焦点の線と同じ 1 回の chain に混ぜると、帯の線が焦点のカードの接続点を動かし、焦点の線の経路まで変わった。帯はビューの周辺の情報なので、帯があることで焦点の図が変わらないほうがよい。2 段目は焦点の経路を固定した占有物として避けるので、焦点の枠と経路は帯があっても変わらない（相互の対の統合は除く。決定 11）。帯の線が無いビューでは `routeBandEdges` が何もせずに戻るので、出力はバイト単位で変わらない。
- **貫通が減る**: 82 件のビューで、帯の線がカードを横切る区間は 5,588 から 30、端点を持たない帯の枠を横切る線は 2,182 から 10 になった。Dify の `Workflow`・`Knowledge`・`IdentityAccess` は両方 0 になった。縦横比の範囲外は 0 件のまま。
- **ungrouped 専用の候補を閉じたままにする**: 帯の段で開くと、82 件で帯のカードの貫通が 30 から 34、帯の枠の貫通が 10 から 15 に増えた。内部 corridor だけを開いた。
- **ラベルを ghost のままにする**: 帯のラベルをすべてのモードでラベルの配置に通すと、examples の図でラベルが保留される（#3022 の「既定では何も保留しない」に反する）か、密な fence でラベルどうしが重なった。2 つの fence の調整は別の仕事になるので、今の ghost のラベルの規則を保った。
- **予約を帯の行ごとにする**: 焦点のチャネルの予約を帯の線で測ると、帯が焦点の行の間を広げる。帯のチャネルの余白は帯の行の前にだけ要るので、焦点の予約とは別に帯の行ごとに確保した。`ChannelLimits` を焦点の枠の内側に限る形にしなくても、帯の段の障害物（帯の枠・タイトル・帯を囲む枠）でチャネルが閉じる。

## Design Doc からのずれ

Design Doc（`docs/design/ghost-band-layout.md`、本 ADR への昇格で削除）と実装のずれは、上の決定に書いたとおりである。主なもの:

- 帯の枠の描き方（決定 1）: ghost system と同じ muted の枠ではなく、暗くしない破線の枠（PR #3882 で kompiro が選んだ）
- 列数（決定 3）: `gridColumnCount(n)` の列数を、`max(幅予算, 焦点の枠の幅)` に収まる数で上限を切り、切られた列も `widthBound` を返す。段は焦点の枠を中心に揃える。下の帯は ghost user の下
- view slice（決定 1）: slice を変えない見込みだったが、組の単位に所属の id を足した
- ghost system（決定 5）: Design Doc は範囲外としていたが、上の帯に引きずられないよう置き場所を固定した
- 配線（決定 6〜9）: Design Doc は帯の線を焦点の線と同じ 1 回の chain に通すとしていた。実装は 2 段階にし、補助処理を足した（PR #3886 の議論で kompiro が選んだ）。帯の枠は `bandFrames: Rect[]` ではなく `band: BandRouting` で渡す。帯のチャネルの余白は `layout-reservations.ts` と `GHOST_ROW_GAP` の拡大ではなく `bandGapReservations` で確保し、`ChannelLimits` は変えない。タイトルの障害物は焦点の枠のタイトルの「ラベルの幅 × `CONTAINER_LABEL_HEIGHT`」ではなく、帯の枠と group の枠を除くすべての枠の描いた文字の箱。ungrouped のときだけ使う候補のうち、内部 corridor 以外は帯の段で閉じたまま（Design Doc は帯の枠を group として数えないとしていた。開くと貫通が増えた）
- ラベル（決定 10）: Design Doc は `label-placement.ts` を帯の線が通る段に挙げていたが、ghost のラベルのまま
- AT の手動項目は Design Doc の大きな合成 fixture ではなく、小さな手書きのモデルで確かめる（fixture はテストのコードで組み立てるので、開ける `index.krs` が無い）

## 却下した案

- **カードのまま、幅予算で行を折り返す**: 変更は最小で縦横比にも入るが、101 枚のカードがそれぞれドメイン名の subLabel を繰り返し、どの ghost が同じドメインかは subLabel を読まないと分からない。#3804 で集約する単位も図に無い。
- **ghost を焦点の層配置に混ぜて相手の近くに置く**: ADR-460 の案 C と同じ理由（焦点の子と外部の参照が同じ枠に混ざり、境界があいまいになり、ドリルダウンのパスが崩れる）で却下。
- **帯を左右に置く**: 左右は ghost user と ghost system の場所で、service ビューでは衝突する。
- **すべて下に置く（ADR-460 / ADR-1911 のまま）**: 参照してくる ghost の線が下から上へ流れに逆らう。PR #3842 で kompiro が向きで分ける案を選んだ。
- **直線のまま、端点だけ相手の近くへ**: 帯が 2 段以上に折り返すと、2 段目以降の ghost は相手の真下に来ず、直線が 1 段目の帯の枠とカードを横切る。
- **帯の線を焦点の線と同じ 1 回の chain に通す**: Design Doc の決定 5 の形。試作で、帯の線が焦点のカードの接続点を動かし、焦点の線の経路が変わったので、2 段階に変えた。
- **帯の段で ungrouped 専用の候補をすべて開く**: 上の「理由」のとおり、82 件で貫通が増えた。

## 残っている制限

- 帯の線のカードの貫通と、端点を持たない帯の枠の横切りは 0 ではない（82 件のビューで、カードを横切る区間 30、帯の枠を横切る線 10）。AT-3881 の AT-1 は fixture で 0 を確かめている。
- 障害物の無い帯の線は、焦点の線と同じく斜めの直線のまま描かれる。AT の手動項目の「直交の経路で」の文言とは合わない（#3888）。
- 帯の線は焦点の線のラベルを障害物にしないので、ラベルの文字を横切ることがある（#3889）。
- 帯の線が焦点の相互の対の分かれ目を横切ると、その対は 2 本のまま（#3887）。
- ハブのエンティティに集まる線の密度と、帯の線の trunk の集約（#3804）。
- 帯は一番外側の枠（system）だけが囲み、間の枠（service）は囲まない。同じ service の外部ドメインを service の枠の中に置くかは、必要になったら別 Issue にする（PR #3842 で kompiro が了承）。
