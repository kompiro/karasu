# 双方向の edge の組を 1 本の線で描く

- **日付**: 2026-10-30
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3027](https://github.com/kompiro/karasu/issues/3027)
  - 同じ問いの database 版: [#2728](https://github.com/kompiro/karasu/issues/2728)
  - 関連 ADR: [ADR-3022](../adr/3022-edge-label-disclosure.md)（ラベルの段階的開示、node focus と focus canvas）, [ADR-1185](../adr/1185-parallel-edge-bundling.md)（同じ `(from, to)` の並列 edge の束ね、論理統合の却下）, [ADR-445](../adr/445-domain-to-domain-edges-implicit-tag.md)（`N domain edges` の集約）, [ADR-1096](../adr/1096-edge-id-selector.md)（edge の canonical id）, [ADR-9019](../adr/9019-edge-direction-style.md)（edge ごとの `direction`）, [ADR-650](../adr/650-graphical-diff-viewer.md)（edge ごとの diff state）, [ADR-2958](../adr/2958-gutter-lane-bundling.md)（種別の違う edge を束ねない）, [ADR-2632](../adr/2632-edge-hover-affordance.md)（全 edge の hit-line）, [ADR-2394](../adr/2394-external-side-straddle-rule.md)（集合から取った閾値の却下）, [ADR-2585](../adr/2585-store-scoped-er-view.md) / [ADR-1870](../adr/1870-domain-entity-modeling.md)（entity の関連は 1 本で書く）
  - 関連 TPL: [TPL-3027](../test-perspectives/TPL-3027-visual-merge-only-when-indistinguishable.md)（本件で起こす proactive TPL）, [TPL-3022](../test-perspectives/TPL-3022-withheld-content-stays-reachable.md), [TPL-1227](../test-perspectives/TPL-1227-writer-reader-asymmetry.md), [TPL-2174](../test-perspectives/TPL-2174-opt-in-visual-layer-is-inert-when-off.md), [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md), [TPL-1886](../test-perspectives/TPL-1886-rekey-transform-preserves-per-element-decoration.md), [TPL-2958](../test-perspectives/TPL-2958-bundle-shared-geometry-survives-later-passes.md), [TPL-3090](../test-perspectives/TPL-3090-edge-decoration-follows-edge-emphasis.md), [TPL-2632](../test-perspectives/TPL-2632-viewer-affordance-not-gated-on-author-identity.md), [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)
  - コード: `packages/core/src/renderer/edge-routing-bundles.ts`（`markParallelBundles`）, `packages/core/src/renderer/layout.ts`, `packages/core/src/renderer/crossing-marks.ts`, `packages/core/src/renderer/edge-routing.ts`（`renderEdge`）
  - fixture: `packages/core/src/renderer/fixtures/dense-domain-canvas.krs`

## 背景・課題

ADR-3022 で、密な domain canvas のラベルは「置けるものだけ描き、残りは段階的に開示する」ようになった。
線は対象外として残した。Umami の `UmamiApp` drill-down（fixture `dense-domain-canvas.krs`）は、
ラベルを全部外しても、10 domain の間に 41 本の線が走っていて追えない。

計測した事実（計測は fixture を `layout()` に通し、各 edge の折れ線どうしの交差点を数えた）:

| 項目                         | 値                                                                         |
| ---------------------------- | -------------------------------------------------------------------------- |
| 書かれた domain 間 edge      | 41 本                                                                      |
| 端点の組（向きを区別しない） | 27 組                                                                      |
| 両方向に edge がある組       | 14 組（28 本）                                                             |
| 線どうしの交差               | 157 か所                                                                   |
| 入次数の上位                 | `TrackedEntities` 9、`Identity` 8（ほかの 9 domain のうち 8 つ以上が依存） |

14 組の両方向の edge は、今日は 2 本の別々の線として描かれる。ADR-1185 が束ねるのは同じ
`(from, to)` だけで、逆向きは束ねない。2 本は別々の port から出て別々の経路を通るので、
同じ 2 枚の card の間に線が 2 本ずつ走る。

node focus（ADR-3022 の段 1）は hover した card の edge だけを残すので、hover すれば読める。
本件は hover する前の canvas が何を描くかを決める。

## 現状（インベントリ）

| 観点             | 現状                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 両方向の組の描画 | 2 本の独立した `LayoutEdge`。それぞれが自分の port と経路を持つ。`cyclic` は立たない（fixture で 0 本）                              |
| 並列 edge の束ね | `markParallelBundles`（`layoutInner` の中、multi-system では system ごと）。鍵は `(from, to)` のみ。逆向きは別の鍵                   |
| 交差マーク       | `computeCrossingMarks` が `layout()` の最後、幅の探索と再配置の後に 1 回走る。hop は 1 点に 1 つで、持ち主の edge の線に隙間を空ける |
| edge の identity | `data-edge-canonical-id`（`<from><arrow><to>`）、`edge#id` / `edge[from=X]` / `edge[to=X]` selector、edge ごとの `direction`         |
| diff             | edge 要素ごとに `data-diff-state`                                                                                                    |
| hover と hit     | 全 edge が透明な hit-line を持つ（ADR-2632）                                                                                         |
| edge のクリック  | ラベルだけの edge は focus canvas を開く。開くのは両端の card と、その間の edge 全部（逆向きも）（ADR-3022 の決定 6・7）             |
| `marker-start`   | どの edge も使っていない                                                                                                             |

## 制約・前提

- **authored な edge はすべて辿れる**（TPL-3022）。線を減らしても、各 edge のラベル全文に各 surface から届く。
- **writer に hub や組を書かせない**（TPL-1227）。公開済みのモデルにも効く。
- **edge の identity を保つ。** ADR-1185 は「並列を単一の論理 edge に集約する案」を、id selector・`direction`・diff の表示が edge 単位で動くことを理由に却下している。本件も同じ制約を受ける。
- **意味の違う edge を 1 本にしない。** sync と async は構造の意味である（`docs/concepts.ja.md`）。ADR-2958 は種別の違う edge を同じ束に入れない。
- **閾値で canvas を不連続に変えない。** ADR-3022 は「密な canvas ではラベルを全部隠す」案を、edge を 1 本足しただけで図が変わることを理由に却下した。ADR-2394 は集合から取った閾値を却下している。
- **両方向の組が無い canvas の出力は変えない**（TPL-2174）。
- **out of scope**: `database` canvas の投影された関連の集約（#2728）、card の下を通る配線（#3026）。

## 検討した選択肢

### 案1: 両方向の組を、card の位置を変えずに 1 本の線で描く

配置と経路選択は今日のまま行う。経路が決まった後で、両方向の組の片方の経路を共有の線にし、
もう片方の経路は捨てる。共有の線を中点で 2 つに分け、**各 edge は自分の target 側の半分だけを描く**。
`A -> B` は中点から `B` までを描いて `B` に矢印を付け、`B -> A` は中点から `A` までを描いて `A` に
矢印を付ける。2 つの半分が中点で繋がり、両端に矢印のある 1 本の線に見える。

**メリット**

- Umami: 41 本 → 27 本、交差 157 → 61 か所。
- card が動かない。既存の図で変わるのは両方向の組の線だけ。
- edge の `<g>` は 2 つのまま残る。canonical id・style・`direction`・diff state・hit-line は edge ごとに残る。ADR-1185 が却下した論理統合ではない。
- 線は重ならない。edge ごとの装飾（hover の強調、diff の色や透明度、facet の casing、hop の隙間）は、その edge の半分にだけ掛かるので、どちらの向きの装飾かが見て分かる（分け目は交差と角から離して置く。「実装の指針」の 3）。
- 両方向の依存（循環）が、両端に矢印のある線としてかえって目に付く。

**デメリット**

- 片方の経路のために `distributePorts` が取った port と、予約した lane が空く。
- edge の折れ線が source の card から始まらなくなる（中点から始まる）。折れ線の始点を source の port として読む処理を洗い出す必要がある（「実装の指針」）。

#### 却下した変形: 2 本を同じ線に重ねる

後の edge に先の edge の折れ線を逆順にして持たせ、2 本を全長で重ねる形。最初に検討したが、
重ねた結果の見た目が 2 本の属性の合成になり、TPL-3027 が禁じる「区別の消失」が style 以外の経路で起きる。

- 破線の位相は path の始点から数えるので、逆向きに描いた 2 本の破線は位相がずれ、隙間を埋め合って実線に見えうる（async の組が sync に見える）
- 半透明の線（diff の `unchanged`、facet の減光、hover の peer dim）が重なって濃くなる
- facet の casing が全長に掛かり、どちらの向きが facet に入るのか分からない
- hop は 1 本の持ち主の線にしか隙間を空けないので、相手の線が hop を貫いて接続に見える
- 上に描いた線が pointer を取り、下の edge に hover できない

半分ずつ描けば、これらはどれも起きない。

### 案2: 両方向の組を 1 つの辺として配置する

配置（layout）の段階で組を 1 辺として扱い、card の位置もそれに合わせて決める。

**メリット**

- Umami: 41 本 → 27 本、交差 157 → 70 か所。

**デメリット**

- card が動く。1 本にする組を含む `examples/` の 4 ファイルで配置が変わる。
- 交差は案1 より多い（70 か所対 61 か所）。この fixture では、今の配置のまま 1 本にした方が良かった。

### 案3: hub の edge を薄くする（または card に件数を出す）

多くの node が依存する node（hub）への edge を、既定で薄く描くか、描かずに card に件数を出す。
node focus で戻す。

**メリット**

- 「ほかの 3/4 以上が依存する node」を hub とすると、Umami では `TrackedEntities` と `Identity` が該当する。
  案3 だけなら、濃く描かれる線は 24 本、その間の交差は 56 か所になる。案1 と併せると 16 本、24 か所。

**デメリット**

- hub の判定に閾値が要る。edge を 1 本足しただけで node が hub になり、7 本以上の線が一度に薄くなる。
  ADR-3022 と ADR-2394 が却下した形である。
- 閾値が canvas の大きさに依存する。同じ「3/4」の規則は、Dify の `DifyDB` canvas では hub を 1 つも見つけない。
  edge に触れる 126 table で数えると、必要な入次数は 94 で、最大は `Tenants` の 60 である。
- `TrackedEntities` への edge は「何が中心の entity に依存しているか」という、この canvas の主な情報である。
  薄くすると、それを読む人に hover を求める。
- 件数を card に出す形は、node focus の `⇄ Relations N` と重なる。

### 案4: canvas は変えず、node focus に任せる

ADR-3022 の node focus と focus canvas だけで読む。

**メリット**

- 変更が無い。

**デメリット**

- hover する前の canvas は 41 本・157 か所の交差のまま。hover の無い端末では、最初に見えるものがこれになる。

## 比較

| 観点                         | 案1 1 本で描く | 案2 1 辺で配置 | 案3 hub を薄く          | 案4 何もしない |
| ---------------------------- | -------------- | -------------- | ----------------------- | -------------- |
| Umami の線                   | 27 本          | 27 本          | 41 本（濃いのは 24 本） | 41 本          |
| Umami の交差                 | 61             | 70             | 157（濃い線の間は 56）  | 157            |
| card の移動                  | なし           | あり           | なし                    | なし           |
| edge の identity             | 保つ           | 保つ           | 保つ                    | 保つ           |
| 閾値                         | なし           | なし           | 要る                    | なし           |
| `examples/` で変わるファイル | 4 / 85         | 4 / 85         | 閾値しだい              | 0              |

`examples/` の 85 ファイルのうち、両方向の組を描くのは 6 ファイル・8 組。そのうち 2 組は sync と
async の組なので、案1 でも 2 本のまま残る（`getting-started/index.krs` の en / ja。どちらもこの 1 組だけ）。
1 本で描くのは 4 ファイルの 6 組である（下の「実装の指針」の除外条件を足す前の数。実装 PR で測り直す）。

## 現時点の方針

**案1 を採用する。** 両方向の組は、card の位置を変えずに 1 本の線で描く。hub の扱い（案3）は
domain canvas では採らず、#2728 に渡す。

理由:

- 線と交差がいちばん減り（27 本、61 か所）、card が動かない。
- edge は 1 本ずつ残る。まとめるのは描画だけで、論理統合ではない。線は重ならないので、edge ごとの装飾も残る。
- 閾値を持たない。1 本にするかどうかは、その 2 本が区別できるかどうかだけで決まる（TPL-3027）。
- hub の判定は canvas の大きさで閾値が変わり、Umami で効く規則が Dify で効かない。hub が主因なのは
  Dify の方（上位 3 table に 296 本中 155 本）なので、#2728 で database canvas の問題として決める。

### #2728 との関係

- 案1 は renderer の規則なので `database` canvas にも効く。ただし Dify の `DifyDB` canvas では、
  296 本のうち両方向の組は 4 組だけで、292 本にしか減らない。entity の関連は 1 本で書き（ADR-1870）、
  逆向きの衝突は記録側だけを描く（ADR-2585）ので、database canvas では両方向の組が少ない。
- #2728 の主因は hub である（`Tenants` 60、`Accounts` 51、`Apps` 44）。本 doc は hub の扱いを決めない。
  #2728 には次を渡す: 「ほかの 3/4 以上」の規則は Dify で hub を見つけないこと、固定の閾値は
  ADR-3022 と ADR-2394 が却下した形であること、#2728 の issue が挙げる boundary 単位の集約は閾値を
  持たないこと。

### 実装の指針

1. **1 本で描く条件。** 次をすべて満たす組だけを 1 本で描く。1 つでも外れたら今日どおり 2 本で描く（TPL-3027）。
   - `A -> B` と `B -> A` が同じ canvas の同じ system にあり、両端がその canvas の card である（multi-system の root では `fromKey` / `toKey` で照合し、system 間 edge は対象にしない。TPL-1352）
   - 種別（sync / async）が同じ
   - 解決済みの線の style（色・太さ・`stroke-style`）が同じ
   - diff 表示では、diff state が同じ
   - どちらも ghost でも cyclic でも `groupBackward` でもない（どれも layout が描き方を変える印で、style の鍵には現れない）
   - どちらも trunk の束（`trunkId` / `outTrunkId`。ADR-2958 の gutter lane の束もこの 2 つを立てる）に入っていない
   - どちらの向きにも同じ `(from, to)` の並列 edge が無い（ADR-1185 の束と混ぜない）
   - どちらも category collapse の stub ではない（端点を付け替え、diff state と facet を畳んだ edge なので、本件では扱わない）

   集約した `N domain edges` の service 間 edge は対象に入る。条件は畳んだ後の diff state と解決済みの style で
   判定し、内訳パネルを開くクリックの的は、自分の半分のラベルの位置に置く（ADR-463）。

2. **style の判定をどこでするか。** edge の style は `layout()` ではなく svg-renderer で解決されるので、
   `layout()` は style を知らない。`LayoutOptions` に「この edge の線の見た目を表す鍵」を返す callback を
   足し（`chipZoneFor` と同じ注入の形）、renderer の呼び出しが解決済みの style から鍵を作って渡す。
   callback を渡さない呼び出し（draw.io exporter など）では 1 本にしない。今日の出力のまま残る。
   facet の overlay は鍵に入れない。overlay は配置に影響しない約束なので（TPL-2174）、overlay の選択で
   線の本数を変えない。半分ずつ描くので、facet の casing と減光はその edge の半分にだけ掛かる。
3. **共有の線と分け目。** 入力順（AST の出現順）で先の edge の経路を共有の線にし、後の edge の経路は捨てる。
   共有の線を分け目で 2 つに分け、各 edge の折れ線を「分け目から自分の target まで」に置き換える。
   分け目は長さの中点から始め、次の両方を満たす最も近い点へ線に沿ってずらす。
   - 他の edge との交差から、hop の幅（`HOP_RADIUS` を含む隙間の半分）より離れている。交差が分け目の上や近くに
     あると、hop の隙間が片方の半分にしか空かず、相手の半分が hop を貫いて接続に見える
   - 折れ線の角（waypoint）から離れている。角で分けると、butt cap の 2 本の端が角の外側に欠けを作る

   共有の線の中央の 3 分の 2（長さの 1/6 から 5/6）にそういう点が無ければ、その組は 2 本で描く。決定的で、
   snapshot が安定する。幅は試作で決めた。Umami の fixture で、実際の layout と renderer に分け目を入れて
   交差マークを計算し直すと、中央の 3 分の 2 では 14 組すべてが 1 本になり 27 本・交差 61 か所、中央の
   4 分の 1 ずつ（1/4 から 3/4）では 13 組で 28 本・66 か所、中央の 3 分の 1 では 11 組で 30 本・76 か所だった
   （hop から 14 px、角から 10 px 離す条件）。

4. **パスの位置。** 配置と幅の探索と再配置が終わった後、`computeCrossingMarks`（`layout.ts` の `layout()` の中）の
   直前に置く。`markParallelBundles` は `layoutInner` の中で走り、その結果は channel / column の予約と幅の
   探索に入るので、そこに置くと card が動きうる。探索の後に置けば card は動かない。multi-system の root では
   system ごとに組を探す（`markParallelBundles` が #2917 で system ごとになったのと同じ理由）。
   分け目を決めるには他の edge の経路が要るので、組の判定は全 edge の経路が出揃ってから行う。
5. **置き換えた折れ線を読む処理。** 置き換えた後の `fromPoint` は source の port ではなく分け目になる。
   パスより後でこの折れ線を読むのは、`computeCrossingMarks`、ラベルの配置（`buildLabelInputs` /
   `resolveLabelPlacements` の線と anchor）、`renderEdge`（hit-line、`gappedStrokePath`、ラベル、矢印）である。
   port の分散はパスより前に終わり、drill-down と all-layers は SVG の transform で階層を重ねるだけで、
   focus canvas は SVG の `data-edge-*` と線の属性しか読まない。実装 PR でこの 4 つを確かめる。
6. **描画。** 各 edge の `<g>` は今日どおり出る。それぞれが自分の半分と、自分の target 側の矢印を描く。
   `marker-start` は使わない。組を表す属性は足さない（今は読む側が無い。テストは `LayoutEdge` で組を確かめる）。
7. **ラベル。** 組の edge は、既定のラベル位置の決め方を変える。今の既定（ADR-1184 の、最も長い区間の中点）を
   半分にそのまま使うと、分け目に接する区間が最長になったとき、ラベルが分け目の脇に乗り、どちらの向きの
   ラベルか分からなくなる。組の edge では、自分の半分の区間のうち分け目に接しない最も長い区間の中点を既定に
   する。半分が 1 区間だけなら、その区間の長さの中点（全長で見ると自分の target から 4 分の 1）にする。
   author の `label-position` / `label-offset` は自分の半分の上で解釈する（`label-position` の `t` は半分の
   長さで測る）。指定を書いた組も 1 本で描くので、`edge { label-offset: ... }` のような全体の規則で canvas
   全体の組が 2 本に戻ることはない。その後は ADR-3022 の配置と保留に通す。author が位置を書いたラベルは、
   ADR-3022 の決定 4 のとおり保留せず、author の指定が勝つ（ADR-1184）。相手の半分は今日どおり
   障害物に入れる（#2360）。外すと、長いラベルが相手の半分に乗って逆向きのラベルに読める。
8. **hover と hit。** 各 edge の hit-line は自分の半分だけを覆う。hover の強調は今日どおり `.krs-edge` に
   掛かり（TPL-2632）、強調されるのはその edge の半分と矢印である。保留したラベルの `<title>` には、
   その半分への hover で届く（TPL-3022）。クリックは今日どおり focus canvas を開き、そこには両方向が
   1 本 1 行で出る。
9. **交差マーク。** `computeCrossingMarks` は置き換えた後の折れ線に対して走るので、hop はそれが乗る
   半分の edge が持ち主になり、その半分に隙間が空く。分け目は 3 で交差から離してあるので、1 つの hop の
   隙間が 2 つの半分にまたがることはない。分け目での 2 つの半分の接点は端点どうしの接触なので、交差と
   して数えない。
10. **surface。** パスは `layout()` にあるので、system・drill-down・all-layers・all-views・静的出力・
    VS Code preview に同じく効く（TPL-219）。deploy view は `layoutDeploy` で配置し `layout()` を通らないので、
    このパスは掛からない。
11. **テスト。**
    - fixture で 41 本 → 27 本の線、交差 157 → 61 か所以下を数値で固定する
    - 1 本にしない条件を 1 つずつ外した組（sync / async、色違い、太さ違い、diff state 違い、cyclic、`groupBackward`、並列あり、system 間、collapse の stub）で 2 本のまま残ることを確かめる
    - multi-system の root で、別の system にある `A -> B` と `B -> A` を組にしないこと
    - style の callback を渡さない `layout()` の出力が今日と同じであること
    - 両方向の組が無い `examples/` の SVG が byte-stable であること
    - 分け目が、他の edge との交差から hop の幅より離れ、角の上に無いこと。そういう点が無い組は 2 本で描くこと
    - 組の 2 つのラベルが分け目の脇に乗らず、重ならないこと（fixture で数える）
    - `label-offset` を全体に書いた canvas でも組が 1 本で描かれること
    - 組の各 hit-line に pointer が届くこと。保留したラベルは、その `<title>` に届くこと（静的 SVG）
    - 2 つの半分が分け目で同じ座標を共有していること
12. **AT。** 実装 PR で `docs/acceptance/3027-mutual-edge-pair-merge.md` を作る。TC:
    - Umami fixture の drill-down で、両方向の組が両端に矢印のある 1 本の線で描かれる
    - 線の半分に hover すると、その半分の矢印が指す向きの edge が強調される。ラベルが保留されていれば、tooltip にその向きのラベルが出る
    - 線のクリックで focus canvas が開き、両方向が 1 行ずつ出る
    - sync と async の組（`examples/en/getting-started/index.krs`）は 2 本のまま
    - diff 表示で片方だけが変わった組は 2 本のまま、それぞれの diff state で描かれる
    - Group-by で別の band にある組は 2 本のまま（片方が流れに逆らって破線になるため）
13. ADR 昇格: 実装完了後、`docs/adr/3027-mutual-edge-pair-merge.md` として昇格し、本 Design Doc は同 PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 同じ種別・同じ style の両方向の組を持つ図では、組の 2 本が 1 本の線になる。`.krs` の解釈は変わらない。
- ドキュメント更新: `docs/concepts.ja.md`（と英語版）の「集約」節に、両方向の組は両端に矢印のある 1 本の線で描かれることを 1 文足す。
- テスト・examples への影響: `examples/` の最大 4 ファイル（6 組）の図が変わる（除外条件で減りうる）。snapshot の更新が要る。
- Group-by の canvas: 別の band にある組は、片方が `groupBackward` になるので 2 本のまま残る。1 本になるのは同じ band の中の組だけで、trunk に入った組はそこからも外れる。仕様であって不具合ではない。

## 未解決の問い / 決めないこと

- **1 本にしない style property。** 今は作らない。2 本で描きたい writer は、片方の色を変えれば 2 本に戻る。要望が出たら足す。
- **空いた port と lane を詰めるか。** 1 本にした後に `distributePorts` や lane の予約をやり直すと、card の辺の上の port と channel が詰まる。経路が変わるので交差が増えうる。実装時に測り、効果が無ければやらない。
- **hub の扱い。** #2728 で決める。domain canvas に戻すかどうかは、#2728 の決定が閾値を持たない形になったときに考える。
