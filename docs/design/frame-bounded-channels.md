# ドリルダウンの枠の内側でチャネルを測る

- **日付**: 2026-10-13
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3132](https://github.com/kompiro/karasu/issues/3132)（#3026 の試作中に発見。Issue のコメントで、片側が開いたチャネルも同じ種類だと追記）
  - 関連 ADR: [ADR-2598](../adr/2598-edge-routing-channel-capacity.md)（チャネルのレーンと 2 パスの予約）、[ADR-3026](../adr/3026-same-row-channel-route.md)（同じ行を回る経路と、片側が開いたチャネルの積み方。ghost カードを帯から外す案の却下）、[ADR-968](../adr/968-orthogonal-edge-routing-skip-layer.md)（行間チャネルを使う経路）
  - 関連 TPL: [TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)（飽和させる入力を持たない柵は柵にならない）、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)（同じ量を測る並行した関数は食い違う）、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)、[TPL-3026](../test-perspectives/TPL-3026-candidate-chain-covers-every-endpoint-relation.md)
  - コード: `packages/core/src/renderer/edge-routing-lanes.ts`（`collectChannels` / `distributeChannelLanes`）、`edge-routing-groups.ts`（`channelBelow` / `channelAbove`）、`layout.ts`（`channelReservations`）、`layer-layout-logics.ts`（`placeNodesInLayers`）
  - 計測: `reports/3132-frame-bounded-channels/`（gitignore。試作は `fix/3132-channel-lanes-in-frame`）

## 背景・課題

ドリルダウンのビューでは、表示中のコンテナ（例: `UmamiApp`）が 1 つの枠になってカードを囲む。最上段の上と最下段の下にある行間チャネルは、この枠を見ずに測られている。そのため、レーンが枠の線に載るか、枠の外に出る。

- **最下段の下に ghost カードがある場合（Issue 本文）**: Umami の `UmamiApp` では最下段が y 642 で終わり、枠の下端が y 762、枠の外の ghost カード `McpTools` が y 822 から始まる。チャネルは最下段と `McpTools` の間として測られ、中心が約 732 になる。2 本のレーンは y 745 と 759 に置かれ、759 の run のラベルは y 768（枠の外）に描かれる。
- **片側が開いている場合（Issue のコメント）**: 最上段の上・最下段の下に何も無いと、チャネルは片側が開いたものとして扱われ、レーンは行から離れる向きに 14px ずつ積まれる（ADR-3026 決定 6）。枠は障害物ではないので、本数が増えると枠を越える。`UmamiApp` の最上段の上では 7 本目から枠の外に出る。

同期と非同期の依存を互いに張った 5 枚の 1 行（`S/App` のドリルダウン）で測ると、main では run が枠の上端（y 84）を越えて y 40 まで、下端（y 340）を越えて y 414 まで伸び、枠の内側の帯からはみ出す run が 14 本ある。

## 現状（インベントリ）

チャネルを測る場所は 3 つあり、どれも枠を見ていない。

| 場所 | 何を決めるか | 境界の取り方 |
| --- | --- | --- |
| `channelBelow` / `channelAbove`（`edge-routing-groups.ts`） | mixed 経路・corridor 経路・同じ行を回る経路が、カードの上下からチャネルへ出るときの y | 隣の行で最も近いカードとの中点。無ければカードから `GUTTER_GAP`（28px）。ghost カードも数える |
| `collectChannels` の `bandAround`（`edge-routing-lanes.ts`） | run をどのチャネルに入れるか（キー）、レーンの中心 | カードと group 枠の上下で最も近いもの。ドリルダウンの枠は全 run を囲むので、障害物としては何も区切らない |
| `channelReservations`（`layout.ts`） | 2 パス目で広げる行間 | 両側が閉じたチャネルだけ。片側が開いたもの、行 0 の上は対象外 |

枠の寸法は `layoutInner` が配置の後に決める。上はタイトル帯（`CONTAINER_LABEL_HEIGHT` = 30px、タイトルは枠の上端から 18px の位置に 12px で描く）と余白、下は最終行の下に余白を足した位置。ghost カードは枠を基準に、その外側へ置かれる。

## 制約・前提

- **枠の無いビューは変えない。** system ビュー、複数 system の root、deploy ビューのチャネルは今のまま。
- **予約は ADR-2598 の枠内で行う。** 配置は最大 2 回、予約量は `測ったレーン数 × LANE_PITCH` から一意に決める。足りているチャネルのために枠を広げない。
- **ghost カードを障害物から外さない。** ADR-3026 で却下済み（twenty の `TwentyServer` で貫通が 8 件増え、umami のレーンは動かなかった）。
- **3 か所は同じ境界を使う。** router が置く y、レーンの中心、予約の量がそれぞれ別の境界で測られると、また食い違う（TPL-219）。
- out of scope: 横方向（ガターのレーンが枠の左右を越える件）、ラベルの衝突回避が枠の線を見ない件、group 枠の内側のチャネル、複数 system の root の system 枠。最後の 2 つは今回の変更で悪化しない。前の 2 つは follow-up に回す（後述）。

## 検討した選択肢

### 案1: 枠の内側の 2 本の線をチャネルの境界に加える

枠のタイトル帯の下端（`ceiling` = 枠の y + 30）と枠の下端（`floor`）を、カードと同じくチャネルの境界として扱う。3 か所は同じ値（`ChannelLimits`）を受け取る。

- **router**: `channelBelow` は「次の行で最も近いカードの上端」と `floor` のうち近いほうとの中点を返す。`channelAbove` も同様に `ceiling` を使う。最下段の下に枠の外の ghost カードがあっても、枠の下端が先に来る。
- **レーン**: `bandAround` が 2 本の線を高さ 0 の障害物として数える。枠の中では最上段の上・最下段の下のチャネルも両側が閉じるので、レーンは帯の中心に `LANE_PITCH` で並ぶ。ADR-3026 の「行から離れる向きに積む」は、枠の無いビューの片側が開いたチャネルだけに残る。
- **予約**: 帯が `floor` で閉じたチャネルは、最終行の下の gap（行序数 `rows.length`）を広げる。帯が `ceiling` で閉じたチャネルは、行 0 の上の gap を広げる。配置は最終行の下の予約分だけ `childMaxHeight` を伸ばし、枠はそれに合わせて伸びる。行 0 の上の予約は行 0 以下を下げ、枠の上端は動かないので、間が広がる。

**メリット**

- 1 つの規則で Issue 本文（ghost カード）とコメント（開いたチャネル）の両方が直る。
- 帯が枠の中で閉じるので、行間チャネルと同じ扱い（中心に並べる、足りなければ予約する）がそのまま使える。新しい配置規則を足さない。

**デメリット**

- 枠の外側チャネルを使う経路は、足りていても位置が変わる。最上段の上の 1 本は y 152 から 140 へ、最下段の下の 1 本は 710 から 722 へ動く（`GUTTER_GAP` からの距離ではなく、行と枠の中点になる）。コーパスでの変化は 5 本（後述）。

### 案2: 今の位置を保ち、枠を越える分だけ押し戻す

router の y と ADR-3026 の積み方は変えず、レーンが枠の線に近づいたときだけ、行の側へずらすか間隔を詰める。

**メリット**

- 枠を越えないビューは 1 バイトも変わらない。

**デメリット**

- 同じチャネルに 2 つの規則（積む／押し戻す）ができ、どちらが効いたかが位置から読めない。
- 押し戻す場所が無いとき（本数が帯を超えたとき）は結局予約が要る。予約の判定には案1 と同じ境界が必要で、規則だけが 1 つ増える。
- 変化を抑える利点は小さい。案1 でもコーパスで動く経路は 5 本だった。

### 案3: ghost カードを帯の計算から外す

ADR-3026 で試して却下した。`bandAround` から外しても、router の `channelBelow` が ghost を数えるので umami の run は動かない。router からも外すと、twenty の `TwentyServer` で貫通が 8 件増えた。開いたチャネルの件（コメント）はそもそも直らない。

### 案4: 予約せず、枠の内側の帯にレーンを詰める

ADR-2598 の「予約の無い経路では帯に圧縮する」を枠の中にも使う。間隔が 14px を割ると線とラベルが重なり読めなくなる。ADR-2598 が「ピッチと予約は組でしか機能しない」として却下した形と同じなので採らない。

## 比較

| 観点 | 案1 | 案2 | 案3 | 案4 |
| --- | --- | --- | --- | --- |
| ghost カードの件 | 直る | 直る | 直らない | 直る |
| 開いたチャネルの件 | 直る | 直る（予約込み） | 直らない | 直るが詰まる |
| 規則の数 | 1（境界を足すだけ） | 2 | 1 | 1 |
| 足りているビューの変化 | 外側チャネルの経路が数 px 動く | 無し | 貫通が増える | 無し |

## 現時点の方針

**案1 を採用する。** 枠を「何も区切らない障害物」ではなく「内側に 2 本の線を持つもの」として測れば、枠の外の物（ghost カード）や何も無い空間でチャネルの幅が決まることが無くなる。境界が決まれば、行間チャネルのための仕組み（中心に並べる、足りなければ予約する）がそのまま使える。案2 は変化を抑えられるが、その利点はコーパスで 5 本分しか無く、規則が 2 つになる。

### 計測

試作（`fix/3132-channel-lanes-in-frame`）を main と比べた。

**実モデル**（umami / dify / twenty / wordpress の全ビュー、1,542 ビュー、7,659 本）:

| 指標 | main | 試作 |
| --- | --- | --- |
| 貫通 | 14 | 14（dify の root view の既存分） |
| 共線（垂直 / 水平） | 5 / 0 | 5 / 0 |
| 交差 | 196,175 | 196,175 |
| 枠の内側の帯から外れる run | 1 | 0 |
| 経路が変わった本数 | | 5（3 ビュー） |
| キャンバスが伸びたビュー | | 0 |

実モデルには外側チャネルを混雑させるものが無い。TPL-2598 に従い、飽和させる合成フィクスチャで測った。

**フィクスチャ**（同期と非同期の依存を互いに張った N 枚の 1 行、`S/App` のドリルダウン）:

| N | main の外れる run | main の枠（上〜下） | 試作の外れる run | 試作の枠 | 試作の配置回数 |
| --- | --- | --- | --- | --- | --- |
| 3 | 0 | 70〜326 | 0 | 70〜326 | 1 |
| 4 | 4 | 70〜326 | 0 | 70〜334 | 2 |
| 5 | 14 | 84〜340 | 0 | 70〜446 | 2 |

N = 5 の main では run が枠の上端より上（y 40）まで伸び、`normalizeCoordinates` が図全体を 14px 下げている。試作では枠が上下に伸び、レーンは 14px 間隔のまま枠の中に収まる。

### 実装の指針

1. `edge-routing-lanes.ts` に `ChannelLimits`（`ceiling` / `floor`）と `channelLimitsOf(frame)` を置く。枠が無ければ両方とも無限大で、今の挙動になる。`collectChannels` / `distributeChannelLanes` は `limits` を必須の引数で受け取り、2 本の線を高さ 0 の障害物として `bandAround` に渡す。
2. `edge-routing-groups.ts` の `channelBelow` / `channelAbove` は `limits` を受け取り、最も近いカードと枠の線のうち近いほうを使う。`mixedEnd` / `corridorEnd` / `tryCorridorRoute` / `planMixedRoute` / `trySameRowChannelRoute` は `limits` を引き回す。
3. `runRoutingChain` の `opts` に `enclosure: Rect | undefined` を必須の項目として足す（TPL-219: 呼び出し元ごとに答えを書かせる）。単一 system の `layoutInner` は表示中のコンテナの枠を渡す。複数 system の root と deploy ビューは `undefined`（予約の仕組みが無い、または枠がカードそのもの）。
4. `layoutInner` は渡した枠を `LayoutRun` に載せ、`channelReservations` は同じ枠でチャネルを測る。帯が `floor` で閉じたチャネルは行序数 `rows.length` を、`ceiling` で閉じたチャネルは行 0 を予約する。`placeNodesInLayers` は `rows.length` の予約を `childMaxHeight` に足す。
5. テスト:
   - `edge-routing-lanes.test.ts`: 枠の線が帯を閉じること（下に枠の外のカードがあっても、枠の下端が境界になる）。枠の無いときは今の積み方のまま。
   - `routing-parity.test.ts`: 上記フィクスチャ（N = 4, 5）で、全 run が枠の内側の帯に入り、貫通・共線が 0 で、配置が 2 回になること。main で落ちることを確かめてから固定する（TPL-2598）。
   - 既存の #3026 のケース（3 枚・5 枚）が引き続き通ること。
6. TPL: 実装 PR で retrospective な TPL-3132 を起こす。観点は「枠の中で分け合う資源（チャネル・ガターのレーン）は、その枠の内側を境界として測る」。横展開の実例として、ガターのレーンが枠の左右を越える件（4 モデルのドリルダウン 79 ビュー、縦の線分 3,100 本超）を載せる。
7. AT: `docs/acceptance/3132-frame-bounded-channels.md`。自動化できる条件は上記テストで判定する。手動は「Umami の `UmamiApp` をアプリで開き、最下段の下の 2 本と最上段の上の経路が枠の内側に描かれる」の 1 件だけ。
8. changeset: `@karasu-tools/core` と `karasu` に patch（ドリルダウンの経路の位置が変わる）。
9. ADR 昇格: 実装のマージ後に `docs/adr/3132-frame-bounded-channels.md` として昇格し、本 Design Doc は同じ PR で削除する。ADR-3026 決定 6 の適用範囲（枠の無いビューに限る）と、ADR-2598 決定 3 の予約先（行 0 の上と最終行の下を含む）を ADR 側で更新する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: ドリルダウンで最上段の上・最下段の下を通る経路の y が変わる（行と枠の中点へ）。外側チャネルが混雑するビューは枠が伸びる。
- ドキュメント更新: 無し（`docs/spec/` に経路の位置の規定は無い）。
- テスト・examples への影響: 既存のテストはすべて通る（試作で core 4,944 件）。

## 未解決の問い / 決めないこと

- **横方向の同じ欠陥**（follow-up Issue を起こす）: ガターのレーンは `maxRight + GUTTER_GAP + レーン × 24` で外へ伸び、枠の左右の余白（40px）を見ない。2 本目で枠を越え、Umami の `Analytics` では祖先の枠の外まで出る。枠の幅は配線の前に決まるので、直すには横方向の予約が要る。本件と同じ「枠の内側で測る」規則だが、仕組み（ガターの位置と枠の幅）が別なので分ける。
- **ラベルの衝突回避が枠の線を見ない**（follow-up Issue を起こす）: 試作でも `UmamiApp` の `Administration -> Teams` のラベルは、他のラベルを避けて run から 35px 下に押され、枠の下端の線に載る。run の位置は直っているので、ラベル配置（`label-placement.ts`）の障害物に枠の線を加える件として扱う。
- **group 枠の内側**: 同じ行を回る経路は ungrouped に限ったまま（ADR-3026 決定 2）。group 枠の内側のチャネルを枠で測る件は、その制限を外すときに扱う。
- **複数 system の root の system 枠**: 行序数が無く予約できない（ADR-2598 決定 4）。ここに境界だけ足すと、詰める以外の手が無いので今回は渡さない。
