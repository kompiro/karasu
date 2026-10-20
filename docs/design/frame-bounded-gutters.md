# ドリルダウンの枠の内側にガターのレーンを収める

- **日付**: 2026-10-16
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3154](https://github.com/kompiro/karasu/issues/3154)（#3132 の計測中に発見。[frame-bounded-channels.md](./frame-bounded-channels.md) の「未解決の問い」で follow-up にしたもの）
  - 関連 ADR: [ADR-2598](../adr/2598-edge-routing-channel-capacity.md)（2 パスの予約。3 回目は無い）、[ADR-2593](../adr/2593-canvas-space-objective.md)（行幅予算の探索）、[ADR-2611](../adr/2611-layer-spanning-edge-columns.md)（列の予約と `TRUNK_LANE_GAP`）、[ADR-2958](../adr/2958-gutter-lane-bundling.md)（ガターのレーンの束ね）、[ADR-1859](../adr/1859-system-view-p2c-grouped-edge-routing-and-marks.md)（ガターは内容の外にあるので構成的に貫通しない）
  - 関連 TPL: [TPL-3132](../test-perspectives/TPL-3132-resource-inside-a-frame-measured-against-the-frame.md)（枠の中の資源は枠の内側で測り、足りなければ枠を広げる。本件は同 TPL の「横方向の同型」）、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)、[TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)、[TPL-2611](../test-perspectives/TPL-2611-feedback-key-survives-the-next-pass.md)
  - コード: `packages/core/src/renderer/edge-routing-groups.ts`（`contentBounds` / `distributeGutterLanes` / trunk の 2 パス）、`edge-routing-lanes.ts`（`ChannelLimits`）、`layout.ts`（`layout()` の 2 パス目、`layoutInner` の枠の寸法）
  - 計測: `reports/3154-gutter-lanes-in-frame/`（gitignore。試作は `fix/3154-gutter-lanes-in-frame` に未コミット）

## 背景・課題

ドリルダウンのビューでは、表示中のコンテナが 1 つの枠になってカードを囲む。枠の左右の余白は `CONTAINER_PADDING`（40px）で、配線の前に決まる。一方、ガターの縦の線は内容の端から `GUTTER_GAP`（28px）の位置に置かれ、重なるものは `TRUNK_LANE_GAP`（24px）ずつ外へ積まれる。2 本目（内容から 52px）で枠の線を越え、本数が多いと祖先の ghost 枠の外まで出る。

Umami の `Analytics`（Issue のスクリーンショット）では、左右のガターに十数本が並び、右側は `UmamiApp` / `Umami` の ghost 枠の外まで伸びる。

逆生成した 4 モデルのドリルダウン全ビューで、ghost でも循環でもない edge の縦の線分のうち、x が枠の側面の上か外にあるもの:

| モデル | ビュー | 線分 |
| --- | --- | --- |
| umami | 7 | 88 |
| dify | 17 | 547 |
| twenty | 23 | 1,313 |
| wordpress | 32 | 1,152 |

## 現状（インベントリ）

| 場所 | 何を決めるか | 枠との関係 |
| --- | --- | --- |
| `contentBounds`（`edge-routing-groups.ts`） | ガターの基準 x（`minLeft` / `maxRight`）。`routeGroupedEdges`、`aggregateGroupTrunks`、`aggregateGroupSourceTrunks`、`distributeGutterLanes` が共有する | 全カードと group 枠から測る。**枠の外の ghost カードも数える**ので、枠の横に ghost の利用者（`placeGhostUsers`）や呼び出し元の ghost system がいると、1 本目から枠の外に置かれる |
| `distributeGutterLanes` | 2 本目以降のレーン x（右は trunk の外側から、左は内側から順に 24px ずつ） | 枠を見ない |
| `layoutInner` の枠の寸法 | 枠の幅 = 内容の幅 + 左右 40px | 配線の前に決まる。広げる仕組みが無い |
| `layout()` の 2 パス目 | 行間チャネル（#2608 / #3132）と行内の列（#2611）の予約 | 横方向の外側（枠の側面）は対象外 |

## 制約・前提

- **枠の無いビューは変えない。** system ビュー、複数 system の root、deploy ビューのガターは今のまま。
- **予約は ADR-2598 の枠内で行う。** 配置は最大 2 回。予約量は 1 回目の配線の測定から一意に決める。足りている枠は広げない。
- **ガターを使う 4 つのパスは同じ基準を使う**（TPL-219）。どれか 1 つでも別の基準で測ると、レーンの番号付けと左右の振り分けが食い違う。
- **基準がすでに枠の内側にあるビューでは、1 本目の位置は変えない。** 内容から 28px の 1 本目は枠の内側に収まっている。予約は 2 本目以降が要るときだけ。枠の横の ghost カードが基準を決めていたビューは、基準が枠の内側に移るので 1 本目も動く（案1 の 1）。
- out of scope: 枠の側面を見ないラベル配置（#3132 の follow-up と同じ扱い）、group 枠の内側のガター、複数 system の root の system 枠（行序数も枠の幅の予約先も無い）。

## 検討した選択肢

### 案1: ガターの基準を枠の内側で測り、足りない幅を枠の側面に予約する

#3132 と同じ「枠の内側で測り、足りなければ枠を広げる」規則を横方向に当てる。2 つの変更から成る。

1. **基準**: `ChannelLimits` に枠の側面（`left` / `right`）を足し、`contentBounds` は枠の内側にあるカードだけで `minLeft` / `maxRight` を測る。枠の横の ghost カードはガターの基準にならない。4 つのパスは同じ `limits` を受け取る。枠が無ければ `left` / `right` は無限大で、今の挙動になる。
2. **容量**: `layout()` は 1 回目の配線を見て、ghost でも循環でもない edge の縦の線のうち、枠の側面から `FRAME_SIDE_MARGIN`（12px = `CONTAINER_PADDING - GUTTER_GAP`、今 1 本目と枠の間にある隙間）より外にあるものの最大のはみ出しを、左右それぞれ測る。どちらかが正なら、2 回目の配置で枠をその分広げる。`layoutInner` は行を中央に寄せた後、カードを左の予約分だけ右へずらし、枠の幅に左右の予約を足す。ghost カードと祖先の枠は枠から配置されるので、一緒に外へ動く。

**メリット**

- 枠の横の ghost カードの件（1 本目から外）と、本数の件（2 本目から外）の両方が、1 つの規則で直る。
- 予約は既存の 2 パス目に相乗りするので、配置の回数は増えない（コーパスで 2 回目を走らせたビュー数は main と同じ）。
- 基準がすでに枠の内側にあり、1 本しか使わないビューは 1 バイトも変わらない。

**デメリット**

- 2 回目の配置で行間チャネル・列の予約も効くので、経路が 1 回目と変わり、レーンが 1〜2 本増えることがある。3 回目は無いので、その分ははみ出したまま残る（ADR-2598 の「上限の明示であって不動点の保証ではない」と同じ扱い）。
- 枠の横に ghost カードがあるビューでは、レーンが ghost カードと内容の間に入るので、ghost の edge がレーンを横切るようになる。そのぶん 1 回目のキャンバスの幅が変わり、行幅予算の探索が別の予算を選ぶことがある（下記の計測で 1 ビュー）。

### 案2: 案1 に加え、行幅予算の探索を予約込みの幅で採点する

ADR-2593 は「採点は最終キャンバス」と決めている。側面の予約は最終キャンバスの幅に入るので、探索の採点にも足す。

**メリット**

- 予約後の幅で比べるので、案1 で探索が予算を変えた 1 ビュー（`Twenty.TwentyServer`）は main と同じ予算に戻る。

**デメリット**

- 予約が要るビューの多くで採点が変わり、コーパスで 11 ビューの予算が変わる。予算が変わったビューはカードの並びごと組み替わるので、枠が広がるだけの案1 より差分が大きい。交差はビューごとに −337〜+496 とばらつき、main との差の合計は +548（案1 は +2,000 で、ほぼ `Twenty.TwentyServer` 1 ビュー分）。
- ADR-2598 は「幅予算は探索が選んだものを固定する」として、行間チャネルの予約を採点に入れていない。側面だけ採点に入れると、予約の扱いが軸ごとに分かれる。

### 案3: 予約せず、枠の内側にレーンを詰める

枠の側面と内容の間の 12px に収まるよう、はみ出す側のレーンの間隔を縮める。ADR-2598 が「ピッチと予約は組でしか機能しない」として却下した形と同じ。レーンが十数本あるビュー（`Analytics`）では間隔が 1px を割る。

### 案4: 枠の側面を配線の後に決める

配線を終えてから枠の幅を測り、ghost カードと祖先の枠を置き直す。ghost の edge は ghost カードの位置から配線されるので、ghost の配置と配線の順番を入れ替える必要があり、`layoutInner` の構成を組み替えることになる。予約で同じ結果がほぼ得られるので採らない。

## 比較

| 観点 | 案1 | 案2 | 案3 | 案4 |
| --- | --- | --- | --- | --- |
| はみ出す縦の線分（4 モデル計） | 3,100 → 31 | 3,100 → 32 | 0 になるが詰まる | 0 |
| 予算が変わるビュー | 1 | 11 | 0 | 0 |
| 交差（main との差、4 モデル計） | +2,000 | +548 | | |
| 貫通（main 0） | 1 | 0 | | |
| 配置の回数 | 2 回のまま | 2 回のまま | 1 回 | 1 回 |
| 変更量 | 小（基準と予約） | 小 | 小 | 大（`layoutInner` の組み替え） |

## 現時点の方針

**案1 を採用する。** 枠の内側にガターの基準を置けば、枠の外の物（ghost カード）でガターの位置が決まることが無くなる。基準が決まれば、行間チャネルと同じ「足りなければ 2 回目の配置で予約する」がそのまま使える。

案2 との違いは探索の採点だけで、判断が分かれる。案2 は交差の合計と貫通で勝るが、その差はほぼ `Twenty.TwentyServer` 1 ビューから来ており、代わりに 11 ビューのカードの並びを組み替える。本件は「枠の中にレーンを収める」修正なので、図の変化を枠の幅に留める案1 を採る。予約を採点に入れるかどうかは、行間チャネルの予約（ADR-2598 も採点に入れていない）と揃えて別に決める。

### 計測

試作（`fix/3154-gutter-lanes-in-frame`）を main（`8dff6bb5`）と比べた。

**実モデル**（umami / dify / twenty / wordpress の全ビュー、1,542 ビュー、7,659 本）:

| 指標 | main | 試作 |
| --- | --- | --- |
| はみ出す縦の線分 | 3,100（79 ビュー） | 31（21 ビュー） |
| 貫通 | 0 | 1（`Twenty.TwentyServer`、下記） |
| 共線（垂直 / 水平） | 0 / 0 | 0 / 0 |
| 交差 | 196,183 | 198,183（+2,018 は `Twenty.TwentyServer` のみ。ほかは `Analytics` +9、`XmlRpc` −27） |
| 幅が増えたビュー | | 80（+12〜+172px。`Twenty.TwentyServer` は +534px） |
| キャンバス面積 | 1,570.3 Mpx | 1,593.3 Mpx（+1.5%） |
| 2 回目の配置を走らせたビュー | 99 | 99 |

- 残る 31 本は、2 回目の配置で行間チャネル・列の予約が効いて経路が変わり、レーンが 1 本（19 ビュー）か 2 本（2 ビュー）増えた分。どれも枠の線上か、線から 12〜36px 外。
- `Twenty.TwentyServer` は枠の左に ghost の利用者が 2 つある。main では左のガターがその ghost カードの外に並び、1 回目のキャンバスはそこまで広かった。試作ではレーンが枠の内側に入ってキャンバスが狭くなり、探索が 1 行 3 枚の予算を選んだ。新しい配置では同じ行の `ConnectedAccounts → Calendar` の間に `Messaging` が立ち、同じ行を回る経路（ADR-3026）が両側とも塞がれて直線のまま残る（貫通 1）。経路の欠落そのものは本件の前からある制限で、配置が変わって表に出たもの。

**フィクスチャ**（`S/App` のドリルダウン。T / M / B の 3 行で、各 T が M を 1 つと全 B を同期・非同期の両方で呼ぶ。M の行が T → B の直線を塞ぐ）:

| N | main のはみ出し | main の枠（左〜右） | 試作のはみ出し | 試作の枠 |
| --- | --- | --- | --- | --- |
| 3 | 0 | 70〜894 | 0 | 70〜894 |
| 4 | 1 | 70〜1114 | 0 | 70〜1198 |
| 5 | 6 | 70〜1334 | 0 | 70〜1646 |

### 実装の指針

1. `edge-routing-lanes.ts`: `ChannelLimits` に `left` / `right`（枠の側面）を足す。`NO_CHANNEL_LIMITS` は無限大、`channelLimitsOf(frame)` は `frame.x` と `frame.x + frame.width`。
2. `edge-routing-groups.ts`: `contentBounds(nodes, frames, limits)` は枠の内側にあるカードだけを数える。`aggregateGroupTrunks` / `aggregateGroupSourceTrunks` / `distributeGutterLanes` は `limits` を受け取る（`routeGroupedEdges` は受け取り済み）。`runRoutingChain` は 4 つに同じ `limits` を渡す。
3. `layout.ts`: `gutterReservations(result, enclosure)` を足す。測る対象は ghost でも循環でもない edge の縦の線分で、境界は `channelLimitsOf(enclosure)` の `left` / `right` から `FRAME_SIDE_MARGIN` 内側。`layout()` は既存の `reservations` / `columns` と並べて測り、どれかがあれば 2 回目の `layoutInner` に渡す。`layoutInner` は `centerRowsHorizontally` の後、枠を作る前に、カードを左の予約分だけ右へずらし、`childMaxWidth` に左右の予約を足す。行幅予算の探索の採点は変えない。
4. テスト:
   - `routing-parity.test.ts`: 上記フィクスチャ（N = 4, 5）で、ghost でも循環でもない edge の縦の線がすべて枠の側面から `FRAME_SIDE_MARGIN` 以上内側にあり、枠が広がり、貫通・共線が 0 であること。main で落ちることを確かめてから固定する（TPL-2598）。
   - 同じファイルに、枠の左に ghost の利用者がいるドリルダウンで、1 本目のガターが枠の内側にあることのケースを足す（基準の件）。
   - `edge-routing-lanes.test.ts`: `channelLimitsOf` が側面を返すこと（#3132 のケースを更新）。
   - 基準がすでに枠の内側にあり、1 本しか使わないビューで配置が変わらないこと（既存のスナップショットが通ることで確認）。
5. TPL: 新しい TPL は起こさない。TPL-3132 が「横方向の同型」として本件を既に挙げているので、「既知の対処パターン」と「関連テスト」に本件を足す（3-Yes ルールの 3 つ目「既存 TPL に未掲載」を満たさない）。
6. AT: `docs/acceptance/3154-frame-bounded-gutters.md`。自動化できる条件は上記テストで判定する。手動は「Umami の `Analytics` をアプリで開き、左右のガターが `Analytics` の枠の内側に描かれる」の 1 件。
7. changeset: `@karasu-tools/core` と `karasu` に patch（ドリルダウンの枠の幅とガターの位置が変わる）。
8. ADR 昇格: 実装のマージ後に `docs/adr/3154-frame-bounded-gutters.md` として昇格し、本 Design Doc は同じ PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: ガターを 2 本以上使うドリルダウンは、枠が左右に広がる（コーパスで 80 ビュー、多くは +100〜+150px）。枠の横に ghost カードがあるビューは、1 本目のガターが枠の内側に移る。
- ドキュメント更新: 無し（`docs/spec/` にガターの位置の規定は無い）。
- テスト・examples への影響: 試作で core の既存テストは `channelLimitsOf` の形を確かめる 1 件を除いて通る（5,024 件）。

## 未解決の問い / 決めないこと

- **2 回目の配置で増えたレーン**: 31 本（21 ビュー）が残る。直すには 3 回目の配置か、2 回目の経路を 1 回目に寄せる仕組みが要る。ADR-2598 が 3 回目を置かないと決めているので、本件では変えない。
- **予約を探索の採点に入れるか**: 行間チャネルの予約も入れていない。入れるなら両方を同時に決めるべきで、本件の外に置く（案2）。
- **同じ行を回る経路が塞がれたときの直線**: `Twenty.TwentyServer` の貫通 1 件。経路の候補が尽きたときの扱いは ADR-3026 側の問題として follow-up Issue にする。
- **ラベル配置が枠の側面を見ない**: #3132 の follow-up と同じ件として扱う。
