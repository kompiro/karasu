---
type: product
---

# AT: ガターを通るエッジを、共有する端ごとに 1 レーンへ束ねる（#2958）

- **日付**: 2026-10-07
- **関連 Issue**: [#2958](https://github.com/kompiro/karasu/issues/2958)（派生: [#3088](https://github.com/kompiro/karasu/issues/3088) 接するだけの corridor がチャネルのレーン分けで重なる既存 bug）
- **設計**: [ADR-2958](../adr/2958-gutter-lane-bundling.md)（案 B）。関連 ADR: [ADR-2330](../adr/2330-ungrouped-routing-parity.md)（refine 予定）、[ADR-2631](../adr/2631-trunk-legibility-by-count.md)、[ADR-2598](../adr/2598-edge-routing-channel-capacity.md)（決定 8 / #2490）、[ADR-1185](../adr/1185-parallel-edge-bundling.md)
- **Related TPLs**: [TPL-2958](../test-perspectives/TPL-2958-bundle-shared-geometry-survives-later-passes.md)（束の共有区間はチェーンの最後まで同一座標）, [TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md)（柵は限界に届く入力を持つ）, [TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md) / [TPL-1954](../test-perspectives/TPL-1954-new-route-shape-participates-in-overlap-passes.md)（貫通 0・兄弟以外の共線 0）
- **対象ファイル**:
  - `packages/core/src/renderer/edge-routing-groups.ts`（`distributeGutterLanes` / `bundleGutterCorridors`）
  - `packages/core/src/renderer/edge-routing-lanes.ts`（`collectChannels`: 束の同一 run を 1 レーンに）
  - `packages/core/src/renderer/crossing-marks.ts` / `edge-routing.ts`（合流点とラベル区間を `trunkJoin` から求める）
  - `packages/core/src/renderer/layout-types.ts`（`LayoutEdge.trunkJoin`）

> 共有する target（または source）を持つガターの corridor を 1 レーンにまとめ、1 本の spine と本数チップ・帯で描く。経路の側も形も変えず、レーンの x だけを変える。ungrouped でも grouped でも同じ規則で動く。同期と非同期のエッジは同じ束に入れない（#2490）。

## 受け入れ条件

### AC-1: 共有する端を持つ corridor が 1 レーンにまとまる

- [x] AT-A: 同じ target へ同じ入り方で入る corridor が同じレーンに載り、束ごとに一意な `trunkId` を持つ。`groupBackward` は外れる

  > ✅ Automated — `packages/core/src/renderer/edge-routing-lane-bundles.test.ts` › `lane bundles (#2958)` › `puts corridors entering one target the same way on one lane`

- [x] AT-B: mixed 経路（チャネルを経てガターへ出る経路）も、素直な経路と同じ規則で束になる

  > ✅ Automated — `packages/core/src/renderer/edge-routing-lane-bundles.test.ts` › `lane bundles (#2958)` › `bundles a mixed route with a plain one by the part they share`

- [x] AT-C: 同じ source から同じ出方で出る corridor が fan-out の束になり、fan-in が先に取る

  > ✅ Automated — `packages/core/src/renderer/edge-routing-lane-bundles.test.ts` › `lane bundles (#2958)` › `puts corridors leaving one source the same way on one lane`
  >
  > ✅ Automated — `packages/core/src/renderer/edge-routing-lane-bundles.test.ts` › `lane bundles (#2958)` › `lets a shared target claim an edge before a shared source does`

- [x] AT-D: 同期と非同期のエッジは同じ束に入らない（#2490 / ADR-2598 決定 8）

  > ✅ Automated — `packages/core/src/renderer/edge-routing-lane-bundles.test.ts` › `lane bundles (#2958)` › `never bundles a sync edge with an async one (#2490)`
  >
  > ✅ Automated — `packages/core/src/renderer/layout.expand.test.ts` › `layout — in-place expansion keeps parallel edges apart (#2490, via #2598)` › `lays no collinear segment of one on a segment of the other`

### AC-2: 束がチェーンの最後まで束のまま残る（TPL-2958）

- [x] AT-E: 飽和した図（usecase 16 → table 10、ungrouped、左ガターあり）で、全チェーン後も兄弟の spine と共有区間が同一座標。行間チャネルの束対応を外すと落ちる

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `saturated gutter — lane bundle fence (#2958, TPL-2958 / TPL-2598)` › `siblings still share their spine and their shared end after the whole chain (TPL-2958)`

- [x] AT-F: 同じ束の同一の水平 run は行間チャネルで 1 レーンに残り、束でなければ分かれる

  > ✅ Automated — `packages/core/src/renderer/edge-routing-lane-bundles.test.ts` › `lane bundles downstream (#2958)` › `keeps a bundle's identical channel runs on one lane`

- [x] AT-G: 束 1 つが取るレーンは 1 本。ガターのレーン数は「束の数 + 単独の数」以下（main では 41 レーン、本実装で 18）

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `saturated gutter — lane bundle fence (#2958, TPL-2958 / TPL-2598)` › `each bundle takes one lane, so the gutter needs no more lanes than bundles and singles`

### AC-3: 貫通 0・兄弟以外の共線 0 を保つ

- [x] AT-H: 飽和した図で貫通 0、兄弟以外の共線 0（両軸）

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `saturated gutter — lane bundle fence (#2958, TPL-2958 / TPL-2598)` › `no edge pierces a card, and no two non-siblings share a collinear segment`

- [x] AT-I: examples の ungrouped 柵（貫通 0・共線 0）が引き続き通る

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `shared routing chain — ungrouped fences (#2362, TPL-1927)` › `%s: no edge pierces a node card`

### AC-4: 各エッジを個別に読める（ADR-2631 決定 2）

- [x] AT-J: 合流マークは各兄弟が spine に乗る点に付く（mixed 経路ではチャネルの角の先）

  > ✅ Automated — `packages/core/src/renderer/edge-routing-lane-bundles.test.ts` › `lane bundles downstream (#2958)` › `marks the merge where each sibling joins the spine, even past a channel elbow`

- [x] AT-K: ラベルは、そのエッジだけが持つ区間（合流点の手前 / 分岐点の先）に出る

  > ✅ Automated — `packages/core/src/renderer/edge-routing-lane-bundles.test.ts` › `lane bundles downstream (#2958)` › `labels a sibling on the segment that reaches the spine, not on the spine`
  >
  > ✅ Automated — `packages/core/src/renderer/edge-routing-lane-bundles.test.ts` › `lane bundles downstream (#2958)` › `labels a fan-out sibling on the segment leaving the spine`

### AC-5: 束ねる対象がない図は変わらない

- [x] AT-L: 端を共有しない corridor は、#2958 以前と同じレーンに置かれ、束の印を持たない。examples の ungrouped ルートビュー 12 本は 1 バイトも変わらないことを計測で確認した（変わったのは grouped の getting-started（team）だけで、交差 4 → 3）

  > ✅ Automated — `packages/core/src/renderer/edge-routing-lane-bundles.test.ts` › `lane bundles (#2958)` › `lays out corridors that share no end as it did before #2958`
  >
  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `shared routing chain — grouped output is unchanged (#2362, AC-5 replacement)` › `%s (group by %s): penetration 0, %i crossings`

## 手動確認

判定に「読めるか」の目が要る 3 項目。ローカルまたは PR の preview の app で、下のモデルを `index.krs` として開き、`Sat › Api › Know` まで drill-down する（Group by: none）。

```krs
  system Sat {
    service Api {
      domain Know {
        usecase U0 {
          resource DB.T0 { operations read }
          resource DB.T2 { operations read }
          resource DB.T5 { operations read }
          resource DB.T1 { operations read }
        }
        usecase U1 {
          resource DB.T2 { operations read }
          resource DB.T4 { operations read }
          resource DB.T1 { operations read }
          resource DB.T3 { operations read }
        }
        usecase U2 {
          resource DB.T4 { operations read }
          resource DB.T0 { operations read }
          resource DB.T3 { operations read }
          resource DB.T5 { operations read }
        }
        usecase U3 {
          resource DB.T0 { operations read }
          resource DB.T2 { operations read }
          resource DB.T5 { operations read }
          resource DB.T1 { operations read }
        }
        usecase U4 {
          resource DB.T2 { operations read }
          resource DB.T4 { operations read }
          resource DB.T1 { operations read }
          resource DB.T3 { operations read }
        }
        usecase U5 {
          resource DB.T4 { operations read }
          resource DB.T0 { operations read }
          resource DB.T3 { operations read }
          resource DB.T5 { operations read }
        }
        usecase U6 {
          resource DB.T0 { operations read }
          resource DB.T2 { operations read }
          resource DB.T5 { operations read }
          resource DB.T1 { operations read }
        }
        usecase U7 {
          resource DB.T2 { operations read }
          resource DB.T4 { operations read }
          resource DB.T1 { operations read }
          resource DB.T3 { operations read }
        }
      }
    }
    database DB {
      table T0 {}
      table T1 {}
      table T2 {}
      table T3 {}
      table T4 {}
      table T5 {}
    }
  }
```

- [ ] 右のガターで、T3 へ入る 4 本（U1・U2・U5・U7 から）が 1 本の線にまとまり、合流点ごとに本数チップ（2 → 3 → 4）と、本数に応じた太さの帯が付いている。左のガターでは、U0 から出る 2 本（T2・T5 行き）が 1 本の線で出てから分かれている
- [ ] 束の中の 1 本（例: U2 → T3）に pointer を置くと、そのエッジだけが強調され、同じ束のほかのエッジは強調されない
- [ ] 束の各エッジの `R` ラベルが、共有の縦線の上ではなく、そのエッジだけが通る区間（合流点の手前）に出ている
