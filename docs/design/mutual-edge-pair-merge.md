# 双方向の edge の組を 1 本の線に重ねる

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

| 観点             | 現状                                                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 両方向の組の描画 | 2 本の独立した `LayoutEdge`。それぞれが自分の port と経路を持つ。`cyclic` は立たない（fixture で 0 本）                      |
| 並列 edge の束ね | `markParallelBundles`（`layout()` の最後）。鍵は `(from, to)` のみ。逆向きは別の鍵                                           |
| 交差マーク       | `computeCrossingMarks` が `layout()` の結果に対して走る（`markParallelBundles` の後）                                        |
| edge の identity | `data-edge-canonical-id`（`<from><arrow><to>`）、`edge#id` / `edge[from=X]` / `edge[to=X]` selector、edge ごとの `direction` |
| diff             | edge 要素ごとに `data-diff-state`                                                                                            |
| hover と hit     | 全 edge が透明な hit-line を持つ（ADR-2632）                                                                                 |
| edge のクリック  | ラベルだけの edge は focus canvas を開く。開くのは両端の card と、その間の edge 全部（逆向きも）（ADR-3022 の決定 6）        |
| `marker-start`   | どの edge も使っていない                                                                                                     |

## 制約・前提

- **authored な edge はすべて辿れる**（TPL-3022）。線を減らしても、各 edge のラベル全文に各 surface から届く。
- **writer に hub や組を書かせない**（TPL-1227）。公開済みのモデルにも効く。
- **edge の identity を保つ。** ADR-1185 は「並列を単一の論理 edge に集約する案」を、id selector・`direction`・diff の表示が edge 単位で動くことを理由に却下している。本件も同じ制約を受ける。
- **意味の違う edge を 1 本にしない。** sync と async は構造の意味である（`docs/concepts.ja.md`）。ADR-2958 は種別の違う edge を同じ束に入れない。
- **閾値で canvas を不連続に変えない。** ADR-3022 は「密な canvas ではラベルを全部隠す」案を、edge を 1 本足しただけで図が変わることを理由に却下した。ADR-2394 は集合から取った閾値を却下している。
- **両方向の組が無い canvas の出力は変えない**（TPL-2174）。
- **out of scope**: `database` canvas の投影された関連の集約（#2728）、card の下を通る配線（#3026）。

## 検討した選択肢

### 案1: 両方向の組を、card の位置を変えずに 1 本の線に重ねる

配置と経路選択は今日のまま行う。経路が決まった後で、両方向の組の片方の経路をもう片方にも使う。
2 本の線が同じ折れ線の上に重なり、それぞれの矢印が自分の target に付くので、両端に矢印のある
1 本の線に見える。

**メリット**

- Umami: 41 本 → 27 本、交差 157 → 61 か所。
- card が動かない。既存の図で変わるのは両方向の組の線だけ。
- edge の `<g>` は 2 つのまま残る。canonical id・style・`direction`・diff state・hit-line は edge ごとに残る。ADR-1185 が却下した論理統合ではない。
- 両方向の依存（循環）が、両端に矢印のある線としてかえって目に付く。

**デメリット**

- 片方の経路のために `distributePorts` が取った port が空く。
- 重なった 2 本のラベル・hit-line・交差マークの扱いを決める必要がある（「実装の指針」）。

### 案2: 両方向の組を 1 つの辺として配置する

配置（layout）の段階で組を 1 辺として扱い、card の位置もそれに合わせて決める。

**メリット**

- Umami: 41 本 → 27 本、交差 157 → 70 か所。

**デメリット**

- card が動く。重ねる組を含む `examples/` の 4 ファイルで配置が変わる。
- 交差は案1 より多い（70 か所対 61 か所）。この fixture では、今の配置のまま重ねた方が良かった。

### 案3: hub の edge を薄くする（または card に件数を出す）

多くの node が依存する node（hub）への edge を、既定で薄く描くか、描かずに card に件数を出す。
node focus で戻す。

**メリット**

- 「ほかの 3/4 以上が依存する node」を hub とすると、Umami では `TrackedEntities` と `Identity` が該当する。
  案1 と併せると、濃く描かれる線は 16 本、その間の交差は 24 か所になる。

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

| 観点                         | 案1 重ねる | 案2 1 辺で配置 | 案3 hub を薄く          | 案4 何もしない |
| ---------------------------- | ---------- | -------------- | ----------------------- | -------------- |
| Umami の線                   | 27 本      | 27 本          | 41 本（濃いのは 24 本） | 41 本          |
| Umami の交差                 | 61         | 70             | 157（濃い線の間は 56）  | 157            |
| card の移動                  | なし       | あり           | なし                    | なし           |
| edge の identity             | 保つ       | 保つ           | 保つ                    | 保つ           |
| 閾値                         | なし       | なし           | 要る                    | なし           |
| `examples/` で変わるファイル | 4 / 85     | 4 / 85         | 閾値しだい              | 0              |

`examples/` の 85 ファイルのうち、両方向の組を描くのは 6 ファイル・8 組。そのうち 2 組は sync と
async の組なので、案1 でも 2 本のまま残る（`getting-started/index.krs` の en / ja。どちらもこの 1 組だけ）。
重なるのは 4 ファイルの 6 組である。

## 現時点の方針

**案1 を採用する。** 両方向の組は、card の位置を変えずに 1 本の線に重ねる。hub の扱い（案3）は
domain canvas では採らず、#2728 に渡す。

理由:

- 線と交差がいちばん減り（27 本、61 か所）、card が動かない。
- edge は 1 本ずつ残る。重ねるのは描画だけで、論理統合ではない。
- 閾値を持たない。重ねるかどうかは、その 2 本が区別できるかどうかだけで決まる（TPL-3027）。
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

1. **重ねる条件。** 次をすべて満たす組だけを重ねる。1 つでも外れたら今日どおり 2 本で描く（TPL-3027）。
   - `A -> B` と `B -> A` が同じ canvas にあり、両端がその canvas の card である
   - 種別（sync / async）が同じ
   - 解決済みの線の style（色・太さ・`stroke-style`・opacity）が同じ
   - diff 表示では、diff state が同じ
   - どちらも ghost でも cyclic でもない（どちらも描き方と交差マークの扱いが別にある）
   - どちらも trunk や gutter lane の束（`trunkId` / `outTrunkId` / ADR-2958 の束）に入っていない
   - どちらの向きにも同じ `(from, to)` の並列 edge が無い（ADR-1185 の束と混ぜない）
2. **style の判定をどこでするか。** edge の style は `layout()` ではなく svg-renderer で解決されるので、
   `layout()` は style を知らない。`LayoutOptions` に「この edge の線の見た目を表す鍵」を返す callback を
   足し（`chipZoneFor` と同じ注入の形）、renderer の呼び出しが解決済みの style から鍵を作って渡す。
   callback を渡さない呼び出し（draw.io exporter など）では重ねない。今日の出力のまま残る。
3. **どちらの経路を使うか。** 入力順（AST の出現順）で先の edge の経路を使い、後の edge の経路は捨てる。
   後の edge には先の edge の折れ線を逆順にして持たせる。決定的で、snapshot が安定する。
4. **パスの位置。** 配置と幅の探索が終わった後、`computeCrossingMarks`（`layout.ts` の `layout()` の中）の
   直前に置く。`markParallelBundles` は `layoutInner` の中で走り、その結果は channel / column の予約と幅の
   探索に入るので、そこに置くと card が動きうる。探索の後に置けば card は動かない。予約した lane は捨てた
   経路の分だけ空くが、それは受け入れる（「未解決の問い」）。multi-system の system 間 edge の経路にも
   同じパスを掛ける。後のパスが片方だけ座標を動かさないことを測る（TPL-2958）。
5. **描画。** 各 edge の `<g>` は今日どおり 2 つ出る。それぞれが自分の線と、自分の target 側の矢印を描く。
   `marker-start` は使わない。重ねた 2 本の `<g>` には `data-edge-paired` を付け、重ねていない edge には
   何も付けない（TPL-2174）。相手は「from と to を入れ替え、種別が同じ edge」で決まるので、id を値に
   持たせない（`canonicalId` を持たない edge、たとえば集約した `N domain edges` も組になれる）。
6. **ラベル。** ADR-1185 の束の欄（`bundleIndex` / `bundleSize`）は使わない。使うと 2 本目のラベルが
   `t = 2/3` になり、逆順の折れ線の上では 1 本目と同じ位置に重なる。重ねた組のラベルは、どちらも自分の
   折れ線の `t = 1/3`（自分の source から 3 分の 1）を既定の位置にする。その後は ADR-3022 の配置と保留に
   通す。そのとき、相手の線は障害物から外す（配置パスが外すのは自分の線だけで、相手の線は同じ座標に
   あるので、外さないと既定の位置が必ず衝突する）。
7. **hover と hit。** 各 edge の hit-line は、重なった線のうち自分の source に近い半分だけを覆う。
   重ねた組の見える線と矢印は `pointer-events: none` にし、pointer を受けるのは hit-line だけにする
   （上に描かれた方の線が、下の edge の半分でも hover を取らないように）。これで線の半分ずつに hover して、
   それぞれの edge が強調され、保留したラベルの `<title>` にも届く（TPL-3022）。hover の強調は今日どおり
   `.krs-edge` に掛かる（TPL-2632）。クリックは今日どおり focus canvas を開き、そこには両方向が 1 本 1 行で
   出る。
8. **交差マーク。** hop は 1 か所に 1 つで、今日も `detectMarks` が点で重複を除き、1 本の edge を持ち主に
   する。その線に隙間を空けて hop を描くので、重ねた組が持ち主のときは、隙間を相手の線にも空ける
   （空けないと、相手の線が hop を貫いて接続に見える）。hop の持ち主には組の 2 本とも数え、どちらかが
   焦点なら明るく残す（TPL-3090）。
9. **surface。** パスは `layout()` にあるので、system・drill-down・all-layers・all-views・静的出力・
   VS Code preview に同じく効く（TPL-219）。deploy の edge は ghost なので対象外。
10. **テスト。**
    - fixture で 41 本 → 27 本の線、交差 157 → 61 か所以下を数値で固定する
    - 重ねない条件を 1 つずつ外した組（sync / async、色違い、diff state 違い、cyclic、並列あり）で 2 本のまま残ることを確かめる
    - style の callback を渡さない `layout()` の出力が今日と同じであること
    - 両方向の組が無い `examples/` の SVG が byte-stable であること
    - 重ねた組の 2 本のラベルが重ならず、相手の線との衝突で保留されないこと（fixture で数える）
    - 重ねた組の両方の hit-line に、線のどこかで pointer が届くこと。保留したラベルは、その `<title>` に届くこと（静的 SVG）
    - 重ねた組が持ち主の hop で、2 本とも隙間を空けていること
11. **AT。** 実装 PR で `docs/acceptance/3027-mutual-edge-pair-merge.md` を作る。TC:
    - Umami fixture の drill-down で、両方向の組が両端に矢印のある 1 本の線で描かれる
    - 線の source 側の半分に hover すると、その向きの edge が強調される。ラベルが保留されていれば、tooltip にその向きのラベルが出る
    - 線のクリックで focus canvas が開き、両方向が 1 行ずつ出る
    - sync と async の組（`examples/en/getting-started/index.krs`）は 2 本のまま
    - diff 表示で片方だけが変わった組は 2 本のまま、それぞれの diff state で描かれる
12. ADR 昇格: 実装完了後、`docs/adr/3027-mutual-edge-pair-merge.md` として昇格し、本 Design Doc は同 PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 同じ種別・同じ style の両方向の組を持つ図では、組の 2 本が 1 本に重なる。`.krs` の解釈は変わらない。
- ドキュメント更新: `docs/concepts.ja.md`（と英語版）の「集約」節に、両方向の組は 1 本の線に重なることを 1 文足す。
- テスト・examples への影響: `examples/` の 4 ファイル（6 組）の図が変わる。snapshot の更新が要る。

## 未解決の問い / 決めないこと

- **重ねない style property。** 今は作らない。2 本で描きたい writer は、片方の色を変えれば重ならない。要望が出たら足す。
- **空いた port と lane を詰めるか。** 重ねた後に `distributePorts` や lane の予約をやり直すと、card の辺の上の port と channel が詰まる。経路が変わるので交差が増えうる。実装時に測り、効果が無ければやらない。
- **hub の扱い。** #2728 で決める。domain canvas に戻すかどうかは、#2728 の決定が閾値を持たない形になったときに考える。
