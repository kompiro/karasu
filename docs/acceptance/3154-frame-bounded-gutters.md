---
type: product
---

# AT: ドリルダウンのガターのレーンを、枠の側面の内側に収める（#3154）

- **日付**: 2026-10-22
- **関連 Issue**: [#3154](https://github.com/kompiro/karasu/issues/3154)
- **設計 (ADR)**: [ADR-3154](../adr/3154-frame-bounded-gutters.md)
- **関連 ADR**: [ADR-3132](../adr/3132-frame-bounded-channels.md)、[ADR-2598](../adr/2598-edge-routing-channel-capacity.md)
- **Related TPLs**: [TPL-3132](../test-perspectives/TPL-3132-resource-inside-a-frame-measured-against-the-frame.md), [TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md), [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md), [TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)
- **対象ファイル**: `packages/core/src/renderer/edge-routing-lanes.ts`（`ChannelLimits` / `channelLimitsOf`）、`packages/core/src/renderer/edge-routing-groups.ts`（`contentBounds` とガターの 4 つのパス）、`packages/core/src/renderer/layout-edges.ts`（`runRoutingChain`）、`packages/core/src/renderer/layout-reservations.ts`（`gutterReservations`）、`packages/core/src/renderer/layout.ts`（`layoutInner`）

> ドリルダウンのガターのレーンは、内容の端から外へ 24px ずつ積まれ、枠の左右の余白（40px）を見なかった。2 本目から枠の線に載るか枠の外に出て、枠の横に ghost カードがあると 1 本目から外に出た。ガターの基準を枠の内側のカードで測り、足りない幅は 2 回目の配置で枠の側面に予約する。

## 受け入れ条件

fixture は `S › App` のドリルダウン。T / M / B の 3 行で、各 T が自分の M と全 B を同期・非同期の両方で呼ぶ（4 列・5 列）。M の行が T → B の直線を塞ぐので、長い edge はガターを通る。

### AC-1: レーンが枠の側面の内側に収まる

- [x] AT-A: fixture は、どちらかの側でガターのレーンを 2 本以上使う（fixture が枠の余白の限界に届いている）

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `drill-down gutters stay inside the frame (#3154, TPL-3132 / TPL-2598)` › `%s: the fixture needs more than one gutter lane on a side`

- [x] AT-B: ghost でも循環でもない edge の縦の線がすべて枠の側面から 12px 以上内側にあり、配置が 2 回走って枠が内容の幅 + 左右の余白より広がる。修正前は 4 列で 1 本、5 列で 6 本が外に出る

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `drill-down gutters stay inside the frame (#3154, TPL-3132 / TPL-2598)` › `%s: every vertical run stays inside the frame, and the frame grew to hold them`

- [x] AT-C: 同じ fixture で、貫通 0、両軸の collinear overlap 0

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `drill-down gutters stay inside the frame (#3154, TPL-3132 / TPL-2598)` › `%s: no edge pierces a card, and no two edges share a collinear segment`

### AC-2: 枠の外の物がガターの基準にならない

- [x] AT-D: 枠の横の ghost カード（左の利用者、右の呼び出し元）は、ガターの基準（左端・右端）にならない。枠が無いときは今までどおり全カードを数える

  > ✅ Automated — `packages/core/src/renderer/edge-routing-frame-sides.test.ts` › `drill-down gutters are measured inside the frame (#3154, TPL-3132)` › `a ghost card beside the frame does not set the gutter basis`

- [x] AT-E: `channelLimitsOf` が枠の側面（`left` / `right`）を返す

  > ✅ Automated — `packages/core/src/renderer/edge-routing-lanes.test.ts` › `the enclosing frame bounds the outer channels (#3132)` › `reads the limits off the frame: below its title strip, at its bottom border and sides`

### AC-3: アプリでの見え方

- [ ] AT-F: 下のモデルを `index.krs` として開き、`S › App` にドリルダウンすると、左右のガターのレーンがすべて `App` の枠の内側に描かれ、枠の線の上や外に縦の線が無い

  ```krs
  system S {
    service App {
      domain T0 {
        T0 -> M0
        T0 --> M0
        T0 -> B0
        T0 --> B0
        T0 -> B1
        T0 --> B1
        T0 -> B2
        T0 --> B2
        T0 -> B3
        T0 --> B3
      }
      domain T1 {
        T1 -> M1
        T1 --> M1
        T1 -> B0
        T1 --> B0
        T1 -> B1
        T1 --> B1
        T1 -> B2
        T1 --> B2
        T1 -> B3
        T1 --> B3
      }
      domain T2 {
        T2 -> M2
        T2 --> M2
        T2 -> B0
        T2 --> B0
        T2 -> B1
        T2 --> B1
        T2 -> B2
        T2 --> B2
        T2 -> B3
        T2 --> B3
      }
      domain T3 {
        T3 -> M3
        T3 --> M3
        T3 -> B0
        T3 --> B0
        T3 -> B1
        T3 --> B1
        T3 -> B2
        T3 --> B2
        T3 -> B3
        T3 --> B3
      }
      domain M0 {
        M0 -> B0
        M0 --> B0
      }
      domain M1 {
        M1 -> B1
        M1 --> B1
      }
      domain M2 {
        M2 -> B2
        M2 --> B2
      }
      domain M3 {
        M3 -> B3
        M3 --> B3
      }
      domain B0 {}
      domain B1 {}
      domain B2 {}
      domain B3 {}
    }
  }
  ```
