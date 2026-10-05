---
id: ADR-2611
title: 層をまたぐエッジは内部の列へ入り、列の無い行にだけ列を 1 本予約する
status: accepted
date: 2026-09-27
topic: renderer
depends_on: [ADR-2598]
related_to: [ADR-968, ADR-1859, ADR-1737, ADR-2593, ADR-458, ADR-395, ADR-2521, ADR-2631]
scope:
  packages: [core]
assumptions:
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: mixedEnd"
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: tryCorridorRoute"
  - "symbol: packages/core/src/renderer/edge-routing-groups.ts :: corridorCandidates"
  - "symbol: packages/core/src/renderer/layout.ts :: columnReservations"
  - "symbol: packages/core/src/renderer/layer-layout-logics.ts :: extraGapBeforeCard"
  - "file: docs/acceptance/layer-spanning-edge-columns.md"
  - "file: docs/test-perspectives/TPL-2611-feedback-key-survives-the-next-pass.md"
---

# ADR-2611: 層をまたぐエッジは内部の列へ入り、列の無い行にだけ列を 1 本予約する

- **日付**: 2026-09-27
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2611](https://github.com/kompiro/karasu/issues/2611)（起点。親 [#2598](https://github.com/kompiro/karasu/issues/2598) の slice D）
  - 設計 PR: #2739（本 ADR に集約し削除: `docs/design/layer-spanning-edge-columns.md`）
  - 実装 PR: #2785
  - [ADR-2598](2598-edge-routing-channel-capacity.md)（層間チャネルの容量と 2 パス目。本 ADR はその水平版で、2 パス目に相乗りする）、[ADR-968](968-orthogonal-edge-routing-skip-layer.md)（チャネル L 字ルーティングの原型）、[ADR-1859](1859-system-view-p2c-grouped-edge-routing-and-marks.md)（ガター / trunk と「配置レベルで解消」の却下）、[ADR-1737](1737-balanced-grid-sibling-layout.md)（grid wrap と sub-row）、[ADR-2593](2593-canvas-space-objective.md)（幅予算の探索）、[ADR-458](458-arch-layout-barycenter-wrap-scope-reduction.md) / [ADR-395](395-barycenter-layer-ordering.md)（barycenter の適用範囲）、[ADR-2521](2521-multi-system-pipeline-convergence.md)、[ADR-2631](2631-trunk-legibility-by-count.md)（slice E。本 ADR の後に残った共線ペアの行き先）
  - TPL: [TPL-2611](../test-perspectives/TPL-2611-feedback-key-survives-the-next-pass.md)（設計時に起こした proactive TPL）、[TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)、[TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)、[TPL-2593](../test-perspectives/TPL-2593-layout-feedback-is-floor-first-and-monotone.md)、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)
  - AT: `docs/acceptance/layer-spanning-edge-columns.md`
  - コード: `packages/core/src/renderer/edge-routing-groups.ts`、`layout.ts`、`layer-layout-logics.ts`、`layout-geometry.ts`

## 背景

#2598 は「配線の需要が配置に届かない」ことを複数のスライスで直している。slice A（ADR-2598）で垂直軸（層間チャネル）は通行量から寸法を得るようになった。残る slice D の主張は「層をまたぐエッジは配置段階で横方向の場所を確保しない。だから内部回廊が塞がれば外側のガターに落ちる」で、Issue はこれを Sugiyama の dummy node で解くと書いていた。

着手前に reverse-engineered dify モデル（21 view、1,125 エッジ、ungrouped）で計測すると、ガター送りの原因は Issue が想定した「回廊の取り合い」ではなかった。

| 指標 | 値 |
| --- | --- |
| 外側ガターに落ちたエッジ | 538（再配線の 51%） |
| うち、空いている内部回廊を他エッジに取られたもの | 5 |
| うち、行間バンドに幅 24px 以上の空き列が実在するもの | 243（45%） |
| うち、空き列が本当に存在しないもの | 295 |

1. **枯渇の原因は競合ではなく幾何。** 回廊の占有制約で逃したのは 538 本中 5 本しかない。
2. **45% は「入れない」のではなく「辿り着けない」。** `tryCorridorRoute` の経路形は両端ともカードの中央高さから横に出る L 字に固定されており、同じ行に兄弟が 1 つでも間にあれば横走りがカードを貫通して棄却される。空き列はあるのに入る方法が無かった。
3. **残りは列そのものが無い。** 行内のカードは `NODE_GAP` で詰められ、各 sub-row は独立に中央寄せされる。行 r の隙間と行 r+1 の隙間の x は揃わず、karasu の配置には「列」という構造が無い。

## 決定

**層をまたぐエッジを dummy node に分解しない。代わりに、既存の空き列へ入る経路（到達性）を足し、それでも列が 1 本も無い行にだけ、ADR-2598 の 2 パス目で列を 1 本予約する。**

### 到達性（幅コスト 0、1 パスのまま）

1. **回廊への進入規則をガター経路と共有する。** 各端は、側面 stub が空いていればそれ、兄弟に塞がれていれば上下ポート + 隣接する行間チャネル経由で内部回廊へ入る。この判断はガター側と同じ `mixedEnd` が行い、進入規則を 2 箇所に書き分けない（TPL-219）。行の隙間も回廊候補に加え、等距離の候補の tie は target の列で決める（map の反復順に依存させない）。
2. **staircase 経路を足す。** 始点と終点が 2 行以上離れたエッジは、間の各行の隙間を 1 つずつ縦に抜け、行間チャネルで横にずれてよい。Sugiyama の dummy chain が作る形を、dummy を作らずに得る。
3. **裁定は経路形ではなく資源で行う（TPL-1954）。** 全ての経路の軸平行セグメントを claim する。前段のパスが作った経路、再配線されない直線エッジ、ガター経路と mixed 経路も含む。チャネル内で終わる垂直線は、`distributeChannelLanes` が後でその端をチャネルのどのレーンにも動かしうるので、チャネル全体にわたってその x を占有する。`fanOutGutterPorts` も同じ裁定に参加し、自分の持ち分の辺上で他エッジが走っていない列を探す。

### 列の予約（ADR-2598 の 2 パス目に合流）

4. **需要と容量。** 需要は「まだガターにいて、端点が行をまたぐエッジ」を target ごとに 1 本と数えたもの。容量はその行の隙間に残る空きレーン数。
5. **足りない行には列を 1 本だけ開ける。** 不足分全部ではない（下の「理由」参照）。
6. **鍵は行序数とカードの id で持つ。** 座標でもカード序数でも持たない（TPL-2611）。適用時に鍵のペアが隣接していなければ、その予約は破棄して既定の配置に戻す。
7. **折り返しは予約前の幅で判定する。** 予約は `wrapLayerIntoRows` が行を確定した後に x オフセットとして加えるだけで、カードの順序・層割当・行の構成を変えない。
8. **予約は barycenter に届かない。** `sortByBarycenter` が読む順序付け用の中心 x は 1 パス目の値に固定し、カードの実位置だけが予約を持つ。予約が後段の層の順序を変えると、予約を測った行とは別の行が出てくるため（TPL-2611 そのものの失敗様式）。
9. **行の外端には予約しない。** 行の外側のカードの脇は最初から配線に開いており、中央寄せがカードを読んで外端の予約を消すので、予約しても効かない。
10. **grouped ビュー（frames があるビュー）では予約しない。** 内部回廊はそこでは提供されない（ADR-1859 の保証を維持）ので、予約はバイト同一の出力のために 2 パス目を払うだけになる。
11. `placementPasses` は 1 か 2 のまま。行の予約（ADR-2598）と列の予約は同じ 1 回の再配置で適用する。予約が空のビューは 1 バイトも変わらない。

### `widthBudget` / `widthBound` との契約

- `widthBudget` が縛るのは折り返しだけで、最終的な canvas 幅ではない。予約が入ったビューの canvas 幅は `widthBudget` を超えうる。side external column とコンテナ chrome が ADR-2593 の時点で既に同じ性質を持つので、新しい破れではない。
- `widthBound` は 1 パス目の配置だけで判定する。予約は折り返し判定に入らないので、2 パス目が `widthBound` を変えることはない。
- 幅予算は再探索しない（ADR-2598 と同じ判断）。予約後の面積は出力として記録するにとどめ、目的関数には返さない。

## 理由

- **dummy node の価値のうち karasu が受け取れるのは空間の予約だけである。** system view の層内順序は kind tier と宣言順で決まり、barycenter は意図的に外してある（`forcedLayers`）。dummy を順序決定に参加させても system view では何も動かない。drill-down で列を作るには行の中央寄せを捨てる必要があり、それは ADR-458 が別の理由で却下した見た目の変更である。
- **偽ノードが存在しないので、「dummy node が layout の外から観測されない」を型で保証できる。** `nodeMetadata` / deep link / outline / crossing marks / diff / draw.io export のどれにも「これは無視しろ」を配らずに済む。
- **ADR-2598 と同じ形（測定 → 構造キーで予約 → 1 回だけ置き直し）に乗る。** 決定性・floor-first・パス数上限の議論が済んでいる。
- **計測が「幅を増やさずに直せる分」と「幅を増やさないと直せない分」を分けていた。** 到達性を先に入れ、測り直してから予約量を決めた。

### 計測結果（dify、20 view / 1,102 エッジ、実装 PR #2785 時点）

| 指標 | main | 本決定 |
| --- | --- | --- |
| ガターへ出るエッジ | 987 | **592**（−40.0%） |
| 内部回廊を通るエッジ | 42 | **416** |
| 共線で重なるセグメントのペア（水平 / 垂直） | 3 / 13 | **0 / 0** |
| カード貫通 | 7 | 7（不変。全て root view の既存分） |
| セグメント交差 | 29,232 | 24,172（−17.3%） |
| 経路長の合計 | 3,008k px | 2,624k px（−12.8%） |
| canvas 面積の合計 | 126.1 Mpx | 113.8 Mpx（**−9.7%**） |
| 幅 85% より右の waypoint（`Knowledge` / `Workflow`） | 58 / 42 | 54 / 34 |

設計時は予約で面積 +4.4% と見積もったが、実測では面積は減った。列は既に存在しており、そこを使うことでガターのレーンが content の外に積み上がらなくなったためである。

コスト: 同じ corpus のレイアウトが 235ms → 344ms（最重の `Knowledge` は 45ms → 64ms）。slice A が垂直軸で払った分（ADR-2598 の `Knowledge` 85 → 127ms）と同程度。

### 実装が設計から変えた点

1. **列は不足分全部ではなく、足りない行に 1 本だけ開ける。** 不足分全部を開けるとガター送りはさらに減る（−51.8% 対 −40.0%）が、交差 −16.1%、経路長 −9.5%、面積 −9.2% と、効いてほしい指標がすべて 1 本版（−17.3% / −12.8% / −9.7%）より悪い。列が 1 本増えるたびにその行が広がるためである。設計が求めた「第 1 段の後に測り直す」がこの結論を出した。
2. **右半分の waypoint 比率を指標から外す。** #2598 は `Knowledge` の 204/460 を追っていたが、実装後は 359/676 に上がった。staircase が canvas 中央に折れ点を足すので比率は上がるが、右端の積み上がり自体は薄くなっている（85% より右 58 → 54、`Workflow` 42 → 34、canvas 幅も 4,995 → 4,573 / 3,653 → 3,080）。経路が 2 折れの L 字でなくなった時点で、比率は代理指標として意味を失った。
3. **交差数はテストでピン留めしない。** 計測して記録するが、ADR-1859 の「交差は最小化ではなく表現で中和する」に従い、`routing-parity.test.ts` では assert しない。ピン留めすると経路短縮の変更と綱引きになる。

## 却下した案

### 案1: 教科書どおりの Sugiyama dummy node chain

層をまたぐエッジを通過する層ごとの dummy node に分解し、順序決定と座標割り当てに参加させる。

- system view では順序決定が走らない（`forcedLayers`）ので効かない。
- ADR-1737 の grid wrap と衝突する。層が sub-row に折り返されると dummy chain がどの sub-row に属するかが決まらず、各 sub-row が独立に中央寄せされるので chain の x は列にならない。
- 列にするには座標割り当てごと Sugiyama 化して行の中央寄せを捨てる必要があり、全スナップショットが動く。ADR-458 が却下した左揃え相当の見た目変更である。
- 偽の `LayoutNode` は下流の全消費者に「無視しろ」を配ることになり、登録漏れが 1 つあれば deep link や outline に幽霊が出る。TPL-1954 の「形でゲートしたパスは新しい形を素通りする」と同型の穴を消費者側に新設する。

### 案2 単独: 列の予約だけ

到達性を直さずに予約だけ入れると、既に空き列がある 243 本（ガター送りの 45%）のために幅を払うことになる。そこは幅コスト 0 で回収できる。

### 不足分全部の列を予約する

「実装が設計から変えた点」1 のとおり、ガター送りの削減と引き換えに交差・経路長・面積がすべて悪化する。

## 残る限界

- **grouped ビューでは内部回廊を出さない**（`frames.length === 0` のゲートを維持）。「frame をまたがない回廊だけ許す」で ADR-1859 の保証を保てるかは決めていない。grouped 側は trunk が別の解を持つので優先度は低い。
- **multi-system root と deploy view は予約を受けない。** canvas 全体で一意な行序数が無い（ADR-2598 の限界と同じ）。到達性の半分はこれらのビューでも効く。
- **計測表の共線 0 / 0 とは別に、root view の grouped 軸で共線ペアが 4 つ残った**（13 から減少）。すべて同じ target へ入る 2 本のエッジ間で、本 ADR の対象ではなく slice E（#2631）の分類である。ADR-2631 はこれを trunk 兄弟の共有として肯定的に固定した。
