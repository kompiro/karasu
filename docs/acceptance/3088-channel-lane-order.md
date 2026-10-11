---
type: product
---

# AT: 行間チャネルのレーンを、run がつながる縦線の向きで並べる（#3088）

- **日付**: 2026-10-09
- **関連 Issue**: [#3088](https://github.com/kompiro/karasu/issues/3088)
- **設計**: #3088 の Design Doc（[#3095](https://github.com/kompiro/karasu/pull/3095)、ADR 昇格予定）。関連 ADR: [ADR-2598](../adr/2598-edge-routing-channel-capacity.md)、[ADR-2958](../adr/2958-gutter-lane-bundling.md)
- **Related TPLs**: [TPL-3088](../test-perspectives/TPL-3088-later-pass-moves-ends-in-the-direction-earlier-separation-assumed.md)（本 PR で起こした retrospective TPL）, [TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md), [TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md), [TPL-2958](../test-perspectives/TPL-2958-bundle-shared-geometry-survives-later-passes.md)
- **対象ファイル**: `packages/core/src/renderer/edge-routing-lanes.ts`（`laneOrder` / `distributeChannelLanes`）

> 同じガターのレーンに接するだけで載った 2 本の corridor が、行間チャネルのレーン分けで 14px 重なっていた。チャネルのレーンを、同じ x から上へ続く run が下へ続く run より上になるよう並べ替える。ガターのレーンは変えない。

## 受け入れ条件

### AC-1: 接していただけの corridor が重ならない

- [x] AT-A: 区間分割が逆順に割ったチャネルで、上へ続く run が下へ続く run より上のレーンに来て、同じ x の縦線が重ならない。修正を外すと落ちる

  > ✅ Automated — `packages/core/src/renderer/edge-routing-lanes.test.ts` › `channel lane order (#3088)` › `puts the run that carries on upwards above the one that carries on downwards`

- [x] AT-B: 接する corridor を持つ合成入力 2 つ（飽和フィクスチャの table 4 本版、相方付き hub）で、兄弟以外の共線 0・貫通 0。修正前はそれぞれ 1 件重なっていた

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `channel lane order — corridors that touch in one channel (#3088, TPL-3088 / TPL-2598)` › `%s: no two non-siblings share a collinear segment, and nothing pierces a card`
  >
  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `channel lane order — corridors that touch in one channel (#3088, TPL-3088 / TPL-2598)` › `%s: the fixture puts two corridors' ends in one channel`

### AC-2: 直す必要のない図は変わらない

- [x] AT-C: 並び順を求める制約が無いチャネルは、レーンを割った順のまま。Dify の全階層と `examples/en` の全ファイルで、全 view の SVG が修正前とバイト一致することを計測で確認した

  > ✅ Automated — `packages/core/src/renderer/edge-routing-lanes.test.ts` › `channel lane order (#3088)` › `keeps the order lanes were handed out in when no run asks otherwise`

### AC-3: 制約が循環しても、循環の外の制約は守る

- [x] AT-D: 循環する 2 レーンと、それと制約で結ばれた 3 本目のレーンで、循環の外の制約が守られ、循環の中は元の順、結果が決定的

  > ✅ Automated — `packages/core/src/renderer/edge-routing-lanes.test.ts` › `channel lane order (#3088)` › `keeps every request outside a cycle, and orders inside it by lane`
