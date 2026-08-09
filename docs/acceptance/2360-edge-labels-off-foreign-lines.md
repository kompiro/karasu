# AT: エッジラベルが他エッジの線の上に乗らない（label placement の障害物に polyline を追加）

- **日付**: 2026-08-09
- **関連 Issue**: [#2360](https://github.com/kompiro/karasu/issues/2360)
- **設計 (ADR)**: [ADR-2360](../adr/2360-label-placement-line-obstacles.md)
- **対象ファイル**:
  - `packages/core/src/renderer/label-placement.ts`（`EdgeLine` / `edgeLine` / `countLabelLinePenetrations` を追加、障害物集合と cost を拡張）
  - `packages/core/src/renderer/label-placement.test.ts`
  - `packages/core/src/renderer/svg-renderer.ts`（`edgeLines` を pass に配線）
- **関連**: [ADR-2048](../adr/2048-edge-label-collision-avoidance.md)（本 ADR が障害物集合を広げる元の決定）、[ADR-1184](../adr/1184-edge-label-position-offset.md)（手動 `label-position` / `label-offset` lever）、[TPL-2048](../test-perspectives/TPL-2048-label-placement-measured-and-byte-stable.md)（本 PR で label↔line 軸を追加）、[TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)

## 受け入れ条件

- [x] 他エッジの線の上に既定配置されるラベルが、pass 後に線から外れる（label↔line 貫通数が 0 になる）
  > ✅ Automated — `label-placement.test.ts` › `lifts a label off a foreign edge's line (label↔line penetrations → 0) — #2360`

- [x] 自分のエッジの線の上に乗っているだけのラベルは動かない（override マップが空 = byte-stable）
  > ✅ Automated — `never moves a label off its own edge's line (byte-stable) — #2360`

- [x] `countLabelLinePenetrations` が他エッジの線による貫通だけを数え、自分の線は数えない
  > ✅ Automated — `countLabelLinePenetrations counts labels crossed by a foreign line, and exempts the own line`

- [x] 折れた（waypoint 付き）polyline は bounds ではなく実際の線分で判定される
  > ✅ Automated — `countLabelLinePenetrations follows a bent polyline's segments, not just its bounds`

- [x] ラベルの無いエッジの線も障害物になり、ghost / cyclic エッジの線は障害物にならない
  > ✅ Automated — `offers every drawn edge as a line obstacle, including unlabelled ones (#2360)` / `excludes ghost and cyclic edges (peripheral geometry — ADR-968), keeps real ones`

- [x] 実サンプル（`examples/en/hr-tool/system.krs` の system top view）で、線を障害物に含めない配置では貫通が発生し、pass 後は label↔line・label↔node・label↔label の 3 軸すべてが 0 になる
  > ✅ Automated — `real sample fence — hr-tool system top view (#2360)`。precondition で vacuous でないことを確認している（TPL-1954）

- [x] 既存の label↔node / label↔label の柵と byte-stability が退行しない
  > ✅ Automated — `real sample fence — ec-platform system top view (#2048)` ほか `label-placement.test.ts` の既存ケース全 21 件。加えて core の renderer snapshot 群（124 test file / 3360 test）が無変更で green

- [x] 線を障害物に加えても pass は決定論的で、clear できない密なケースでも throw せず貫通を増やさない
  > ✅ Automated — `is deterministic — identical inputs yield identical placements` / `stays best-effort when lines blanket the search area — never increases line penetrations`

- [ ] app の system top view で、エッジラベルの文字を他エッジの線が貫いていない
  > 🧑 Manual — <https://karasu.kompiro.dev/> で `examples/en/hr-tool/system.krs` の内容を `index.krs` として開き、"Check punch status" の文字を別エッジの水平線が横切っていないことを目視で確認する。

- [ ] ラベルが自分のエッジから離れすぎて、どの線のラベルか読めなくなっていない
  > 🧑 Manual — 同じく app で `examples/en/hato/index.krs` の内容を `index.krs` として開き、"Requests coaching text"（実測で最大変位 75px のラベル）が依然として `HatoApi -> OpenAI` のエッジのラベルとして読めることを目視で確認する。

## 範囲外（follow-up）

- **deploy view のラベル**: `deploy-renderer.ts` は独自のエッジ描画で `renderEdge` を通らないため、ADR-2048 と同じく本 pass の対象外。
- **境界フレーム（container）の枠線**: ラベルが正当に内側に住む領域なので障害物に含めない（ADR-2048 の判断を踏襲）。枠線だけを線障害物として別扱いする案は扱わない。
- **best-effort の限界**: 周辺の空きより幅広いラベルは探索上限（2 軸 × 各 ±6 ステップ、≈ 90px）の範囲内で完全に clear できないことがある。その場合は最小コスト位置に置く（貫通を増やさないことは保証するが 0 は保証しない）。author は `label-position` / `label-offset`（ADR-1184）で明示的に逃がせる。
- **ラベル変位の上限**: 探索上限とは別の変位キャップは設けていない。`examples/en` 全体の実測で中央値 21px・p90 42px・最大 75px。
