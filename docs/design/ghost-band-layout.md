# ghost entity / ghost domain を、外部ドメインごとの枠に入れて幅予算の中で並べ、routing chain に通す

- **日付**: 2026-11-14
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2823](https://github.com/kompiro/karasu/issues/2823)
  - 切り出した Issue: [#3804](https://github.com/kompiro/karasu/issues/3804)（ハブのエンティティに集まる接続線の密度。[#2728](https://github.com/kompiro/karasu/issues/2728) と同じ問い）
  - 関連 ADR: [ADR-460](../adr/460-ghost-domain-edges.md)（ghost domain を下に置く）、[ADR-1911](../adr/1911-cross-domain-ghost-entities.md)（ghost entity に同じ行を使う）、[ADR-2593](../adr/2593-canvas-space-objective.md)（幅予算の探索）、[ADR-2598](../adr/2598-edge-routing-channel-capacity.md)（チャネルのレーンと予約）、[ADR-3132](../adr/3132-frame-bounded-channels.md)（チャネルを枠の内側で測る）、[ADR-328](../adr/328-ghost-system-rendering.md)（ghost system の枠）
  - 関連 TPL: [TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)、[TPL-2593](../test-perspectives/TPL-2593-layout-feedback-is-floor-first-and-monotone.md)、[TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)、[TPL-3026](../test-perspectives/TPL-3026-candidate-chain-covers-every-endpoint-relation.md)、[TPL-3132](../test-perspectives/TPL-3132-resource-inside-a-frame-measured-against-the-frame.md)、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)、[TPL-1223](../test-perspectives/TPL-1223-scoped-glance-drill-down.md)、本 PR で起こす [TPL-2823](../test-perspectives/TPL-2823-late-placed-elements-reach-shared-layout.md)
  - コード: `packages/core/src/renderer/ghost-layout.ts`（`placeGhostRow` / `placeGhostEntities` / `placeGhostDomains`）、`packages/core/src/renderer/layout.ts`（`layoutInner`）、`packages/core/src/renderer/layout-edges.ts`（`pushGhostEdges` / `runRoutingChain`）、`packages/core/src/view/entity-relations.ts`（`extractEntityView`）

## 背景・課題

エンティティビューは、他ドメインのエンティティとの関連を muted な ghost として描く（ADR-1911）。ghost は焦点の枠の下に 1 行で並ぶ。この行は ADR-460 が ghost domain のために作り、ADR-1911 がエンティティに流用したもので、どちらの ADR も ghost が数件の場合しか見ていなかった。

この行は、その後に入った配置と配線の仕組みを 1 つも通らない。

1. **配置**: `placeGhostRow` は x を 1 つずつ進めて全 ghost を 1 行に置き、外側の枠をその幅まで広げる。幅予算（ADR-2593）で折り返さない。探索は最終的な canvas で採点するが、どの予算でも行の幅は同じなので、横長の canvas がそのまま選ばれる。
2. **順序**: ghost は `extractEntityView` が見つけた順（自ドメインからの関連を宣言順、その後で他ドメインからの関連をドメインの順）に並ぶ。相手の自エンティティの x とは関係が無い。
3. **配線**: `pushGhostEdges` は相手のカードの下端中央と ghost の上端中央を直線で結ぶ。ports・channel・lanes・crossing marks の各段は `edge.ghost` を見て飛ばす（`edge-routing-ports.ts` / `edge-routing-channels.ts` / `edge-routing-lanes.ts` / `crossing-marks.ts`）。ghost が相手の真下に無いと、線は焦点の枠とカードを斜めに横切る。

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

- メリット: ドメインの境界が図に出る（ghost の目的、concepts の「Ghost」節）。Dify `IdentityAccess` の 101 枚は 18 枠になり、図はドメイン単位で読める。#3804 の集約の単位にもなる。ghost system の枠（ADR-328）と同じ見た目の語彙を使える。
- デメリット: 枠の分だけ面積が増える。枠の中の並べ方を決める必要がある。

#### 案 P3: ghost を焦点の配置に混ぜる

ghost を焦点の層配置の中に入れ、相手の近くに置く。

- 却下: ADR-460 の案 C と同じ理由（境界があいまいになる）。

#### 案 P4: 帯を左右に置く

- 却下: 左右は ghost user と ghost system の場所（ADR-460 の「理由」節）。service ビューでは衝突する。

### 帯の位置

#### 案 S1: 下だけに置く

ADR-460 / ADR-1911 のまま、すべての ghost を焦点の枠の下に置く。

#### 案 S2: 関連の向きで上下に分ける（採用、kompiro が選んだ）

他ドメインから自ドメインを参照する ghost（incoming）は焦点の枠の上に、自ドメインが参照する ghost（outgoing）は下に置く。エンティティの関連は「参照する側 → 参照される側」の向きで、焦点の中の層配置も参照する側を上に置くので、帯の線もすべて上から下へ流れる。

- 自ドメインと両方向の関連を持つ ghost は、下に置く（ADR-460 の既定の側）。
- 外部ドメインが上下の両方に ghost を持つと、そのドメインの枠は上下に 1 つずつできる。

### 配線

#### 案 R1: 直線のまま、端点だけ相手の近くへ

並べ替えで線が短くなるので、配線は今のまま直線にする。

- 却下: 帯が複数段に折り返すと、2 段目以降の ghost は相手の真下（真上）に来ない。直線は 1 段目の枠とカードを横切る。

#### 案 R2: 帯の線を routing chain に通す（採用）

帯の線（ghost entity と ghost domain の線）を、ほかの線と同じ候補列（ports・channel・gutter・lanes・outline seating）と crossing marks に通す。muted の描画だけを残す。

## 現時点の方針

**案 P2 + 案 S2 + 案 R2 を採る。** 帯（焦点の枠の上下に置く ghost の並び）を、ほかの要素と同じ配置と配線の仕組みに通す。決定は 5 つ。

1. **外部ドメインごとの枠**: ghost entity を「外部ドメイン × 帯の側」ごとに 1 つの muted 枠に入れる。枠のタイトルはドメインのラベルで、カードの subLabel は外す。ghost domain は「外部 service × 帯の側」ごとの枠に入れ、タイトルは service のラベルにする。枠の中のカードは `gridColumnCount(n)`（`layer-layout-logics.ts`）の列数で折り返す。
2. **向きで上下に分ける**: incoming だけを持つ ghost は上の帯、それ以外は下の帯に置く。どちらの帯も、1 段目を焦点の枠に接する側に置く（上の帯は下から上へ段を積む）。
3. **幅予算で折り返す**: 帯の枠は左から並べ、`max(幅予算, 焦点の枠の幅)` を超える手前で次の段へ折り返す。帯の折り返しが予算で切られた run は `widthBound: true` を返し、探索がより広い予算を試せるようにする。帯は今と同じく `layoutInner` の中、焦点の枠を作った後に置くので、探索は帯を含む canvas で採点する。
4. **相手の x で並べる**: 枠は、中の ghost の相手（自ドメインのエンティティ）の中心 x の平均の昇順に並べる。枠の中のカードも同じ値で並べる。同じ値なら今の発見順を使う。入力だけで決まるので、同じモデルは同じ SVG になる。
5. **帯の線を routing chain に通す**: 帯の線を ports・channel・gutter・lanes・outline seating と crossing marks に通す。
   - 帯の線を他の ghost の線（ghost user / ghost system）と区別する印を `LayoutEdge` に持たせ、各段の skip 条件を `edge.ghost` からその印へ狭める。ghost user / ghost system の線は今と同じく飛ばす。
   - 帯の枠は、端点を中に持たない線にとって障害物にする（group 枠と同じ、端点ごとの免除）。trunk の集約（grouped のときだけ動く段）は帯の枠を group として数えない。
   - 焦点の枠と帯の間（`GHOST_ROW_GAP`）は、行間チャネルと同じ扱いにする。横走りは `LANE_PITCH` で並べ、足りなければ 2 回目の配置で広げる（ADR-2598 の予約）。ADR-3132 の境界の値（焦点の枠のタイトル帯の下端と枠の下端）は焦点の枠の内側のチャネルを閉じるもので、枠の外のこのチャネルは、枠の線と帯のカードで閉じる。
   - 上の帯から入る線は、焦点の枠のタイトルを横切らない。

ADR に昇格するときは、ADR-460 と ADR-1911 の「下に 1 行で置く」部分を本 ADR で置き換える（`refines`）。

### スライス

| スライス | 前提 | 独立に出荷できる理由 |
| --- | --- | --- |
| **A** 帯の配置（決定 1〜4） | — | canvas が縦横比の範囲に入り、ghost が相手の近くに並ぶ。線は今と同じ直線のままで、今も焦点の枠とカードを斜めに横切っている。ただし帯が 2 段以上に折り返すと、2 段目への直線は 1 段目の帯の枠を横切る。これは今の 1 行には無い横切り方なので、B を間を空けずに続ける。 |
| **B** 帯の線の配線（決定 5） | A | A の後なら帯の位置が固まっているので、配線の柵（貫通 0・crossing marks）を固定できる。A の前に配線だけ入れると、36,000 px の行に向かう線を配線することになり、測る値に意味が無い。 |

sub-issue と親 Issue の `## Slice status` 表は、本 Design Doc のマージ後に起こす。

### 実装の指針

**スライス A**

1. `ghost-layout.ts`: `placeGhostRow` を、帯を作る関数に置き換える。入力は `{ node, key, groupLabel, side, partnerIds }` の列、幅予算、焦点の枠。出力は ghost の LayoutNode、帯の枠（`ContainerRect`、`ghost: true`）、帯が予算で切られたかどうか。
2. `view-slice.ts` / `entity-relations.ts`: 帯の側を決めるために、ghost ごとに incoming / outgoing を区別できるようにする（`ghostEntityEdges` の向きから layout 側で導出できるなら slice は変えない）。ghost domain も同じ。
3. `layout.ts`: `layoutInner` から帯に幅予算を渡し、`widthBound` を `placed.widthBound || band.widthBound` にする。上の帯を置いたら、外側の枠が上にも広がるようにする（今は下と右だけ広げる）。
4. 柵（TPL-2598、修正前のツリーで落ちることを確かめてから固定する）:
   - 合成フィクスチャ: 自ドメイン 4〜6 エンティティ、外部ドメイン 8 つ以上、ghost 40 件以上、上下の両方に ghost があるモデル。エンティティビューの canvas が縦横比の範囲に入ること。
   - 同じ形の service ビューのフィクスチャ（service をまたぐ domain エッジを多数）で、ghost domain も同じく範囲に入ること。
   - 帯の枠がほかの枠・カードと重ならないこと。枠の順が相手の x の順と一致すること。
   - ghost を持たないビューの SVG が変わらないこと（既存の snapshot と routing-parity の corpus）。
5. 実測: 3 モデルの範囲外のビュー数（main では 51 件）と、Dify `IdentityAccess` / `AppManagement` の canvas の before / after を PR に書く。目標は範囲外 0 件で、残ったものは理由を書く。

**スライス B**

1. `layout-types.ts` / `layout-edges.ts`: 帯の線に印を付ける。`pushGhostEdges` は初期の端点だけを決め、経路は chain に任せる。
2. `edge-routing-ports.ts` / `edge-routing-channels.ts` / `edge-routing-lanes.ts` / `crossing-marks.ts`: skip 条件を「帯の線ではない ghost」へ狭める。
3. 予約（`layout-reservations.ts`）: 焦点の枠と帯の間のチャネルを、予約の対象に入れる。
4. 柵（routing-parity、TPL-1927 / TPL-1954 / TPL-3026）: スライス A のフィクスチャで、帯の線の貫通 0、共線 0、帯の線どうし・帯の線とほかの線の交差に hop が付くこと、上の帯の線が焦点の枠のタイトルを横切らないこと。修正前のツリーで落ちることを確かめる。

**両スライス共通**

- AT: `docs/acceptance/` に新規ファイル。TC は、合成フィクスチャの `index.krs` をアプリで開き、エンティティビューに切り替えて確かめる項目にする（デプロイ前に preview かローカルで判定できるものだけ）。
  - 外部ドメインごとの枠に ghost が入り、枠のタイトルにドメイン名が出る
  - 参照してくる ghost が上、参照される ghost が下にある
  - fit した図が画面の形に収まり、ghost の線がカードを横切らない（スライス B）
- spec: `docs/spec/syntax.md` / `syntax.ja.md` と `docs/spec/permalink.md`（あれば `.ja.md`）の「sub-labelled with its owning domain」を、枠のタイトルに直す。`syntax.md` を変えるので `pnpm run lint:skill-reference-bundle-sync --write` も実行する。
- ADR 昇格: スライス B の後、`docs/adr/2823-ghost-band-layout.md` として昇格し、本 Design Doc は同じ PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: ghost を持つエンティティビューと service ビューの見た目が変わる（枠に入り、上下に分かれ、折り返す）。モデルの構文と意味は変わらない。ghost を持たないビューは変わらない。
- ドキュメント更新: 上記の spec 3〜4 ファイル。`docs/guide/02-onboarding.md` の entity view の説明は「muted ghost」とだけ書いているので変えない。
- テスト・examples への影響: ghost entity / ghost domain を描くテスト（`drill-down-svg.test.ts` など）の座標の期待値が変わる。examples の生成物に ghost を持つビューがあれば、その snapshot も変わる。

## 未解決の問い / 決めないこと

- **帯をどの祖先の枠に入れるか**: 今は帯を一番外側の枠（system）だけが囲み、間の枠（service）は囲まない。同じ service の中の外部ドメインは service の枠の中に置くほうが正確だが、別 service のドメインと混ざると枠を分ける必要がある。スライス A では今の扱い（一番外側の枠だけを広げる）を保ち、変えるなら別 Issue にする。
- **枠の中のカードの列数**: `gridColumnCount` の自動の列数を使う。12 枚の枠が縦長になりすぎるなど、実測で問題が出たら調整する。
- **ハブに集まる線の密度**: #3804。
