---
id: ADR-3155
title: ずらしたエッジラベルは既定位置と同じ側に留め、枠の線に掛けない
status: accepted
date: 2026-10-29
topic: renderer
refines: [ADR-2360]
related_to: [ADR-2048, ADR-3022, ADR-1184, ADR-3132, ADR-3154]
scope:
  packages:
    - core
assumptions:
  - "symbol: packages/core/src/renderer/frame-geometry.ts :: drawnFrame"
  - "symbol: packages/core/src/renderer/frame-geometry.ts :: rectUnionOutline"
  - "symbol: packages/core/src/renderer/label-placement.ts :: frameBorder"
  - "symbol: packages/core/src/renderer/label-placement.ts :: countLabelFrameCrossings"
  - "symbol: packages/core/src/renderer/container-frame.ts :: frameBordersOf"
  - "grep: packages/core/src/renderer/container-frame.ts :: \"stroke-width\": frameStrokeWidth\\("
  - "grep: packages/core/src/renderer/svg-renderer.ts :: resolveLabelPlacements\\(labelInputs, nodeRects, edgeLines, frameBorders\\)"
  - "grep: packages/core/src/renderer/label-placement.test.ts :: frame borders as placement obstacles \\(#3155\\)"
  - "grep: packages/core/src/renderer/label-placement.test.ts :: real sample fence: frames \\(#3155\\)"
  - "file: docs/test-perspectives/TPL-2048-label-placement-measured-and-byte-stable.md"
---

# ADR-3155: ずらしたエッジラベルは既定位置と同じ側に留め、枠の線に掛けない

- **日付**: 2026-10-29
- **ステータス**: 決定済み
- **関連**:
  - Issue #3155（起点。#3132 の検証中に見つかった）、設計 PR #3319（本 ADR に集約し削除: `docs/design/label-placement-frame-borders.md`）、実装 PR #3320
  - [ADR-2360](2360-label-placement-line-obstacles.md)（障害物にエッジの線を足した決定。枠の線の扱いをスコープ外にしていた。本 ADR はその障害物集合に枠の線と側を足す）
  - [ADR-2048](2048-edge-label-collision-avoidance.md)（ラベルの衝突回避。枠の**面**は障害物にしない判断を維持する）、[ADR-3022](3022-edge-label-disclosure.md)（`label-display: auto` で置けないラベルを外す）、[ADR-1184](1184-edge-label-position-offset.md)（作者が置いたラベルは動かさない）
  - [ADR-3132](3132-frame-bounded-channels.md) / [ADR-3154](3154-frame-bounded-gutters.md)（run を枠の内側に収めた決定。ラベルは別のパスなので残っていた）
  - TPL: [TPL-2048](../test-perspectives/TPL-2048-label-placement-measured-and-byte-stable.md)（4 本目の計測軸「label↔枠の線」と失敗モードを追記した。新しい TPL は起こしていない）、[TPL-3132](../test-perspectives/TPL-3132-resource-inside-a-frame-measured-against-the-frame.md)、[TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)
  - AT: `docs/acceptance/3155-label-placement-frame-borders.md`

## 背景

ラベルの衝突回避（ADR-2048 / ADR-2360）は、カード・確定済みのラベル・他エッジの線を障害物にして、衝突したラベルを近くの空きへずらす。
枠（ドリルダウンの枠、team / boundary の group 枠）は障害物に入っていなかった。そのため、混んだ場所からずらしたラベルが枠の線の上や枠の外に描かれた。

Issue の再現（Umami の `UmamiApp` ドリルダウン）では、`Administration -> Teams` のラベルが隣のラベルを避けて約 35px 下へずらされ、
枠の下端の線をまたいで描かれた（このモデルのラベルは `auto` なので、実装後は外れる）。#3132 / #3154 で run は枠の内側に収まったが、ラベルは別のパスなので残った。

逆生成した 4 モデル（umami / dify / twenty / wordpress）と `examples/en` の全ビュー × グルーピング（none / team / boundary）、計 5,061 ケースで
描かれたラベル 22,270 件のうち、箱に枠の線が掛かるものが 132 件（うち 114 件はずらした結果）、既定位置と反対の側（枠の内↔外）へずらされたものが 57 件あった。
ケースの内訳は 4 モデルが 4,626、`examples/en` が 435 で、ノードが 2 未満のビューは除いた。基準は `main`（206441c2）、枠の線の太さは renderer が描く太さを使った。
計測スクリプトは `reports/3155-label-frame-borders/`（gitignore）の `measure2.mts`（件数）と `perf.mts`（時間）。

## 決定

設計時の案3 を採用する。枠ごとに、ラベルの**既定位置の箱の中心**がその枠の内か外かを求める。候補は、(a) 枠の外形の線が箱に掛からず、(b) 箱の中心が既定位置と同じ側にあるときだけ、
その枠について clear とする。破れば衝突 1 件（コスト 2）として数える。
判定は候補の着地点だけで行い、そこへ至る経路は見ない。細い枠や L 字の切り欠きを跳び越えて、既定位置と同じ側に着地する候補は clear である。

1. **外形**: 枠の外形は renderer が描くものと同じ角の列を使う（`drawnFrame` / `rectUnionOutline`）。線の太さは `frameStrokeWidth` を `renderContainer` と共有して求める（`frameBordersOf` が全枠を組む）。
   ghost の祖先枠・展開した枠・group 枠を含む、`layoutResult.containers` の全枠を渡す。
2. **内外の判定**: 枠が覆う矩形の集まり（`coverage` の各矩形。外形を 1 つの多角形として辿れない枠は本体の矩形）で行い、外接矩形は使わない。
   L 字の枠の欠けた角は外側である。矩形は閉じた矩形として扱い、中心がちょうど線上にある点は内側とする。
3. **探索範囲の prune**: 既定位置の箱から探索が届く枠だけを見る。届く距離は `maxShift·√2` に、線の太さの半分だけ広げた箱の半対角を足したもので、prune は厳密。
4. **曖昧さには入れない**: 枠の線は `EdgeLine`（`index: -1`）として線の判定を共有するが、曖昧さ（どのエッジのラベルに見えるか）の判定には入れない。
5. **枠の面は障害物にしない**（ADR-2048 を維持）。作者が `label-position` / `label-offset` で置いたラベル（ADR-1184）は動かさない。計測ヘルパー（`countLabelFrameCrossings`）には動かせるラベルだけを渡す。作者の指定だけで柵が落ちないようにするため。

## 理由

- 1 つの規則で、線の上と、線を跳び越えて枠の外へ出る候補と、枠の外への持ち出しを同時に扱える。`label-display: auto` では防ぎきる（規則を破る位置しか無ければ外す）。
- 側の基準を既定位置に取るので、自分の run が枠の外を通るラベルは外に留まり、自分の線から引き離されない。
- 両端を囲まない枠（エッジが横切る枠、隣の枠）も同じ規則で扱え、枠の数え分けが要らない。
- 枠のコストは候補のコストを増やすだけなので、枠の規則を破るラベルが無いビューは変わらない（TPL-2048 の byte-stability）。
- 実装の計測（同じ 5,061 ケース）で、枠の線が掛かるラベルは 132 → 0、反対の側へずらされたラベルは 57 → 0。位置が変わったラベルは 137 件（54 ビュー）で、
  うち 132 件は `main` で規則を破っていたもの、残り 5 件は先に確定したラベルが動いたことによる連鎖（すべて boundary グルーピングの `WordPressApp` 1 ビュー）。
  `auto` で外れたラベルは 1,745 → 1,784（+39）。core の既存テストの期待値は変わらなかった。
- 配置 pass の時間（`perf.mts`、5 回の最良値）は twenty 728 → 719 ms、wordpress 470 → 522 ms（+11%）。1 ケースあたり 0.02 ms 未満の差で、描画全体から見て無視できる。
  `perf.mts` はノードが 2 未満のビューも数え、線の太さを 2 に固定するので、ケースの集合が件数の計測と異なる。

## 却下した案

- **案1: 枠の外形を他エッジと同じ線障害物として足すだけ**: 線を「またぐ」候補は止まるが、線を跳び越えた候補は止まらない。ラベルの箱の高さと 1 ステップがどちらも約 15px なので、
  2 ステップ先の候補は線に掛からずに枠の外に収まり、Issue の症状（枠の外に描かれる）が残る。これは探索の形からの推論で、実測ではない
  （`main` では反対の側にあるラベル 57 件はすべて線にも掛かっている。線が障害物でないので、跳び越える理由が無かった）。
- **案2: エッジの両端を囲む枠の内側に収める（包含制約）**: 自分の run が枠の外を通るエッジのラベルを枠の内側へ引き込み、自分の線から離す
  （`main` の WordPress で 23 件、うち 19 件が boundary グルーピング。線の太さを 1 に固定した `measure.mts` の値で、線の太さに依らない）。両端を囲まない枠の線も防げない。
- **案4: 枠の面を障害物にする**: ADR-2048 / TPL-2048 のとおり、ドリルダウンで枠の内側のラベルが全部追い出される。

## 影響

- 枠のあるビューで、枠の線上・反対の側にずらされていたラベルが既定位置と同じ側へ動くか、`label-display: auto` なら外れる。
  既定位置のまま枠の線に掛かって描かれていたラベル（`main` で 18 件）も新しく衝突扱いになり動く。読めなさの解消なので許容する（ADR-2360 で線に乗っていたラベルを動かしたのと同じ）。
- 線から外すために、ラベルが自分の線から離れた位置へ動くことがある（hr-tool の `Auth` ドリルダウンの "Log in" は約 67px、getting-started の "List a product" は約 85px）。
  近い候補がどれも衝突するか枠の向こうにあるためで、候補の並びと `maxShift` は変えていない。
- 規則を破る枠は、カードやラベルとの衝突と同じ重みで数え、優先はしない。`label-display: always` で clear な候補が無いラベルは、これまでどおりコスト最小の候補に置かれ、
  枠の向こう側や線の上になることもある（文字が重なって読めなくなるより、枠を外れても読めるほうがよいと判断した）。`auto` ではこの比較は起きない。
- `examples/en` では 32 ケースで 44 件のラベルが動く。ガイドの生成 SVG（`docs/guide/diagrams/`、`gen-guide-diagrams.ts --check`）には差分が無かった。
- `docs/spec/style.md` / `style.ja.md` の `label-display: auto` の説明に、枠の規則（線に掛からず、既定位置と同じ側）を足した。ADR-2360 は frontmatter の `assumptions` だけを、
  枠を渡す呼び出しに合わせて更新した。
- 決めずに残したこと:
  - 枠のタイトル文字とラベルの重なり。必要になったらタイトルの箱を矩形障害物として足す（面ではないので ADR-2048 の判断に反しない）。
  - 既定位置が枠の外にあるラベル（自分の run が枠の外を通る）を枠の中へ寄せること。原因は経路なので、直すなら #3132 / #3154 の延長として経路側で扱う。
  - deploy ビュー（`renderEdge` を通らない。ADR-2048 / ADR-2360 と同じ）。
  - 角丸の枠: 障害物の外形と内外の判定は角の立った矩形で行う。既定の `rx`（8）で角の差は約 3.3px。
    角の内側では、描いた丸い線に掛かる箱を clear と判定しうる。柵も同じ角の立った外形で測るので検出しない（角の外側では判定が安全側にずれるだけ）。作者が `border-radius` を大きくした枠で困る例が出たら、角の `rx` 四方を衝突域として足す。
