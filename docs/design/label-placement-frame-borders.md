# ずらしたエッジラベルを枠の線の上・向こう側に置かない

- **日付**: 2026-10-22
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3155](https://github.com/kompiro/karasu/issues/3155)（#3132 の検証中に発見）
  - 関連 ADR: [ADR-2048](../adr/2048-edge-label-collision-avoidance.md)（ラベルの衝突回避）、[ADR-2360](../adr/2360-label-placement-line-obstacles.md)（障害物にエッジの線を足した決定。「枠の線を線障害物として別扱いする案は本 ADR では扱わない」とスコープ外にした）、[ADR-3022](../adr/3022-edge-label-disclosure.md)（`label-display: auto` で置けないラベルを外す）、[ADR-3132](../adr/3132-frame-bounded-channels.md) / [ADR-3154](../adr/3154-frame-bounded-gutters.md)（run を枠の内側に収めた決定）、[ADR-968](../adr/968-orthogonal-edge-routing-skip-layer.md)
  - 関連 TPL: [TPL-2048](../test-perspectives/TPL-2048-label-placement-measured-and-byte-stable.md)（実装 PR で計測軸を 1 つ足す）、[TPL-3132](../test-perspectives/TPL-3132-resource-inside-a-frame-measured-against-the-frame.md)、[TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)
  - コード: `packages/core/src/renderer/label-placement.ts`、`packages/core/src/renderer/frame-geometry.ts`、`packages/core/src/renderer/svg-renderer.ts`

## 背景・課題

ラベルの衝突回避（ADR-2048 / ADR-2360）は、カード・確定済みのラベル・他エッジの線を障害物にして、衝突したラベルを近くの空きへずらす。枠（ドリルダウンの枠、team / boundary の group 枠）は障害物に入っていない。そのため、混んだ場所からずらしたラベルが枠の線の上や枠の外に描かれる。

Issue の再現（Umami の `UmamiApp` ドリルダウン）では、`Administration -> Teams` のラベル "lists all teams via queries/prisma/team getTeams" が、隣のラベルを避けて約 35px 下へずらされ、枠の下端の線をまたいで描かれる。#3132 / #3154 で run は枠の内側に収まったが、ラベルは別のパスなので残った。

4 つの逆生成モデル（umami / dify / twenty / wordpress）と `examples/en` の全ビュー × グルーピング（none / team / boundary）、計 4,626 ビューで `main`（206441c2）を測った。

| 指標 | 件数 |
| --- | --- |
| 描かれたラベル | 22,270 |
| 箱に枠の線が掛かるラベル | 132（うち 114 件はずらした結果） |
| 既定位置と反対の側（枠の内↔外）へずらされたラベル | 57 |

計測は `reports/3155-label-frame-borders/`（gitignore）の `measure.mts`。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| 障害物集合 | カード矩形、確定済みラベルの箱、他エッジの polyline（自分の線は除外、ADR-2360） |
| 枠を外した理由 | ADR-2048 / TPL-2048: 枠の**面**はラベルが正当に住む領域で、面を障害物にするとドリルダウンで全ラベルが枠の外へ追い出される。ADR-2360 は枠の**線**の扱いをスコープ外として残した |
| 枠の所在 | `layoutResult.containers`。ドリルダウンの枠、group 枠（boundary は `coverage` で L 字に広がることがある）、展開した container の枠、ghost の祖先枠 |
| 枠の描き方 | `renderContainer`: `coverage` があれば `rectUnionPath` の外形、無ければ `<rect>`。線の太さは展開枠 2、それ以外は frame paint か container style の `borderWidth` |
| コスト | 衝突 2・曖昧さ 1（自分の線より近い他エッジの線がある）。`label-display: auto` では衝突の残るラベルを外す（ADR-3022） |

## 制約・前提

- **衝突の無い図は変えない**（TPL-2048 の byte-stability）。枠の線から離れたラベルは 1px も動かさない
- **枠の面は障害物にしない**（ADR-2048 の判断を維持）
- 曖昧さの項は「どのエッジのラベルに見えるか」の判定なので、エッジでないものを入れない
- 決定論・探索範囲の prune が厳密であること（ADR-2360）
- スコープ外: 枠のタイトル文字とラベルの重なり、deploy ビュー（`renderEdge` を通らない）

## 検討した選択肢

### 案1: 枠の外形を、他エッジと同じ線障害物として足す

枠の外形を polyline にして、箱に掛かれば衝突とする。

**メリット**

- 既存の線障害物の仕組みに乗るだけで、新しい判定が要らない

**デメリット**

- 線を「またぐ」候補は止まるが、線を**跳び越えた**候補は止まらない。ラベルの箱は高さ約 15px、1 ステップも約 15px なので、2 ステップ先の候補は枠の線に掛からずに枠の外に収まる。Issue の症状（枠の外に描かれる）が残る

### 案2: エッジの両端を囲む枠の内側に収める（包含制約）

両端点のカードを両方とも囲む枠を求め、候補の箱がその内側に無ければ衝突とする。

**メリット**

- 「枠の中のエッジのラベルは枠の中」という Issue の期待をそのまま書ける

**デメリット**

- 自分の run が枠の外を通るエッジ（boundary 枠は重なり L 字にもなるので、両端が枠の中でも経路が外を回る）のラベルは、既定位置が枠の外にある。包含制約はこれらを枠の内側へ引き込み、ラベルが自分の線から離れる。`main` の WordPress で、既定位置のまま両端を囲む枠の外にあるラベルが 23 件（うち 19 件が boundary グルーピング）あり、全部が動く
- 両端を囲まない枠（エッジが横切る枠、無関係な隣の枠）の線は防げない

### 案3: 既定位置と同じ側に留め、線に掛けない（採用）

枠ごとに、ラベルの**既定位置の箱の中心**がその枠の内か外かを求める。候補は、(a) 枠の外形の線が箱に掛からず、(b) 箱の中心が既定位置と同じ側にあるときだけ、その枠について clear とする。破れば衝突（コスト 2）。

**メリット**

- 1 つの規則で、線の上（案1 の範囲）と、跳び越え（案1 の穴）と、枠の外への持ち出し（案2 の範囲）を同時に防ぐ
- 既定位置が枠の外にあるラベル（自分の線が外を通る）は外に留まり、自分の線から引き離さない（案2 の欠点が無い）
- 両端を囲まない枠も同じ規則で扱える。枠の数え分けが要らない
- 既定位置が枠の線から離れているラベルは、どの候補でも側が変わらず衝突が増えないので、動かない（byte-stability）

**デメリット**

- 既定位置で箱が枠の線に掛かっているラベルは、新しく衝突扱いになり動く（`main` で 18 件）。これは読めなさの解消なので許容する（ADR-2360 で線に乗っていたラベルを動かしたのと同じ）

### 案4: 枠の面を障害物にする

**却下**: ADR-2048 / TPL-2048 のとおり、ドリルダウンで枠の内側のラベルが全部追い出される。

## 現時点の方針

**案3 を採用する。** 枠に関係するのは面ではなく「線」と「どちら側か」で、側の基準を既定位置に取れば、Issue の症状（線の上・枠の外）を両方防ぎつつ、自分の線が枠の外を通るラベルを引き離さない。

### 実装の指針

1. `frame-geometry.ts` に `drawnFrame(frame)`（描かれる外形を閉じた polyline で、その外形が囲む矩形と一緒に返す。外形を 1 つの多角形として辿れない `coverage` は renderer と同じく本体の矩形に戻す）を足し、`rectUnionPath` の slab 走査を `rectUnionOutline` として移す。renderer の `<path>` と障害物が同じ角の列を使う
2. `label-placement.ts`
   - `FrameBorder`（外形を `EdgeLine` として包んだもの + 外形が囲む矩形）と `frameBorder(frame, strokeWidth)` を足す。`EdgeLine` の `index` は `-1` で、どのラベルの自分の線にもならない
   - `resolveLabelPlacements(labels, nodeRects, edgeLines, frames, options)`。ラベルごとに、既定位置の箱から探索が届く枠だけを、既定位置の側と一緒に取り出す（候補の中心は既定位置から `maxShift·√2` 以内なので、外形がそれ + 箱の半対角より遠い枠はどの候補でも結果が同じ。prune は厳密）
   - 候補のコストに、規則を破る枠 1 つにつき衝突 2 を足す。枠の線は曖昧さの判定に入れない
   - 計測ヘルパー `countLabelFrameCrossings({ defaultBox, box }[], frames)` を足す（ラベル単位）
3. `svg-renderer.ts`: `layoutResult.containers` の全枠（ghost の祖先枠を含む）を、`renderContainer` が描く線の太さで `frameBorder` にして渡す。線の太さは `renderContainer` と同じ関数で求める
4. テスト（`label-placement.test.ts`）
   - 合成: 線の向こうが最寄りの空きでも内側に留まる / 外から始まるラベルは外に留まる / 既定位置で線に掛かるラベルは外される / 線から離れたラベルは動かない / `auto` で同じ側に空きが無ければ外す / L 字の枠は外形で測る / 枠の線は曖昧さに入らない（枠を曖昧さに入れると落ちることを確認する）
   - 実サンプル柵: hr-tool の `Auth` ドリルダウン、team-ownership の team グルーピング。枠を渡さない pass では枠を越えるラベルが出ること（柵が vacuous でない）、渡すと 0 で、カード・ラベル・線との衝突も 0（TPL-2048 の全軸同時）
   - renderer の配線: 同じビューを `renderFromLayout` で描き、枠で位置が変わったラベルがその位置に描かれる（renderer が枠を渡さないと落ちることを確認する）
5. TPL-2048 に 4 本目の計測軸（label↔枠の線）と失敗モード（障害物集合の取りこぼし、面を障害物にする誤り）を足す
6. ADR-2360 の `assumptions` の grep（`resolveLabelPlacements\(labelInputs, nodeRects, edgeLines\)`）は引数が増えるので、`edgeLines` までの前方一致に緩める（frontmatter のみ）
7. AT: `docs/acceptance/3155-label-placement-frame-borders.md`。すべて自動テストで判定でき、手動項目は無い
8. ADR 昇格: 実装のマージ後、`docs/adr/3155-label-placement-frame-borders.md` として昇格し、本 Design Doc を削除する

### 実測（試作）

案3 を実装したブランチ（`fix/3155-label-placement-frame-borders`）で同じ 4,626 ビューを測った。

| 指標 | `main` | 案3 |
| --- | --- | --- |
| 箱に枠の線が掛かるラベル | 132 | 0 |
| 既定位置と反対の側へずらされたラベル | 57 | 0 |
| 位置が変わったラベル（`auto` で外れたものを含む） | （基準） | 137（54 ビュー） |
| `auto` で外れたラベル | 1,745 | 1,784（+39） |
| core の既存テスト・スナップショット | （基準） | 無変更で通る |
| ラベル配置 pass の時間（twenty 1,521 ケース / wordpress 3,096 ケース） | 728 / 470 ms | 719 / 522 ms |

位置が変わった 137 件のうち 45 件は、boundary グルーピングの `WordPressApp` 1 ビュー（ラベル 171、`main` で 40 件が枠の線上）で、1 件の移動が後続のラベルの空きを変える連鎖による。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 枠のあるビューで、枠の線上・枠の外にずらされていたラベルが枠の内側へ動くか、`label-display: auto` なら外れる。それ以外のラベルは動かない
- ドキュメント更新: TPL-2048、ADR-2360 の frontmatter（assumptions）
- テスト・examples への影響: 既存スナップショットは変わらない

## 未解決の問い / 決めないこと

- **枠のタイトル文字とラベルの重なり**は扱わない。タイトルは枠の左上の短い帯で、本件の症状（線・外側）とは別の障害物になる。必要になったらタイトルの箱を矩形障害物として足す（面ではないので ADR-2048 の判断に反しない）
- **既定位置が枠の外にあるラベル**（自分の run が枠の外を通る）を枠の中へ寄せることはしない。原因は経路で、ラベルを動かすとラベルと線が離れる。経路側で直すなら #3132 / #3154 の延長として別 Issue にする
- **deploy ビュー**は `renderEdge` を通らないので対象外（ADR-2048 / ADR-2360 と同じ）
