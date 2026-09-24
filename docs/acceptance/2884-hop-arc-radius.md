---
type: product
---

# AT: 交差アーチを 4px から 6px に上げ、帯の上でも描画が高さを守る（#2884）

- **日付**: 2026-09-24
- **関連 Issue**: [#2884](https://github.com/kompiro/karasu/issues/2884)（親: [#2631](https://github.com/kompiro/karasu/issues/2631) スライス B / [#2598](https://github.com/kompiro/karasu/issues/2598)）
- **Related TPLs**: [TPL-2631](../test-perspectives/TPL-2631-decoration-must-not-hide-a-crossing-mark.md)（装飾がマークを覆わないことを寸法で測る。assert は描画から読む）, [TPL-2803](../test-perspectives/TPL-2803-measured-lines-are-drawn-lines.md)（測った値と描いた値は同じもの）, [TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)（計測柵は資源の限界に達する入力を持って初めて柵になる）, [TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)（貫通と重なりを同じテストで測る）
- **対象ファイル**:
  - `packages/core/src/renderer/crossing-marks.ts`（`HOP_RADIUS` 4 → 6、上限とその根拠）
  - `packages/core/src/renderer/svg-renderer.ts`（アーチの `ry` に `HopMark.ry` を使う）
  - `docs/guide/diagrams/01-services.svg` / `.ja.svg`（`pnpm gen:guide-diagrams` の再生成物）

> アーチは「交差＝接続ではない」を言うために存在する（ADR-1859）。半径 4px は他に競合が無かった時期に決めた値で、実モデルを 6 倍に拡大すると線の欠けにしか見えない。半径は 4 から 9 まで振って 3 つの破綻（隣の平行線に届く / 端点でないカードに重なる / host 線のギャップが接続点まで届く）を数え、グループ化ビューが 9px で崩れる（隣接 0 → 36）ことから **6px** を上限として採った。拘束するのは `LANE_PITCH` ではなく `fanOutGutterPorts` がカード 1 辺に並べるポートの間隔である。
>
> 併せて、slice A（#2883）で入れた「帯に載るアーチを帯の外へ出す」高さが **描画に届いていなかった**。`svg-renderer` が全アーチの `ry` に定数 `HOP_RADIUS` を書いていたため、帯幅 8.5px の上でアーチは 6px のまま描かれていた。#2883 の AT-J はマークの値を測っており、緑のまま通っていた。

## 受け入れ条件

### AC-1: 既定の半径が回廊に収まり、その柵が限界に達している（TPL-2598）

- [x] AT-A: グループ化ビューが作る最も狭い回廊（1 つの hub が 12 target を呼び、各 target も自分の service から読まれる合成 fixture）で、既定半径のアーチが隣の平行線に届かない

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `hop arc radius — corridor fence (#2884, TPL-2598)` › `the default radius fits the tightest corridor, and the corpus reaches that limit`

- [x] AT-B: 同 fixture の回廊が 9px より狭い（設計が却下した半径に達している）ので、半径を上げると AT-A が落ちる。半径 7 で実際に落ちることを確認した

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `hop arc radius — corridor fence (#2884, TPL-2598)` › `the default radius fits the tightest corridor, and the corpus reaches that limit`

- [x] AT-C: マークの幅が半径から導かれる（定数を書き写した場所が無い）

  > ✅ Automated — `packages/core/src/renderer/crossing-marks.test.ts` › `computeCrossingMarks (#1859 P2c-C)` › `marks a hop where a horizontal segment crosses a vertical of another edge`

### AC-2: 帯に載るアーチが、描画でも帯の外に出る（TPL-2631 / TPL-2803）

- [x] AT-D: 帯のために広げられたアーチが、SVG の `A rx ry` でも広げた分だけ高く描かれる。定数を書いていた修正前のツリーでは落ちる（帯 8.5px の上で `ry` が 6 のままだった）

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `fan-in trunk — count fence (#2883, TPL-2598 / TPL-2631 / TPL-2385)` › `an arc widened for a band is *drawn* as tall as it was widened (#2884)`

- [x] AT-E: マーク側の同じ主張（アーチの幅と高さが帯の半幅を超える）も引き続き成り立つ。2 本は対で置く

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `fan-in trunk — count fence (#2883, TPL-2598 / TPL-2631 / TPL-2385)` › `an arc that rides a band arches clear of it (TPL-2631)`

### AC-3: 装飾だけの変更であること

- [x] AT-F: グループ化ビューの経路が変わらない（貫通 0 / 共線 0 / 交差数はピン留めのまま）。アーチはマークであって経路ではない

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `shared routing chain — grouped output is unchanged (#2362, AC-5 replacement)` › `%s (group by %s): penetration 0, %i crossings`

- [x] AT-G: 同じ入力が同じバイト列を描く

  > ✅ Automated — `packages/core/src/renderer/group-by-render.test.ts` › `crossing marks layer (#1859 P2c-C)` › `renders the same bytes for the same input`

- [x] AT-H: ガイドの生成図が再生成済みで、コミット済みのものと一致する

  > ✅ Automated — `scripts/guide/gen-guide-diagrams.test.ts` › `guide diagram codegen` › `the committed guide diagrams + image refs are up to date (run \`pnpm gen:guide-diagrams\` if this fails)`

## 手動確認

判定に「読めるか」の目が要る 2 項目。到達先は公開 app（<https://karasu.kompiro.dev/>）。寸法は自動テストが覆っているので、ここで見るのは読みの成否だけ。

- [ ] 交差のある図を等倍で開き、交差点のアーチが「線の欠け」ではなく「またいでいる記号」として読める
- [ ] fan-in が 3 本以上あるモデルを Group by: team で開き、帯を横切る線のアーチが帯の外へ出ていて、帯に合流しているようには見えない
