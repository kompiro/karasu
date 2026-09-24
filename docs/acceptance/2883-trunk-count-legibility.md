---
type: product
---

# AT: fan-in トランクを本数で読ませる（ラベルは自分の stub、合流マークは本数、spine は本数ぶんの帯）（#2883）

- **日付**: 2026-09-24
- **関連 Issue**: [#2883](https://github.com/kompiro/karasu/issues/2883)（親: [#2631](https://github.com/kompiro/karasu/issues/2631) スライス A / [#2598](https://github.com/kompiro/karasu/issues/2598)）
- **Related TPLs**: [TPL-2631](../test-perspectives/TPL-2631-decoration-must-not-hide-a-crossing-mark.md)（装飾を足したら、それが覆うマークがまだ読めることを寸法で測る）, [TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)（計測柵は資源の限界に達する入力を持って初めて柵になる）, [TPL-2385](../test-perspectives/TPL-2385-attachment-follows-drawn-outline.md)（端点は描かれた輪郭に載る）, [TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)（貫通と重なりを同じテストで測る）
- **対象ファイル**:
  - `packages/core/src/renderer/crossing-marks.ts`（検出と帯の分離、合流マークの本数、帯、帯に載るマークの退避）
  - `packages/core/src/renderer/svg-renderer.ts`（本数チップ、エッジの下に敷く帯）
  - `packages/core/src/renderer/edge-routing.ts`（`ownLabelSegment`: 共有 spine ではなく自分の stub にラベルを置く）
  - `packages/core/src/renderer/label-placement.ts`（衝突回避パスが同じアンカーを見る）
  - `packages/core/src/renderer/layout-types.ts`（`JunctionMark.count` / `TrunkBand` / `HopMark.ry`）

> 同じ target へ入るエッジは ADR-1859 P2c-B が 1 本の spine と 1 点の entry に束ねる。これは集約の表現であって欠陥ではないが（#2631 の AC-1 はこの判断で却下した）、dot だけでは 2 つが読めなかった。**どのラベルがどのエッジのものか**（既定の「最長セグメント中点」は最長である共有 spine に落ちるため、N 本のラベルが誰のものでもない線の脇に並ぶ）と、**合流後の 1 本が何本ぶんか**。前者はラベルを自分の stub へ、後者は dot を本数チップに置き換え spine を本数ぶんの帯として共有 entry まで描く。幾何は 1px も動かさない。

## 受け入れ条件

### AC-1: トランクを飽和させる fixture が柵に入っている（TPL-2598）

examples のどのモデルもトランクを作らない（全モード `0 trunked in 0 trunks`）ため、fixture を足すまでトランクの設計は柵の外にあった。

- [x] AT-A: 6 サービス → 1 共有 target の合成モデルが実際にトランクを作り、spine が下るにつれ 2, 3, 4… と運ぶ本数を変える

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `fan-in trunk — count fence (#2883, TPL-2598 / TPL-2631 / TPL-2385)` › `the fixture actually builds a trunk deep enough to need counting`

- [x] AT-B: 同 fixture で、トランク兄弟は spine 1 本と entry 1 点を共有し、それ以外の共線ペアは両軸 0（兄弟の除外を肯定側で固定し、暗黙の 0 を意図した 0 にする）

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `fan-in trunk — count fence (#2883, TPL-2598 / TPL-2631 / TPL-2385)` › `trunk siblings share one spine and one entry, and no other pair is collinear`

- [x] AT-C: 同 fixture で貫通 0（TPL-1927）

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `fan-in trunk — count fence (#2883, TPL-2598 / TPL-2631 / TPL-2385)` › `no lane spills into a card (TPL-1927 measures both axes together)`

### AC-2: 本数が読める

- [x] AT-D: 合流マークが「そこから先が何本ぶんか」を持ち、その数字は真下の帯が運ぶ本数と一致する

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `fan-in trunk — count fence (#2883, TPL-2598 / TPL-2631 / TPL-2385)` › `each merge mark carries what the spine holds below it`

- [x] AT-E: 合流マークが本数入りのチップとして描かれる（3 本のトランクなら 2, 3 と並ぶ）

  > ✅ Automated — `packages/core/src/renderer/crossing-marks.test.ts` › `computeCrossingMarks (#1859 P2c-C)` › `does not dot the trunk head (topmost stub is an L-corner, not a merge)`

- [x] AT-F: 帯が本数ぶんの幅でエッジの**下**に敷かれ、spine から共有 entry までが 1 本のポリラインになる（角が継ぎ目でなく接合になる）

  > ✅ Automated — `packages/core/src/renderer/group-by-render.test.ts` › `crossing marks layer (#1859 P2c-C)` › `draws a band as wide as the count, under the edges (#2883)`

- [x] AT-G: Group by: none には帯が出ない（トランクが無い）

  > ✅ Automated — `packages/core/src/renderer/group-by-render.test.ts` › `crossing marks layer (#1859 P2c-C)` › `has no bands in the ungrouped view, which has no trunks`

### AC-3: ラベルが自分のエッジを指す

- [x] AT-H: トランクエッジのラベルのアンカーが、そのエッジだけが持つ stub の上にある（`label-position` / `label-offset` を author が書いた場合は ADR-1184 のまま author 優先）

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `fan-in trunk — count fence (#2883, TPL-2598 / TPL-2631 / TPL-2385)` › `a trunk edge's label sits on the stub only that edge owns`

- [x] AT-I: ラベルを動かしても端点はノードの輪郭に載り続ける（TPL-2385、#2631 の AC-2）

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `fan-in trunk — count fence (#2883, TPL-2598 / TPL-2631 / TPL-2385)` › `every endpoint stays on its node's outline (TPL-2385)`

### AC-4: 装飾が交差マークを潰さない（TPL-2631）

- [x] AT-J: 帯に載る hop のアーチが、幅も高さも帯の半幅を超える（帯の外へ出る）。帯を足しただけの状態では埋もれることを確認してから固定した

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `fan-in trunk — count fence (#2883, TPL-2598 / TPL-2631 / TPL-2385)` › `an arc that rides a band arches clear of it (TPL-2631)`

- [x] AT-K: 本数チップが交差点を覆わない（覆う位置に来たときはチップが spine 上を退避する。動くのは本数側で、交差は動かさない）

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `fan-in trunk — count fence (#2883, TPL-2598 / TPL-2631 / TPL-2385)` › `no count mark covers a crossing`

### AC-5: 幾何と決定性

- [x] AT-L: 同じ入力が同じバイト列を描く

  > ✅ Automated — `packages/core/src/renderer/group-by-render.test.ts` › `crossing marks layer (#1859 P2c-C)` › `renders the same bytes for the same input`

- [x] AT-M: 交差検出（どの交差と合流があるか）は帯由来の調整と分離されており、空間 prefilter の parity はその検出結果で比較される

  > ✅ Automated — `packages/core/src/renderer/crossing-marks.test.ts` › `computeCrossingMarks spatial prefilter parity (#2760)` › `returns exactly the all-pairs result on random edge sets`

## 手動確認

判定に「読めるか」の目が要る 3 項目。到達先は公開 app（<https://karasu.kompiro.dev/>）で、fan-in が 3 本以上あるモデルを Group by: team で開く。幾何は自動テストが覆っているので、ここで見るのは読みの成否だけ。

- [ ] 各エッジのラベルが自分のカードの横（stub の上）にあり、どのラベルがどのエッジのものか目で辿れる
- [ ] 合流点の数字が下るにつれ増え、spine の太さが同じ刻みで太くなる。target に入る横線が束の最も太い部分になっている
- [ ] その spine を横切る線が、帯の外へ出るアーチで「またいでいる」と読める（数字が交差点を覆っていない）
