---
type: product
---

# AT: ドリルダウンの最上段の上・最下段の下のチャネルを、枠の内側で測る（#3132）

- **日付**: 2026-10-13
- **関連 Issue**: [#3132](https://github.com/kompiro/karasu/issues/3132)
- **関連 ADR**: [ADR-2598](../adr/2598-edge-routing-channel-capacity.md)、[ADR-3026](../adr/3026-same-row-channel-route.md)
- **Related TPLs**: [TPL-3132](../test-perspectives/TPL-3132-resource-inside-a-frame-measured-against-the-frame.md), [TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md), [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md), [TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)
- **対象ファイル**: `packages/core/src/renderer/edge-routing-lanes.ts`（`ChannelLimits` / `collectChannels`）、`packages/core/src/renderer/edge-routing-groups.ts`（`channelBelow` / `channelAbove`）、`packages/core/src/renderer/layout.ts`（`channelReservations`）、`packages/core/src/renderer/layer-layout-logics.ts`（`placeNodesInLayers`）

> ドリルダウンの最上段の上と最下段の下のチャネルは、カードを囲む枠を見ずに測られていた。最下段の下は枠の外の ghost カードまでの帯として測られ、片側に何も無いときはレーンが外へ積まれて、どちらでもレーンとラベルが枠の線に載るか枠の外に出た。枠のタイトル帯の下端と下端をチャネルの境界に加え、足りなければ枠を広げる。

## 受け入れ条件

fixture は 2 種: 同期と非同期の依存を互いに張った domain を 1 行に並べたもの（4 枚・5 枚、`S › App`）と、兄弟 service の domain から呼ばれて枠の下に ghost カードが置かれるもの。枠の内側の帯は、タイトル帯の下端と枠の下端から半ピッチずつ内側とする。

### AC-1: レーンが枠の内側に収まる

- [x] AT-A: 1 行の fixture は全カードが 1 行に並び、最上段の上のチャネルに要るレーンが、予約の無い配置の余白に収まらない（fixture が限界に届いている）

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `drill-down channels end at the frame (#3132, TPL-3132 / TPL-2598)` › `%s: the fixture puts every card in one row and needs more lanes than the default padding holds`

- [x] AT-B: 1 行の fixture で、すべての run が枠の内側の帯に入り、配置が 2 回走って枠が広がる。修正前は 4 枚で 4 本、5 枚で 14 本が帯の外に出る

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `drill-down channels end at the frame (#3132, TPL-3132 / TPL-2598)` › `%s: every run stays inside the frame, and the frame grew to hold them`

- [x] AT-C: 1 行の fixture で、貫通 0、両軸の collinear overlap 0

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `drill-down channels end at the frame (#3132, TPL-3132 / TPL-2598)` › `%s: no edge pierces a card, and no two edges share a collinear segment`

### AC-2: 枠の外の物がチャネルの境界にならない

- [x] AT-D: 枠の下に ghost カードがあっても、最下段の下の run は行と枠の下端の中点に置かれる（修正前は行と ghost カードの中点で、枠の下端の 10px 手前）

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `drill-down channels end at the frame (#3132, TPL-3132 / TPL-2598)` › `a ghost card outside the frame does not widen the channel below the last row`

- [x] AT-E: 枠の線は高さ 0 の障害物として帯を閉じる。最下段の下は枠の外のカードではなく枠の下端で、最上段の上はタイトル帯の下端で閉じ、レーンは帯の中心に並ぶ

  > ✅ Automated — `packages/core/src/renderer/edge-routing-lanes.test.ts` › `the enclosing frame bounds the outer channels (#3132)` › `ends the channel below the last row at the frame, not at a card beyond it`
  >
  > ✅ Automated — `packages/core/src/renderer/edge-routing-lanes.test.ts` › `the enclosing frame bounds the outer channels (#3132)` › `closes the channel above the first row at the title strip, so its lanes centre`
  >
  > ✅ Automated — `packages/core/src/renderer/edge-routing-lanes.test.ts` › `the enclosing frame bounds the outer channels (#3132)` › `reads the limits off the frame: below its title strip, at its bottom border`

- [x] AT-F: 最終行の下の予約は、カードを動かさずに枠の高さだけを伸ばす

  > ✅ Automated — `packages/core/src/renderer/layer-layout-logics.test.ts` › `placeNodesInLayers > channel reservation (#2608)` › `reserves below the last row through the ordinal one past it (#3132)`

### AC-3: 枠の無いビューは変わらない

- [x] AT-G: system ビュー（枠が無い）の片側が開いたチャネルは、従来どおり行から離れる向きにレーンを積む（ADR-3026）

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `drill-down channels end at the frame (#3132, TPL-3132 / TPL-2598)` › `a system view has no frame, and its open channels still stack away from the row (ADR-3026)`
  >
  > ✅ Automated — `packages/core/src/renderer/edge-routing-lanes.test.ts` › `the enclosing frame bounds the outer channels (#3132)` › `leaves an open channel stacking away from the row when there is no frame`

- [x] AT-H: `examples/` の全モデルと既存の routing fence・スナップショットが無変更で通る。4 つの逆生成モデル（1,542 ビュー）で経路が変わるのは 3 ビューの 5 本で、貫通・collinear overlap・交差・キャンバスの大きさは変わらない（`reports/3132-frame-bounded-channels/` で計測）

  > ✅ Automated — `pnpm --filter @karasu-tools/core test`

## 手動確認

判定に「枠の内側に読めるか」の目が要る 1 項目。app（https://karasu.kompiro.dev/）で下のモデルを `index.krs` として開き、`S › App` まで drill-down する（Group by: none）。

```krs
system S {
  service App {
    domain A {
      A -> B
      A --> B
      A -> C
      A --> C
      A -> D
      A --> D
    }
    domain B {
      B -> A
      B --> A
      B -> C
      B --> C
      B -> D
      B --> D
    }
    domain C {
      C -> A
      C --> A
      C -> B
      C --> B
      C -> D
      C --> D
    }
    domain D {
      D -> A
      D --> A
      D -> B
      D --> B
      D -> C
      D --> C
    }
  }
}
```

- [ ] 行の上と下を回る線がすべて `App` の枠の内側に描かれ、枠の線と重ならない。上側の線は枠のタイトル `App` に掛からない
