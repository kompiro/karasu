---
type: product
---

# AT: fan-out トランク（1 本の spine で source を出て、分岐ごとに本数が減る）（#2885）

- **日付**: 2026-09-26
- **関連 Issue**: [#2885](https://github.com/kompiro/karasu/issues/2885)（親: [#2631](https://github.com/kompiro/karasu/issues/2631) スライス C。前提: [#2883](https://github.com/kompiro/karasu/issues/2883) スライス A）
- **Related TPLs**: [TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)（計測柵は資源の限界に達する入力を持って初めて柵になる）, [TPL-2631](../test-perspectives/TPL-2631-decoration-must-not-hide-a-crossing-mark.md)（装飾を足したら、それが覆うマークがまだ読めることを寸法で測る）, [TPL-2385](../test-perspectives/TPL-2385-attachment-follows-drawn-outline.md)（端点は描かれた輪郭に載る）, [TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)（貫通と重なりを同じテストで測る）, [TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)（新しい経路形も重なり解消パスに参加する）
- **対象ファイル**:
  - `packages/core/src/renderer/edge-routing-groups.ts`（`aggregateGroupSourceTrunks`、lane の採番、`fanOutGutterPorts` の source 側スロット併合）
  - `packages/core/src/renderer/layout-edges.ts`（fan-in パスの直後に呼ぶ。grouped のみ）
  - `packages/core/src/renderer/crossing-marks.ts`（fan-out の分岐マークと帯、腕ごとの head 判定）
  - `packages/core/src/renderer/edge-routing.ts`（`ownLabelSegment`: fan-out エッジのラベルは自分の枝に置く）
  - `packages/core/src/renderer/layout-types.ts`（`LayoutEdge.outTrunkId`）

> 同じ source から出るガター経路は、これまでそれぞれ固有の lane と固有の fan port を取り、カード際で互いに交差していた。fan-in トランク（ADR-1859 AC-2）の鏡像として、これを 1 本の spine にまとめ、各 target の行で枝を落とす。合流ではなく分岐なので、数字は下るほど減る。数字の意味は fan-in と同じ「その点と共有端の間を spine が運ぶ本数」で、つねに隣の帯の太さと一致する。出口の共有は AC-2 の延長ではない独立した主張で、ADR 昇格時に明示的に決める。

## 受け入れ条件

### AC-1: fan-out を飽和させる fixture が柵に入っている（TPL-2598）

- [x] AT-A: #2883 のトランク fixture を拡張し、1 つの source から 4 本以上がガター経由で出て 1 本の fan-out トランクになり、spine が運ぶ本数が 3 通り以上に変わる

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `fan-out trunk — count fence (#2885, TPL-2598 / TPL-2631 / TPL-2385)` › `the fixture actually builds a fan-out trunk deep enough to need counting`

- [x] AT-B: 兄弟は出口 1 点と spine 1 本を共有し、各自の target の行で分かれる。それ以外の共線ペアは両軸 0

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `fan-out trunk — count fence (#2885, TPL-2598 / TPL-2631 / TPL-2385)` › `siblings share one exit and one spine, and no other pair is collinear`

- [x] AT-C: 端点はノードの輪郭に載り続け、貫通は 0（TPL-2385 / TPL-1927）

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `fan-out trunk — count fence (#2885, TPL-2598 / TPL-2631 / TPL-2385)` › `every endpoint stays on its node's outline, and no lane spills into a card (TPL-2385 / TPL-1927)`

### AC-2: 束の形成規則

- [x] AT-D: 同じ source から出るガター経路 3 本が 1 本の spine を共有する（以前は lane を 1 本ずつ取っていた）

  > ✅ Automated — `packages/core/src/renderer/edge-routing-groups.test.ts` › `aggregateGroupTrunks (#1859, P2c-B)` › `bundles the gutter edges leaving one source onto one fan-out spine (#2885)`

- [x] AT-E: 出口は source の辺上の 1 点で、枝は各自の target の行で水平に入る

  > ✅ Automated — `packages/core/src/renderer/edge-routing-groups.test.ts` › `aggregateGroupTrunks (#1859, P2c-B)` › `leaves a fan-out trunk's source through one exit, and branches at each target's row (#2885)`

- [x] AT-F: 共有 target を持つエッジは fan-in トランクが先に取り、fan-out には入らない。fan-out の spine はすべての fan-in spine より外側に置かれ、x を共有しない

  > ✅ Automated — `packages/core/src/renderer/edge-routing-groups.test.ts` › `aggregateGroupTrunks (#1859, P2c-B)` › `claims a shared target for the fan-in trunk first, and puts the fan-out spine beyond it (#1927 AC-3, #2885)`

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `fan-out trunk — count fence (#2885, TPL-2598 / TPL-2631 / TPL-2385)` › `its spine sits beyond every fan-in spine, so the two kinds never share an x`

- [x] AT-G: source がそれぞれ別の out-edge しかないモデルでは束が成立せず、帯も出ない

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `fan-out trunk — count fence (#2885, TPL-2598 / TPL-2631 / TPL-2385)` › `does not form where the out-edges have different sources, and leaves that model untouched`

### AC-3: 本数が下るほど減る

- [x] AT-H: 分岐マークの数字が source に近い方から N, N-1, …, 2 と並び、各数字は source 側の帯の本数と一致する。最も遠い分岐（spine の端）には数字を置かない

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `fan-out trunk — count fence (#2885, TPL-2598 / TPL-2631 / TPL-2385)` › `the count descends along the spine, and each matches the band it stands beside`

  > ✅ Automated — `packages/core/src/renderer/crossing-marks.test.ts` › `computeCrossingMarks — fan-out trunks and arms (#2885)` › `counts down a fan-out spine, and marks no split at the farthest branch`

- [x] AT-I: 帯は source の出口から始まり、エッジの進む向きに spine を下り、兄弟が抜けるたびに細くなる

  > ✅ Automated — `packages/core/src/renderer/crossing-marks.test.ts` › `computeCrossingMarks — fan-out trunks and arms (#2885)` › `draws the fan-out band from the source's exit, thinning as siblings leave`

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `fan-out trunk — count fence (#2885, TPL-2598 / TPL-2631 / TPL-2385)` › `the band starts at the source's exit and runs the way the edges travel`

- [x] AT-J: SVG では帯が本数ぶんの幅で描かれ、分岐マークに 3, 2 が出て 1 は出ない

  > ✅ Automated — `packages/core/src/renderer/group-by-render.test.ts` › `crossing marks layer (#1859 P2c-C)` › `draws a fan-out as one band from the source, counting down at each split (#2885)`

- [x] AT-K: spine の端は共有端をはさんだ腕ごとに取る（target が上にある fan-in、source が target の間にある fan-out のどちらでも、角に数字を置かず、合流・分岐を落とさない）

  > ✅ Automated — `packages/core/src/renderer/crossing-marks.test.ts` › `computeCrossingMarks — fan-out trunks and arms (#2885)` › `takes the head of a fan-in spine that runs up to its target as the lowest stub`

  > ✅ Automated — `packages/core/src/renderer/crossing-marks.test.ts` › `computeCrossingMarks — fan-out trunks and arms (#2885)` › `gives each arm its own head when the shared end sits between the siblings`

### AC-4: ラベルと交差マーク

- [x] AT-L: fan-out エッジのラベルのアンカーが、そのエッジだけが持つ枝（最後のセグメント）の上にある

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `fan-out trunk — count fence (#2885, TPL-2598 / TPL-2631 / TPL-2385)` › `a fan-out edge's label sits on the branch only that edge owns`

- [x] AT-M: 本数チップが交差点を覆わず、帯に載るアーチは帯の外へ出る（TPL-2631）

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `fan-out trunk — count fence (#2885, TPL-2598 / TPL-2631 / TPL-2385)` › `no count mark covers a crossing, and an arc on a band clears it (TPL-2631)`

### AC-5: 決定性と検出の parity

- [x] AT-N: 同じ入力が同じ幾何とマークを返す

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `fan-out trunk — count fence (#2885, TPL-2598 / TPL-2631 / TPL-2385)` › `gives the same geometry twice`

- [x] AT-O: 空間 prefilter の検出結果が all-pairs の参照実装と一致する（ランダム入力に fan-out エッジを含める）

  > ✅ Automated — `packages/core/src/renderer/crossing-marks.test.ts` › `computeCrossingMarks spatial prefilter parity (#2760)` › `returns exactly the all-pairs result on random edge sets`

## 手動確認

判定に「読めるか」の目が要る 1 項目（#2631 の設計が挙げた受け入れテストの 4 番）。到達先は公開 app（<https://karasu.kompiro.dev/>）で、`examples/en/feature-samples/team-ownership.krs` を Group by: team で開く（`Checkout` から 3 本が束になる）。幾何は自動テストが覆っているので、ここで見るのは読みの成否だけ。

- [ ] 1 本の spine が source から出て、枝が抜けるたびに数字が減り、帯が同じ刻みで細くなる。各ラベルが自分の枝（target に入る横線）の上にあり、どのラベルがどのエッジのものか目で辿れる
