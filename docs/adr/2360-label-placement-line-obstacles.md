---
id: ADR-2360
title: "label placement の障害物にエッジ polyline を加える — 自分の線だけ除外する"
status: accepted
date: 2026-08-09
topic: renderer
refines: [ADR-2048]
related_to:
  - ADR-1184
  - ADR-968
scope:
  packages: [core]
assumptions:
  - "file: packages/core/src/renderer/label-placement.ts"
  - "symbol: packages/core/src/renderer/label-placement.ts :: EdgeLine"
  - "symbol: packages/core/src/renderer/label-placement.ts :: countLabelLinePenetrations"
  - "symbol: packages/core/src/renderer/label-placement.ts :: edgeLine"
  - "file: packages/core/src/renderer/label-placement.test.ts"
  - "grep: packages/core/src/renderer/svg-renderer.ts :: resolveLabelPlacements\\(labelInputs, nodeRects, edgeLines\\)"
---

# ADR-2360: label placement の障害物にエッジ polyline を加える — 自分の線だけ除外する

- **日付**: 2026-08-09
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#2360](https://github.com/kompiro/karasu/issues/2360)
  - 関連 ADR: [ADR-2048](./2048-edge-label-collision-avoidance.md)（本 ADR が障害物集合を広げる元の決定）、[ADR-1184](./1184-edge-label-position-offset.md)（手動 `label-position` / `label-offset` lever）、[ADR-968](./968-orthogonal-edge-routing-skip-layer.md)（ghost / cyclic エッジを周辺幾何として各パスから除外する）
  - 関連 TPL: [TPL-2048](../test-perspectives/TPL-2048-label-placement-measured-and-byte-stable.md)（本 PR で計測軸を 1 つ追加）、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)
  - AT: `docs/acceptance/2360-edge-labels-off-foreign-lines.md`

## 背景

エッジラベルが他エッジの polyline の真上に置かれ、線と文字が重なって両方読めなくなっていた（#2360）。`examples/en` の system view を実測すると、**534 ラベル中 49 件が他エッジの線に乗っていた**（12 モデル × グルーピング none / team / boundary。hr-tool の "Check punch status" が代表例で、別エッジの長い水平区間が文字を貫いている）。グルーピングの有無を問わず発生するので、特定のビューモードの問題ではない。

原因は探索ではなく**障害物集合**にある。ADR-2048 の label placement pass は衝突したラベルを clear するまで nudge するが、その障害物は**葉ノードの矩形と配置済みラベルだけ**で、エッジの polyline を見ていない。結果として 2 つの取りこぼしが同時に起きる:

- カードから逃がしたラベルが、逃げた先の線の上に着地する
- そもそもカードと衝突しなかったラベルは pass の検討対象にすらならない（線に乗っていても動かない）

探索側は既に 2 軸・決定論・変位の小さい順という形が整っているので、障害物クラスを 1 つ足すだけで済み、新しい探索戦略は要らない。

## 決定

`resolveLabelPlacements` の障害物集合に**他エッジの polyline**を加える。ラベル自身のエッジの線は除外する（ラベルはその線を指すために置かれているので、乗っているのが正しい）。

- `buildLabelInputs` が `edgeLines: EdgeLine[]` を返す。対象は**ラベルの有無によらず描画される全エッジ** — ラベルの無いエッジのストロークも同じように文字を潰すため。
- ghost / cyclic エッジは移動対象からも障害物からも引き続き外す（ADR-968 の既存除外をそのまま踏襲）。
- 交差判定は `edge-geometry.ts` の `segmentCrossesAnyRect`（strict-interior）を再利用する。ルーターが経路を決めるのと同じ 1 つの定義なので、pass と「貫通 0」を assert するテストが食い違いようがない（TPL-1927）。
- コストは**線 1 本 = ノード矩形 1 枚と同じ重み**。文字の上を走るストロークは背後のカードと同程度に読めなくするため、重み付けの根拠がない。
- 計測ヘルパー `countLabelLinePenetrations` を追加する。`countLabelPenetrations` / `countLabelOverlaps` と同じくラベル単位で数え、自分の線は数えない。
- `EdgeLine` は `edgeLine(index, points)` 1 箇所でのみ構築し、bounds（AABB）を事前計算する。候補ループが全ラベル × 全線を回すので、正確な線分判定の前に安価な bounds reject を挟む。

## 理由

- **症状が数値で消える**: `examples/en` 全体の実測で **49 → 0**。既存の label↔node 貫通・label↔label オーバーラップも 0 のまま（hr-tool の柵で 3 軸同時に assert しており、1 つの読めなさを別の読めなさと交換していないことを担保する）。
- **byte-stability を壊さない**: 自分の線を除外するので、衝突していない既定配置のラベルは 1px も動かない。core の renderer snapshot は**全 124 ファイル無変更で green**、変化したのは guide diagram 1 件のラベル 1 個だけだった（交差マークの真上に乗っていたラベルが約 21px スライドした）。ADR-1184 → ADR-2048 と受け継いだ「衝突が無い限り byte-identical」の約束はそのまま成立する。
- **author lever は不可侵のまま**: eligibility の判定は変えていないので、`label-position` / `label-offset` を指定したラベルは引き続き動かず、障害物としてだけ効く（ADR-1184 precedence）。
- **ADR-2048 を覆さない**: pass の位置・2 軸探索・候補順・決定論・best-effort の性格はすべて維持し、障害物集合だけを広げる。よって supersede ではなく `refines`。
- **変位は実測で穏当**: 動いたラベルは 534 中 64 件（従来 32 件）で、変位の中央値 21px・p90 42px・最大 75px。最大値も既存の探索上限（6 ステップ ≈ 90px）の内側に収まっている。

## 却下した案

### 案: 線を障害物にせず、ラベルに白い下地（halo）を敷く
文字の背後に背景色の矩形を敷いて線を隠す。
- 却下理由: 線のほうを消してしまうため、エッジが halo のところで途切れて見える。karasu はエッジの連続性そのものを読ませる図で、`crossing-marks` の hop（交差を跨ぐ弧）は「線が途切れるのは交差を跨ぐときだけ」という読み方を前提にしている。halo はそこに 2 つ目の途切れ方を持ち込み、読みやすさをラベル側で買ってエッジ側で払う交換になる。

### 案: 線コストをノード矩形より軽くする（tie-break 用の弱いペナルティに留める）
線は「多少重なっても読める」として、ノード貫通より小さい重みにする。
- 却下理由: #2360 の実例（長い水平区間が文字の高さのど真ん中を通る）は、カードが背後にあるのと同じくらい読めない。軽い重みでは「線に乗ったままのほうが総コストが低い」候補が選ばれ、症状が残る。重みに差を付ける根拠が可読性の側に無い。

### 案: 自分のエッジの線も障害物に含める
例外を作らず、すべての線を一様に避ける。
- 却下理由: すべてのエッジラベルは既定で自分の線の上に乗っているので、全ラベルが必ず移動対象になる。byte-stability が完全に消え、既存の全 snapshot が churn したうえ、ラベルが自分のエッジから離れて「どの線のラベルか」が読めなくなる。

## スコープ外（フォローアップ）

- **deploy view**: `deploy-renderer.ts` は独自のエッジ描画で `renderEdge` を通らないため、ADR-2048 と同じく本 pass の対象外。
- **境界フレーム（container）の枠線**: ラベルが正当に内側に住む領域なので、ADR-2048 の判断どおり障害物に含めない。フレームの**枠線**を線障害物として別扱いする案は本 ADR では扱わない。
- **best-effort の限界は据え置き**: 周辺の空きより幅広いラベルは探索上限内で完全に clear できないことがある（貫通を増やさないことは保証、0 は保証しない）。author は `label-position` / `label-offset`（ADR-1184）で明示的に逃がせる。
- **変位上限**: 現状は探索上限（≈ 90px）が実質の上限で、それとは別のラベル変位キャップは設けていない。実測の最大が 75px（`examples/en/hato/index.krs` の幅広ラベル 1 件）で許容範囲と判断した。ラベルとエッジの対応が読めなくなる事例が出たら、そのとき変位キャップを別途検討する。
