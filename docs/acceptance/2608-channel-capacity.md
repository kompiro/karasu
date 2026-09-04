---
type: product
---

# AT: 層間チャネルを通行量から寸法づけ、レーンを資源キーで割り当てる（#2608）

- **日付**: 2026-09-04
- **関連 Issue**: [#2608](https://github.com/kompiro/karasu/issues/2608)（親: [#2598](https://github.com/kompiro/karasu/issues/2598) スライス A）
- **Related TPLs**: [TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)（計測柵は資源の限界に達する入力を持って初めて柵になる）, [TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)（新しい route 形が overlap 回避パスを素通りしない）, [TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)（貫通と重なりを同じテストで測る）, [TPL-2593](../test-perspectives/TPL-2593-layout-feedback-is-floor-first-and-monotone.md)（配置へ測定値を返す経路の規律）, [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)（並列関数のパリティ）
- **対象ファイル**:
  - `packages/core/src/renderer/edge-routing-lanes.ts`（資源キーの run 列挙・固定ピッチのレーン割り当て）
  - `packages/core/src/renderer/layout.ts`（1 回目の配線で測った需要を予約して 2 回目の配置を走らせる）
  - `packages/core/src/renderer/layer-layout-logics.ts`（行序数ごとの追加 gap と行構成の報告）
  - `packages/core/src/renderer/edge-routing-groups.ts`（ガター fan-out を attachable span の上で行う）
  - `packages/core/src/renderer/layout-edges.ts`（共有チェーンの配線順）

> 層間チャネルの高さは `LAYER_GAP` / `NODE_GAP` の余りで、そこを何本のエッジが通るかは配置時点で誰も知らなかった。レーン割り当ては 18px の帯を N+1 分割し（31 本で 0.56px）、しかも waypoint がちょうど 2 個の経路しか対象にしていなかった。**レーンの対象を「内部 waypoint 間の水平 run」という資源で定義し、ピッチを固定し、1 回目の配線で数えた本数分の場所を行間に予約して 2 回目の配置を走らせる。** 既定の gap で足りる view は 2 回目を走らせず、出力は 1 バイトも変わらない。

## 受け入れ条件

### AC-1: チャネルを飽和させる fixture で collinear overlap が両軸 0、貫通 0

- [x] AT-A: service 10 → target 3（30 エッジ）の合成モデルが実際にチャネルを混雑させる（20 本以上が配線される）

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `crowded inter-row channel — capacity fence (#2608, TPL-2598)` › `the fixture actually crowds a channel`

- [x] AT-B: 同 fixture で水平方向の collinear overlap が 0（修正前のツリーで 110 ペアを検出することを確認してから固定した）

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `crowded inter-row channel — capacity fence (#2608, TPL-2598)` › `no two horizontal runs share a collinear channel lane`

- [x] AT-C: 同 fixture で垂直方向の collinear overlap が 0

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `crowded inter-row channel — capacity fence (#2608, TPL-2598)` › `no two vertical runs share a collinear corridor`

- [x] AT-D: レーンが行のカードへ溢れない（貫通 0。ピッチ固定だけでは重なりが貫通に化けるので、同じテストで測る）

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `crowded inter-row channel — capacity fence (#2608, TPL-2598)` › `no lane spills into a card (TPL-1927 measures both axes together)`

- [x] AT-E: 既存 corpus（examples 12 モデルの ungrouped、grouped 4 モデル、multi-system root）の貫通 0 / overlap 0 と grouped の固定交差数が変わらない

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `shared routing chain — ungrouped fences (#2362, TPL-1927)` › `%s: no two edges share a collinear corridor`; `packages/core/src/renderer/routing-parity.test.ts` › `shared routing chain — grouped output is unchanged (#2362, AC-5 replacement)` › `%s (group by %s): penetration 0, %i crossings`

### AC-2: 経路の形を登録しなくても lane pass に参加する

- [x] AT-F: 4 waypoint の mixed route のチャネル run が、同じチャネルの内部 L と別レーンに分かれる

  > ✅ Automated — `packages/core/src/renderer/edge-routing-lanes.test.ts` › `distributeChannelLanes` › `enrols a mixed route's channel run alongside the interior L (TPL-1954)`

- [x] AT-G: チェーンが今日作らない形（10 bend、チャネル run 3 本）を直接流しても参加し、他の run は動かない

  > ✅ Automated — `packages/core/src/renderer/edge-routing-lanes.test.ts` › `distributeChannelLanes` › `enrols a route shape the chain does not produce today (TPL-1954)`

- [x] AT-H: ポートで終わる segment は run と数えない（動かすとノードから外れるため、分離はポート側の担当）

  > ✅ Automated — `packages/core/src/renderer/edge-routing-lanes.test.ts` › `channelRunsOf` › `does not count a segment that ends on a port`

- [x] AT-I: チャネルのキーは行間の帯であって正確な y ではなく、フレームもカードと同じく帯を区切る

  > ✅ Automated — `packages/core/src/renderer/edge-routing-lanes.test.ts` › `distributeChannelLanes` › `keys the channel on the band between rows, not on an exact y` ／ `bounds a channel by frames as well as cards`

- [x] AT-I2: 需要は「通る本数」ではなく x 範囲が重なる run の最大同時数。x 範囲が離れた run はレーンを共有し、端が接近する run は共有しない

  > ✅ Automated — `packages/core/src/renderer/edge-routing-lanes.test.ts` › `distributeChannelLanes` › `lets runs with disjoint x-ranges share a lane, and hands out lanes left to right` ／ `does not let two runs share a lane when their ends would meet`

### AC-3: レーンのピッチは本数に依存しない

- [x] AT-J: 2 本・5 本・31 本のいずれでも隣接レーンの間隔がちょうど `LANE_PITCH`

  > ✅ Automated — `packages/core/src/renderer/edge-routing-lanes.test.ts` › `distributeChannelLanes` › `keeps the pitch independent of how many edges share the channel (#2608)`

- [x] AT-K: 予約の無い経路（multi-system root）では帯の中に圧縮し、行へは溢れない（文書化された縮退）

  > ✅ Automated — `packages/core/src/renderer/edge-routing-lanes.test.ts` › `distributeChannelLanes` › `compresses into the band, never into the rows, when nothing reserved room`

### AC-4: 決定的で、2 回目の配置は最大 1 回

- [x] AT-L: 混雑 fixture では配置が 2 回走り、行幅予算は探索が選んだものを保つ

  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `layout > channel capacity (#2608)` › `places a crowded canvas twice, keeping the budget the search picked`

- [x] AT-M: 2 回目の行構成は 1 回目と同じで、行間の gap だけが広がる

  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `layout > channel capacity (#2608)` › `keeps the rows of the first pass: only the gaps between them grow`; `packages/core/src/renderer/layer-layout-logics.test.ts` › `placeNodesInLayers > channel reservation (#2608)` › `opens the reserved gap above the given row and changes nothing else`

- [x] AT-N: 既定 gap で足りる view は配置が 1 回で終わる

  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `layout > channel capacity (#2608)` › `runs the placement once when every channel fits the default gaps`

- [x] AT-O: 同じ入力を 2 回レイアウトすると座標と経路が完全に一致する

  > ✅ Automated — `packages/core/src/renderer/layout.test.ts` › `layout > channel capacity (#2608)` › `is deterministic across the second pass`; `packages/core/src/renderer/edge-routing-lanes.test.ts` › `distributeChannelLanes` › `is deterministic`

- [x] AT-P: 行序数は sub-row を含めて数え、層の先頭行にも予約できる

  > ✅ Automated — `packages/core/src/renderer/layer-layout-logics.test.ts` › `placeNodesInLayers > channel reservation (#2608)` › `reports rows in placement order, sub-rows included` ／ `reserves on a layer's first row too (the layer gap grows)`

### AC-5: 既存のレンダリング系テストが通る

- [x] AT-Q: core / cli / app の既存テストがスナップショットの書き換えなしで通る（bundled examples の 897 view で 2 回目の配置が走った view は 0、キャンバス寸法は全 view 同一）

  > ✅ Automated — `pnpm --filter @karasu-tools/core test`（4,084 件）、`pnpm --filter karasu test`（351 件）、`pnpm --filter @karasu-tools/app test`（1,362 件）

## 手動確認

N/A — 自動テストですべて覆っている。外部モデル（reverse-engineered dify）での before/after は PR 本文に実測を載せる（repo には入らないため柵にはしない）。
