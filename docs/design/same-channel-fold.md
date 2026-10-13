# 同じチャネルに降りる corridor / mixed route の折り返しをなくす

- **日付**: 2026-10-13
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3134](https://github.com/kompiro/karasu/issues/3134)（#3026 の計測中に発見）
  - 関連 ADR: [ADR-2611](../adr/2611-layer-spanning-edge-columns.md)（corridor のチャネル stub と列の claim）、[ADR-1859](../adr/1859-system-view-p2c-grouped-edge-routing-and-marks.md)（mixed route。素朴な channel routing の却下）、[ADR-2598](../adr/2598-edge-routing-channel-capacity.md)（行間チャネルのレーンと容量予約）、[ADR-3088](../adr/3088-channel-lane-order-by-turn.md)（チャネルのレーンの上下順）、[ADR-3026](../adr/3026-same-row-channel-route.md)（`channelStub` の共有）
  - 関連 TPL: [TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)、[TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)、[TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)、[TPL-3088](../test-perspectives/TPL-3088-later-pass-moves-ends-in-the-direction-earlier-separation-assumed.md)
  - コード: `packages/core/src/renderer/edge-routing-groups.ts`、`packages/core/src/renderer/edge-routing-lanes.ts`

## 背景・課題

Umami の `UmamiApp` drill-down で、同じ 2 枚のカードを双方向に結ぶエッジの組が 2 組、1 本の x 上で縦線を約 28px 共有している（兄弟以外の共線ペア、TPL-1927）。

| 組 | x | y 範囲 |
| --- | --- | --- |
| `SessionReplay -> TrackedEntities` / `TrackedEntities -> SessionReplay` | 952.2 | 289..331 / 303..345 |
| `Sharing -> Teams` / `Teams -> Sharing` | 599.8 | 482..524 / 510..538 |

Issue は「claim で離した 2 本の縦線を `distributeChannelLanes` が寄せた」可能性を挙げていた。調べると、2 本の縦線はそもそも claim されていなかった。

`SessionReplay`（y=180..282）と `TrackedEntities`（y=380..482）は**隣り合う行**にある。間にあるのは行間チャネル 1 本だけで、staircase（2 行以上離れた組だけが対象）は通らない。経路を組んだのは corridor 候補（`tryCorridorRoute`）である。

1. 両端とも横の stub が同じ行の兄弟に塞がれるので、`mixedEnd` は両端を top/bottom port からチャネルへ降ろす。source は下のチャネル、target は上のチャネルへ降りるが、隣り合う行なのでそれは**同じチャネル**で、`src.cy === tgt.cy` になる。
2. 経路は `port → (cx, cy) → (corridorX, cy) → (corridorX, cy) → (cx', cy) → port` になり、corridor の縦線は長さ 0 になる。描くと 1 本の横線にしか見えない。
3. `claimedSegmentsOf` は長さ 0 の線分を claim しない。同じ組の逆向きのエッジも同じ `corridorX` を選び、衝突は検出されない。
4. `channelRunsOf` は長さ 0 の縦線の所で run を 2 本に分ける。2 本の run は `corridorX` で接しており、`LANE_SHARE_GAP` を満たさないので、`distributeChannelLanes` は別々のレーンに置く。これで長さ 0 だった縦線がレーン間隔ぶんの長さを持つ。
5. 逆向きのエッジでも同じことが起き、2 本の縦線が同じ x で重なる。

つまり 1 本の run で済むエッジが、チャネルの中で折り返す（以下「折り返し」）。重なりが無い場合でも、1 本のエッジがレーンを 2 本使い、意味の無い段差を描く。

同じ形は mixed route（`planMixedRoute`）でも起きる。両端がチャネル stub で同じチャネルに降りると、ガター x の縦線が長さ 0 になる。WordPress の `WordPressApp` に残る共線 2 組（x=2164、`Discussion -> Content` とガターの縦線）はこれである。

## 現状（インベントリ）

| 箇所 | 振る舞い |
| --- | --- |
| `tryCorridorRoute` | `[src.port, ...src.elbows, (corridorX, src.cy), (corridorX, tgt.cy), ...tgt.elbows, tgt.port]` を組む。`src.cy === tgt.cy` でもそのまま |
| `planMixedRoute` | 同じ形をガター x で組む |
| `claimedSegmentsOf` | 長さ 0 の縦線は claim しない（`Math.abs(a.y - b.y) > 1e-6`） |
| `corridorOfPath` / `cheapestSide` | ガター候補の corridor（同じ x の内側の点の組）を取り出してガターの混み具合を数える。corridor が無い経路は候補から外す |
| `channelRunsOf` | 両隣が縦の水平区間を 1 本の run とする。長さ 0 の縦線も「縦」なので、そこで run が切れる |
| `distributeChannelLanes` | 接するだけの 2 本の run は別レーンにする（`LANE_SHARE_GAP`） |

## 制約・前提

- never worse（AC-1）: 採る経路は障害物を横切らない。
- 新しい経路の形は、後に走る重なり回避のパス（レーン分け・port の扇）に参加する（TPL-1954）。ADR-1859 は「top/bottom port 固定で後段のパスに参加しない素朴な channel routing」を、重なりが 2 件増えるとして却下している。
- corridor と mixed はチャネルへの入り方を `mixedEnd` / `channelStub` で共有している。経路の組み立て方も揃える（TPL-219）。
- 柵（`routing-parity.test.ts`）の corpus にはこの入力が無い。直しても柵は 0 のまま変わらないので、届く入力を足す必要がある（TPL-2598）。
- 対象外: 同じ行の組（ADR-3026 の U 字）、staircase、side stub 同士の長さ 0 の corridor（`corridorOfPath` のコメントにある、同じ高さの横 stub の組。チャネルを通らないので折り返しにならない）。

## 検討した選択肢

計測は 4 つの逆生成モデル（Umami、Dify、Twenty、WordPress）の全ビュー。#3026 と同じ routing-parity の設定で、main（81161406）と比べた。

### 案1: 長さ 0 の縦線も claim する

チャネルの中にある長さ 0 の縦線も `verticalClaim` でチャネル全体ぶん claim する。逆向きのエッジは別の corridor x を選ぶ。

**メリット**

- 変更が 1 行。

**デメリット**

- 折り返しは残る。各エッジは段差を描いたまま 2 本のレーンを使う。重なりを別の x にずらすだけ。
- ガターの x は claim で調停されない（ガターのレーンは `distributeGutterLanes` が分ける）ので、mixed route の折り返しは直らない。WordPress の共線は 3 から 2 にしか減らない。

### 案2: 経路を組むときに折り返しを作らない

両端がチャネル stub で、`src.cy === tgt.cy` なら、corridor（またはガター）の 2 点を経路に入れない。経路は `port → (cx, cy) → (cx', cy) → port` になり、チャネルを 1 本の run で渡る。

- 新しい経路は元の経路の線分の部分集合なので、障害物の判定は元と変わらない（AC-1）。`corridorX` が両端の x の外にあって元の経路が行って戻っていた場合も、戻りの区間が消えるだけ。
- run は 1 本の channel run としてレーン分けに参加し、stub は従来どおり claim される（TPL-1954）。ADR-1859 が却下した「後段のパスに参加しない channel routing」には当たらない。

**2a: corridor だけ**: Umami の 2 組は直るが、WordPress のガター 2 組が残る。

**2b: corridor と mixed の両方**: 経路の組み立てを 1 つの関数にまとめ、両方から呼ぶ（TPL-219）。mixed route の折り返しを畳むと corridor が無い経路になるので、`cheapestSide` はそれを「ガターを使わない経路」として受け入れる（混み具合 0、ガターの占有に積まない）。

### 案3: レーン分けの側で吸収する

`channelRunsOf` が長さ 0 の縦線をまたいで run をつなぎ、1 本として動かす。

**メリット**

- 経路の形に依存しない（どの候補が作った折り返しでも拾う）。

**デメリット**

- 長さ 0 の点がエッジに残り、レーン順（`laneOrder`）、交差マーク、ラベル配置など後段のパスが引き続き見る。原因は経路を組む段にあり、後段で辻褄を合わせると TPL-3088 と同じ型の食い違いを残す。
- `corridorX` が両端の外にあるときの行って戻る区間は残る。

## 比較

| 観点 | main | 案1 | 案2a | 案2b |
| --- | --- | --- | --- | --- |
| 共線（縦、兄弟以外）Umami / WordPress | 2 / 3 | 0 / 2 | 0 / 2 | **0 / 0** |
| 交差 Umami / WordPress | 5266 / 70987 | 5265 / 70985 | 5262 / 70984 | **5262 / 70970** |
| 貫通（全モデル） | 14 | 14 | 14 | 14 |
| Umami `UmamiApp` の面積 | | −4.2% | −5.6% | −5.6% |
| Dify / Twenty の出力 | | 不変 | 不変 | 不変 |
| 変わったビュー | | 2 | 2 | 2 |
| 折り返しの段差 | 残る | 残る | corridor だけ消える | 消える |

貫通 14 は Dify の既存分で、どの案でも変わらない。案2b で `packages/core` の既存テスト 4944 件はすべて通り、snapshot の更新は無い（既存のフィクスチャはこの入力に届いていない）。

## 現時点の方針

**案2b を採用する**: 原因（長さ 0 の corridor）を経路を組む段で取り除くので、同じ型の折り返しを作る 2 つの候補を同時に直せる。共線は corpus 全体で 0 になり、交差は 21 減り、貫通は増えない。案1 は重なりの場所を変えるだけで段差が残り、案3 は原因を後段に持ち越す。

### 実装の指針

1. `edge-routing-groups.ts` に、2 つの端と corridor の x から経路を組む関数を置き、`tryCorridorRoute` と `planMixedRoute` から呼ぶ。両端がチャネル stub で `cy` が一致するときは corridor の 2 点を入れない。
2. `cheapestSide` は corridor が無い経路を受け入れ、混み具合を 0 とする。戻り値の `corridor` は `null` を取りうる型にし、呼び出し側（`routeGroupedEdges`）は選んだ経路に corridor があるときだけ `occupancy` に積む。
3. テスト:
   - unit: 隣り合う行の組で両端の横 stub が塞がれた corridor 経路と mixed 経路が、waypoint 2 点（チャネル 1 本の run）になること。
   - 柵: `routing-parity.test.ts` に、隣り合う行の双方向の組を持つ合成入力を 2 つ（ungrouped で corridor を通るもの、grouped で mixed を通るもの）足し、兄弟以外の共線 0・貫通 0 を assert する。修正を外すと落ちることを確かめる（TPL-2598）。
4. TPL: 「長さ 0 の区間は claim・重なりの判定から漏れるが、後段のパスが長さを与える」は TPL-3088（接するだけの要素）の隣にある別の失敗の形で、3-Yes を満たす。実装 PR で retrospective TPL-3134 を起こす。
5. changeset: `@karasu-tools/core` と `karasu` に patch（描画が変わる bug 修正）。
6. AT: 追加しない。確認したいのは共線の有無で、柵が機械的に確かめる。Umami `UmamiApp` の見た目は実装 PR の Manual Verification で確認する。
7. ADR 昇格: 実装完了後、`docs/adr/3134-same-channel-fold.md` として昇格し、本 Design Doc は同じ PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 隣り合う行の組で、両端が同じチャネルに降りる経路の段差が消える。行間の予約が減ってビューが小さくなることがある（Umami `UmamiApp` で −5.6%）。
- ドキュメント更新: なし（`docs/spec/` に配線の規定は無い）。
- テスト・examples への影響: 既存 snapshot の変化なし。
