# ghost entity / ghost domain を、外部ドメインごとの枠に入れて幅予算の中で並べ、routing chain に通す

- **日付**: 2026-11-14
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2823](https://github.com/kompiro/karasu/issues/2823)
  - 切り出した Issue: [#3804](https://github.com/kompiro/karasu/issues/3804)（ハブのエンティティに集まる接続線の密度。[#2728](https://github.com/kompiro/karasu/issues/2728) と同じ問い）
  - 関連 ADR: [ADR-460](../adr/460-ghost-domain-edges.md)（ghost domain を下に置く）、[ADR-1911](../adr/1911-cross-domain-ghost-entities.md)（ghost entity に同じ行を使う）、[ADR-2593](../adr/2593-canvas-space-objective.md)（幅予算の探索）、[ADR-2598](../adr/2598-edge-routing-channel-capacity.md)（チャネルのレーンと予約）、[ADR-3132](../adr/3132-frame-bounded-channels.md)（チャネルを枠の内側で測る）、[ADR-3154](../adr/3154-frame-bounded-gutters.md)（枠の側面の予約）、[ADR-328](../adr/328-ghost-system-rendering.md)（ghost system の枠）
  - 関連 TPL: [TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)、[TPL-2593](../test-perspectives/TPL-2593-layout-feedback-is-floor-first-and-monotone.md)、[TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)、[TPL-3026](../test-perspectives/TPL-3026-candidate-chain-covers-every-endpoint-relation.md)、[TPL-3132](../test-perspectives/TPL-3132-resource-inside-a-frame-measured-against-the-frame.md)、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)、[TPL-1223](../test-perspectives/TPL-1223-scoped-glance-drill-down.md)、本 PR で起こす [TPL-2823](../test-perspectives/TPL-2823-late-placed-elements-reach-shared-layout.md)
  - コード: `packages/core/src/renderer/ghost-layout.ts`（`placeGhostRow` / `placeGhostEntities` / `placeGhostDomains`）、`packages/core/src/renderer/layout.ts`（`layoutInner`）、`packages/core/src/renderer/layout-edges.ts`（`pushGhostEdges` / `runRoutingChain`）、`packages/core/src/view/entity-relations.ts`（`extractEntityView`）

## 背景・課題

エンティティビューは、他ドメインのエンティティとの関連を muted な ghost として描く（ADR-1911）。ghost は焦点の枠の下に 1 行で並ぶ。この行は ADR-460 が ghost domain のために作り、ADR-1911 がエンティティに流用したもので、どちらの ADR も ghost が数件の場合しか見ていなかった。

この行は、その後に入った配置と配線の仕組みを 1 つも通らない。

1. **配置**: `placeGhostRow` は x を 1 つずつ進めて全 ghost を 1 行に置き、外側の枠をその幅まで広げる。幅予算（ADR-2593）で折り返さない。探索は最終的な canvas で採点するが、どの予算でも行の幅は同じなので、横長の canvas がそのまま選ばれる。
2. **順序**: ghost は `extractEntityView` が見つけた順（自ドメインからの関連を宣言順、その後で他ドメインからの関連をドメインの順）に並ぶ。相手の自エンティティの x とは関係が無い。
3. **配線**: `pushGhostEdges` は相手のカードの下端中央と ghost の上端中央を直線で結ぶ。ports・channel・gutter・lanes・outline seating・crossing marks など、chain のほぼすべての段が `edge.ghost` を見て飛ばす（全体は決定 5 の一覧）。ghost が相手の真下に無いと、線は焦点の枠とカードを斜めに横切る。

### 実測（main `28f790cb`）

逆生成した 3 つのモデルで、ghost を持つエンティティビューは 82 件ある。そのうち 51 件が ADR-2593 の縦横比の範囲（16:9 から 9:16）の外にある。

| モデル | ghost を持つビュー | 範囲外 | 最も横長のビュー |
| --- | ---: | ---: | --- |
| Dify | 19 | 10 | `ApiBackend.IdentityAccess`: ghost 101 件、36,053 × 1,372（26 : 1） |
| Twenty | 21 | 17 | `TwentyServer.Tenancy`: ghost 71 件、20,527 × 940（22 : 1） |
| WordPress | 42 | 24 | `WordPressApp.Content`: ghost 82 件、20,614 × 1,030（20 : 1） |

範囲外になるのは ghost が多いビューだけではない。Twenty の `Files` は ghost 10 件で 5.2 : 1 になる。原因は件数ではなく 1 行に並べる配置そのものである。

service ビューの ghost domain は、3 モデルとも 0 件だった（service をまたぐ domain エッジが無い）。同じ `placeGhostRow` / `pushGhostEdges` を使うので同じ問題を持つが、実モデルでは見えていない。

### ghost が多いビューはハブである

ghost が 20 件を超えるビューでは、ghost の接続線の 70〜98% が自ドメインの 1〜2 エンティティに集まる（Dify `IdentityAccess` は 130 本のうち `Tenant` に 74 本、`Account` に 54 本。Twenty `Tenancy` は 88 本のうち `Workspace` に 71 本）。配置と配線を直しても、1 枚のカードに 70 本が入る密度は残る。この密度は本 Design Doc では扱わず、#3804 に切り出した。DifyDB の store canvas の #2728 と同じ問いなので、2 つを一緒に決める。

## 制約・前提

- **ghost は焦点の枠の外に置く。** 焦点の子と外部の参照を同じ枠に混ぜる案は ADR-460 の案 C で却下されている（境界があいまいになり、ドリルダウンのパスが崩れる）。
- **ghost を持たないビューは出力を変えない。** 帯の処理は ghost が無ければ何もしない。
- **幅予算の探索の性質を保つ（TPL-2593）。** 候補は入力だけで決まり、既定の予算が先頭で、厳密に小さい canvas だけが勝つ。帯は予算を受け取って折り返すだけで、新しいフィードバックの経路は作らない。
- **muted の描画は変えない。** ghost のカードと線は今と同じ不透明度で描く。
- **out of scope**: ハブに集まる線の集約（#3804）、ghost user / ghost system の配置と配線（左右の列で、今回の行とは別の仕組み）、system をまたぐエンティティ参照（ADR-1911 で v1 の対象外）。

## 検討した選択肢

### 配置

#### 案 P1: カードのまま、幅予算で行を折り返す

今の行を、幅予算を超える手前で次の行へ折り返す。

- メリット: 変更が最小。canvas は縦横比の範囲に入る。
- デメリット: 101 枚のカードがそれぞれドメイン名の subLabel を繰り返す。どの ghost が同じドメインのものかは、subLabel を読まないと分からない。#3804 で集約するときにも、集約する単位が図に無い。

#### 案 P2: 外部ドメインごとの muted 枠に入れ、枠を幅予算で折り返す（採用）

外部ドメインごとに ghost を 1 つの muted 枠にまとめる。ドメイン名は枠のタイトルに 1 回だけ出す。枠を幅予算で折り返して並べる。

- メリット: ドメインの境界が図に出る（ghost の目的、concepts の「Ghost」節）。Dify `IdentityAccess` の 101 枚は 18 ドメインのもので、決定 2 の規則で分けるとすべて上の帯に入り、16 枠と単独のカード 2 枚（ghost が 1 件だけのドメイン）になる。図はドメイン単位で読める。#3804 の集約の単位にもなる。ghost system の枠（ADR-328）と同じ見た目の語彙を使える。
- デメリット: 枠の分だけ面積が増える。枠の中の並べ方を決める必要がある。

ADR-460 は案 A（ghost domain を所属 service の枠で包む）を却下している。理由は 2 つで、「ドメインが 1 つだけなのに service の枠が出る過剰なラッピング」と「左右に置くと ghost system と衝突する」だった。後者は帯が上下にあるので当たらない。前者は件数が 1 件の枠にだけ当たるので、**「外部ドメイン（ghost domain なら外部 service）× 帯の側」の組で ghost が 1 件だけのものは枠を作らず、今と同じ subLabel 付きのカードとして帯に並べる**。枠は 2 件以上のときだけ作る。ghost が 1 件ずつ散らばったビューは今と同じ見た目のまま、予算で折り返すだけになる。

#### 案 P3: ghost を焦点の配置に混ぜる

ghost を焦点の層配置の中に入れ、相手の近くに置く。

- 却下: ADR-460 の案 C と同じ理由（境界があいまいになる）。

#### 案 P4: 帯を左右に置く

- 却下: 左右は ghost user と ghost system の場所（ADR-460 の「理由」節）。service ビューでは衝突する。

### 帯の位置

#### 案 S1: 下だけに置く

ADR-460 / ADR-1911 のまま、すべての ghost を焦点の枠の下に置く。

#### 案 S2: 関連の向きで上下に分ける（採用、kompiro が選んだ）

他ドメインから自ドメインを参照する ghost（incoming）は焦点の枠の上に、自ドメインが参照する ghost（outgoing）は下に置く。エンティティの関連は「参照する側 → 参照される側」の向きで、焦点の中の層配置も参照する側を上に置く（`assignLayers` は入る辺の無いノードを最上段に置く）。片方向の関連だけを持つ ghost の線は、上から下へ流れる。

- 自ドメインと両方向の関連を持つ ghost は、関連（`ghostEntityEdges`）の本数の多い向きで置く（incoming が多ければ上、outgoing が多いか同数なら下。同数のときは ADR-460 の既定の側）。その ghost の少ない向き（同数なら incoming）の関連の線だけは流れに逆らい、下から上へ向かう（下の帯から焦点へ、または焦点から上の帯へ）。同じ相手との相互の関連の対は両向きに 1 本ずつ数えるので、置く側はほかの関連で決まる（対だけなら同数で下）。対を 1 本の線にまとめる ADR-3027 は ghost の線を対象外にしているので、スライス A では対は重なった 2 本の直線のまま残り、スライス B で `mutual-pair.ts` に通すと 1 本になる。Dify では `IdentityAccess` に 2 件（どちらも上）、`AppManagement` に 1 件（同数で下）、`Workflow` に 4 件（上 1・下 3）ある。この規則は kompiro が PR #3842 で選んだ（常に下に置く案に代えて）。
- 外部ドメインが上下の両方に ghost を持つと、そのドメインの枠は上下に 1 つずつできる。

### 配線

#### 案 R1: 直線のまま、端点だけ相手の近くへ

並べ替えで線が短くなるので、配線は今のまま直線にする。

- 却下: 帯が複数段に折り返すと、2 段目以降の ghost は相手の真下（真上）に来ない。直線は 1 段目の枠とカードを横切る。

#### 案 R2: 帯の線を routing chain に通す（採用）

帯の線（ghost entity と ghost domain の線）を、ほかの線と同じ候補列（ports・channel・gutter・lanes・outline seating）と crossing marks に通す。muted の描画だけを残す。

## 現時点の方針

**案 P2 + 案 S2 + 案 R2 を採る。** 帯（焦点の枠の上下に置く ghost の並び）を、ほかの要素と同じ配置と配線の仕組みに通す。決定は 5 つ。

1. **外部ドメインごとの枠**: ghost entity を「外部ドメイン × 帯の側」ごとに 1 つの muted 枠に入れる。枠のタイトルはドメインのラベルで、枠の中のカードの subLabel は外す。ghost domain は「外部 service × 帯の側」ごとの枠に入れ、タイトルは service のラベルにする。枠の中のカードは `gridColumnCount(n)`（`layer-layout-logics.ts`）の列数で折り返す。
   - ghost が 1 件だけの組は枠を作らず、subLabel 付きのカードのまま帯に並べる（上の ADR-460 案 A の節）。
   - 帯の枠は `ContainerRect` に専用の印（例: `ghostBand: true`）を持たせ、`ghost: true`（祖先の枠の印）とは区別する。`id` は側とドメインを含む合成の値（例: `ghost-band:above:Workflow`）にして、同じドメインが上下に枠を持っても一意にする。`path` は持たせず、`containerStyleOf` のスタイル解決・`data-node-path`・ドリルダウンの対象にしない。描画は ghost system の枠（ADR-328）と同じ muted の枠にする。枠の中のカードは今の ghost カードと同じ扱い（キー・クリック・詳細パネル）のまま変えない。
2. **向きで上下に分ける**: ghost ごとに incoming と outgoing の関連（`ghostEntityEdges` / `ghostDomainEdges`）の本数を数え、incoming が多ければ上の帯、outgoing が多いか同数なら下の帯に置く（片方向だけの ghost はその向きの帯になる）。どちらの帯も、1 段目を焦点の枠に接する側に置く（上の帯は下から上へ段を積む）。
3. **幅予算で折り返す**: 帯の枠は左から並べ、`max(幅予算, 焦点の枠の幅)` を超える手前で次の段へ折り返す。帯の折り返しが予算で切られた run は `widthBound: true` を返し、探索がより広い予算を試せるようにする。帯は今と同じく `layoutInner` の中、焦点の枠を作った後に置くので、探索は帯を含む canvas で採点する。
4. **相手の x で並べる**: 枠は、中の ghost の相手（自ドメインのエンティティ）の中心 x の平均の昇順に並べる。枠の中のカードも同じ値で並べる。同じ値なら今の発見順を使う。入力だけで決まるので、同じモデルは同じ SVG になる。
5. **帯の線を routing chain に通す**: 帯の線を、ほかの線と同じ候補列と後段の装飾に通す。`edge.ghost` / `n.ghost` で分岐する箇所は renderer に 19 ファイルあり、ports・channel・lanes・crossing marks の 4 つだけではない。種類ごとに次のように扱う。
   - **線の印**: 帯の線を他の ghost の線（ghost user / ghost system）と区別する印を `LayoutEdge` に持たせる。ghost user / ghost system の線は、すべての箇所で今と同じく飛ばす。
   - **経路の候補と後段の装飾（帯の線を通す）**: ports（`edge-routing-ports.ts`）、channel-L（`edge-routing-channels.ts`）、gutter・mixed・corridor・gutter lane・port の fan-out（`edge-routing-groups.ts`）、lanes（`edge-routing-lanes.ts`）、outline seating（`port-frame.ts`）、平行線の束（`edge-routing-bundles.ts`）、ラベルの配置（`label-placement.ts`）、相互の対（`mutual-pair.ts`）、crossing marks（`crossing-marks.ts`）。
   - **trunk の集約（帯の線を入れない）**: `edge-routing-groups.ts` の 2 つの trunk の段は grouped のときだけ動く。帯の線を 1 本の幹にまとめるかどうかは #3804 の密度の問いなので、ここでは今と同じく飛ばす。
   - **行として数えるカード**: `buildRowGrid`・`freeColumnLanes`・行間の走査（`edge-routing-groups.ts`）と `layout-reservations.ts` は ghost カードを行から外している。帯のカードを「帯の行」として数え、焦点の枠と帯の間にチャネルが成り立つようにする。ghost user / ghost system のカードは今と同じく外す。
   - **チャネルの境界（`ChannelLimits` / `insideLimits`）**: 今は焦点の枠から取った 1 つの値を全チャネルに当てるので、枠の外の帯のカードと横走りは範囲外として落ちる。境界は焦点の枠の内側のチャネルにだけ当て、焦点の枠と帯の間のチャネルは、焦点の枠の線と帯のカード・帯の枠で閉じる。横走りは `LANE_PITCH` で並べ、足りなければ 2 回目の配置で `GHOST_ROW_GAP` を広げる（ADR-2598 の予約）。
   - **側面の予約（`gutterReservations`、ADR-3154）**: 帯が焦点の枠より広いと、帯の線の縦走りが焦点の枠の脇を通る。この縦走りで焦点の枠を広げないよう、側面の予約は焦点の枠の中で始まり中で終わる線だけを数える。
   - **障害物としての帯の枠**: 帯の枠は `runRoutingChain` の `opts` の新しい必須の項目（例: `bandFrames: Rect[]`）で渡す。`groupFrames` には入れない（`groupFrames` は gutter・lane・trunk の判断にも使われるので、帯の枠が group として数えられてしまう）。必須にするので、ほかの呼び出し元（複数 system の root、deploy ビュー）も空の配列を明示する（TPL-219）。端点を中に持たない線は帯の枠を横切らない（group 枠と同じ、端点ごとの免除）。
   - **焦点の枠のタイトル**: 上の帯から入る線は、焦点の枠のタイトル帯を縦に通るが、タイトルの文字の箱（ラベルの幅 × `CONTAINER_LABEL_HEIGHT`）は横切らない。柵はこの箱との交差で測る。

ADR に昇格するときは、ADR-460 と ADR-1911 の「下に 1 行で置く」部分を本 ADR で置き換える（`refines`）。ADR-460 が却下した案 A（ghost domain を service の枠で包む）を 2 件以上の場合に限って採ることも、却下理由のどちらが当たらなくなったかと一緒に ADR に書く。スライス B で帯の線を相互の対の統合（ADR-3027 決定 1 は ghost の線を除いている）に通すことも、同じ ADR で ADR-3027 を `refines` する。

### スライス

| スライス | 前提 | 独立に出荷できる理由 |
| --- | --- | --- |
| **A** 帯の配置（決定 1〜4） | — | canvas が縦横比の範囲に入り、ghost が相手の近くに並ぶ。線は今と同じ直線のままで、今も焦点の枠とカードを斜めに横切っている。ただし帯が 2 段以上に折り返すと、2 段目への直線は 1 段目の帯の枠を横切る。これは今の 1 行には無い横切り方なので、B を間を空けずに続ける。 |
| **B** 帯の線の配線（決定 5） | A | A の後なら帯の位置が固まっているので、配線の柵（貫通 0・crossing marks）を固定できる。A の前に配線だけ入れると、36,000 px の行に向かう線を配線することになり、測る値に意味が無い。 |

sub-issue と親 Issue の `## Slice status` 表は、本 Design Doc のマージ後に起こす。

### 実装の指針

**スライス A**

1. `ghost-layout.ts`: `placeGhostRow` を、帯を作る関数に置き換える。入力は `{ node, key, groupLabel, side, partnerIds }` の列、幅予算、焦点の枠。出力は ghost の LayoutNode、帯の枠（`ContainerRect`、`ghostBand: true`）、帯が予算で切られたかどうか。
2. `view-slice.ts` / `entity-relations.ts`: 帯の側を決めるために、ghost ごとに incoming / outgoing の関連の本数を数えられるようにする（`ghostEntityEdges` の向きから layout 側で数えられるなら slice は変えない）。ghost domain も同じ。
3. `layout.ts`: `layoutInner` から帯に幅予算を渡し、`widthBound` を `placed.widthBound || band.widthBound` にする。上の帯を置いたら、外側の枠が上にも広がるようにする（今は下と右だけ広げる）。
4. 柵（TPL-2598、修正前のツリーで落ちることを確かめてから固定する）:
   - 合成フィクスチャ: 自ドメイン 4〜6 エンティティ、外部ドメイン 8 つ以上、ghost 40 件以上、上下の両方に ghost があり、両方向の関連を持つ ghost（incoming が多い・outgoing が多い・同数）を含むモデル。エンティティビューの canvas が縦横比の範囲に入ること。
   - 同じ形の service ビューのフィクスチャ（service をまたぐ domain エッジを多数）で、ghost domain も同じく範囲に入ること。
   - 帯の枠がほかの枠・カードと重ならないこと。枠の順が相手の x の順と一致すること。
   - 「外部ドメイン × 帯の側」の組で ghost が 1 件だけのものは枠を作らず、subLabel 付きのカードになること（上下に 1 件ずつのドメインは、カード 2 枚になる）。同じドメインが上下に枠を持つとき、2 つの枠の `id` が異なること。
   - 両方向の関連を持つ ghost が、incoming が多ければ上の帯に、outgoing が多ければ下の帯に、同数なら下の帯に置かれること（フィクスチャは 3 つの場合をそれぞれ 1 件以上含む）。
   - ghost を持たないビューの SVG が変わらないこと（既存の snapshot と routing-parity の corpus）。
5. 実測: 3 モデルの範囲外のビュー数（main では 51 件）と、Dify `IdentityAccess` / `AppManagement` の canvas の before / after を PR に書く。目標は範囲外 0 件で、残ったものは理由を書く。

**スライス B**

1. 最初に `grep -n '\.ghost\b' packages/core/src/renderer/*.ts` の全箇所を表にし、決定 5 のどの種類に当たるかを PR に書く。決定 5 の一覧に無い箇所が見つかったら、どちらに倒すかを PR で決める（TPL-2823）。
2. `layout-types.ts` / `layout-edges.ts`: 帯の線に印を付ける。`pushGhostEdges` は初期の端点だけを決め、経路は chain に任せる。
3. 線の分岐: 決定 5 で「通す」とした箇所の skip 条件を「帯の線ではない ghost」へ狭める。trunk の段は変えない。
4. カードの分岐と境界: 帯のカードを帯の行として数え、`ChannelLimits` を焦点の枠の内側のチャネルに限る。`gutterReservations` は焦点の枠の中で閉じる線だけを数える。
5. `runRoutingChain` に帯の枠の必須の項目を足し、3 つの呼び出し元すべてで渡す。
6. 予約（`layout-reservations.ts`）: 焦点の枠と帯の間のチャネルを、予約の対象に入れる。
7. 柵（routing-parity、TPL-1927 / TPL-1954 / TPL-3026）: スライス A のフィクスチャで次を確かめ、修正前のツリーで落ちることを確かめる。
   - 帯の線の貫通 0（カードと、端点を中に持たない帯の枠）、共線 0
   - 帯の線どうし・帯の線とほかの線の交差に hop が付く
   - 上の帯の線が焦点の枠のタイトルの文字の箱を横切らない
   - 帯が焦点の枠より広いフィクスチャで、焦点の枠の幅が帯の線のせいで広がらない
   - 焦点の枠と帯の間の横走りが `LANE_PITCH` で並び、帯のカードに重ならない

**両スライス共通**

- AT: `docs/acceptance/` に新規ファイル。TC は、合成フィクスチャの `index.krs` をアプリで開き、エンティティビューに切り替えて確かめる項目にする（デプロイ前に preview かローカルで判定できるものだけ）。
  - 外部ドメインごとの枠に ghost が入り、枠のタイトルにドメイン名が出る
  - 片方向の関連だけを持つ ghost は、参照してくるものが上、参照されるものが下にある
  - 両方向の関連を持つ ghost は、関連の本数の多い向きの帯にある（同数なら下）
  - fit した図が画面の形に収まり、ghost の線がカードを横切らない（スライス B）
- spec（スライス A）: 次の 3 か所を書き換える。`syntax.md` を変えるので `pnpm run lint:skill-reference-bundle-sync --write` も実行する。
  - `docs/spec/syntax.md` の entity view の段落（「sub-labelled with its owning domain」）: 外部ドメインの枠に入ること、1 件だけなら subLabel のまま、参照の向きで上下に分かれること（両方向なら関連の本数の多い向き、同数なら下）。
  - `docs/spec/permalink.md` の `<view>` の項（同じ文言）: 同じ内容に揃える。
  - `docs/spec/permalink.ja.md` の `<view>` の項: 「他ドメイン先の ghost は後続で入る」は ADR-1911 の時点ですでに古いので、英語版と同じ内容に書き換える。
  - `docs/spec/syntax.ja.md` には subLabel の記述が無いので変えない。
- ADR 昇格: スライス B の後、`docs/adr/2823-ghost-band-layout.md` として昇格し、本 Design Doc は同じ PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: ghost を持つエンティティビューと service ビューの見た目が変わる（枠に入り、上下に分かれ、折り返す）。モデルの構文と意味は変わらない。ghost を持たないビューは変わらない。
- ドキュメント更新: 上記の spec 3 ファイル。`docs/guide/02-onboarding.md` の entity view の説明は「muted ghost」とだけ書いているので変えない。
- テスト・examples への影響: ghost entity / ghost domain を描くテスト（`drill-down-svg.test.ts` など）の座標の期待値が変わる。examples の生成物に ghost を持つビューがあれば、その snapshot も変わる。

## 未解決の問い / 決めないこと

- **帯をどの祖先の枠に入れるか**: 今は帯を一番外側の枠（system）だけが囲み、間の枠（service）は囲まない。同じ service の中の外部ドメインは service の枠の中に置くほうが正確だが、別 service のドメインと混ざると枠を分ける必要がある。スライス A では今の扱い（一番外側の枠だけを広げる）を保ち、変えるなら別 Issue にする（PR #3842 で kompiro が了承）。
- **枠の中のカードの列数**: `gridColumnCount` の自動の列数を使う。12 枚の枠が縦長になりすぎるなど、実測で問題が出たら調整する。
- **ハブに集まる線の密度**: #3804。
