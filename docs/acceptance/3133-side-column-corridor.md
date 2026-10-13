---
type: product
---

# AT: 側面列の奥のカードへのエッジを、側面列とグリッドの間の空き列で通す（#3133）

- **日付**: 2026-10-13
- **関連 Issue**: [#3133](https://github.com/kompiro/karasu/issues/3133)
- **設計 (ADR)**: [ADR-3133](../adr/3133-side-column-last-resort-corridor.md)
- **関連 ADR**: [ADR-1728](../adr/1728-external-on-sides-layout.md)、[ADR-2611](../adr/2611-layer-spanning-edge-columns.md)、[ADR-3026](../adr/3026-same-row-channel-route.md)、[ADR-2330](../adr/2330-ungrouped-routing-parity.md)
- **Related TPLs**: [TPL-3026](../test-perspectives/TPL-3026-candidate-chain-covers-every-endpoint-relation.md), [TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md), [TPL-2598](../test-perspectives/TPL-2598-fence-corpus-must-reach-the-limit.md), [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)
- **対象ファイル**: `packages/core/src/renderer/edge-routing-groups.ts`（`routeGroupedEdges` の最後の候補 / `freeColumnLanes` / `lanesAcross` / `channelBelow` / `channelAbove` / `mixedEnd`）

> `[external]` の側面列（ADR-1728）にあるカードと、グリッドのカードを結ぶエッジが、間のカードを直線で突き抜けていた（dify の system ビューで 3 本、7 件）。側面列は隙間なく積まれたカードの列なので、ガターへ出る stub はどれも側面列かグリッドを横切る。側面列とグリッドの間には空いた列があるが、端点の中点から遠く、中点に近い順に試す corridor の上限に入らなかった。どの候補も成立しないエッジに限り、端点の間でカードが立たない列のレーンをすべて試す最後の候補を足す。

## 受け入れ条件

### AC-1: 側面列のカードへのエッジが、カードを貫通しない

- [x] AT-A: fixture（dify の system ビューから縮めたもの）で `Gateway` は左の側面列にあり、エッジの中心どうしの直線はカードを貫通する（fixture が形に届いている）

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `edge into a side column (#3133, TPL-3026 / TPL-1927)` › `the fixture puts Gateway in the left column, and its edge's straight line on a card`

- [x] AT-B: 同じ fixture で貫通 0、両軸の collinear overlap 0。修正を外すと落ちる

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `edge into a side column (#3133, TPL-3026 / TPL-1927)` › `no edge pierces a card, and no two edges share a collinear segment`

- [x] AT-C: `Storefront -> Gateway` の縦の区間が、側面列とグリッドの間の空き列を通る

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › `edge into a side column (#3133, TPL-3026 / TPL-1927)` › `the edge runs down the gap between the column and the grid`
  >
  > ✅ Automated — `packages/core/src/renderer/edge-routing-side-column.test.ts` › `last-resort corridor beside a side column (#3133)` › `runs an edge to the far end of the column down the gap between it and the grid`

### AC-2: 行間チャネルは、横走りが通るカードから測る

- [x] AT-D: 端点の隣に背の高いカードがあり、端点の下端のすぐ下から側面列のカードが始まるとき、チャネルは側面列のカードではなく、横走りが上を通るカードから測られ、隣のカードの下端より下に来る。全カードから測ると落ちる

  > ✅ Automated — `packages/core/src/renderer/edge-routing-side-column.test.ts` › `last-resort corridor beside a side column (#3133)` › `measures the channel from the cards under the run, not from the side column`

### AC-3: 該当しない図は変わらない

- [x] AT-E: 最後の候補は grouped キャンバスでは使わない（空き列をカードだけから測るため。ADR-3026 の同じ行の候補と同じ）

  > ✅ Automated — `packages/core/src/renderer/edge-routing-side-column.test.ts` › `last-resort corridor beside a side column (#3133)` › `is not offered on a grouped canvas`

- [x] AT-F: `examples/` の全モデルと既存の routing fence・スナップショットが無変更で通る。4 つの逆生成モデル（1,542 ビュー）で経路が変わるのは dify の system ビューの 2 ビュー（12 本）だけで、貫通は 14 → 0、collinear overlap は増えない（`reports/3133-side-column-corridor/` で計測）

  > ✅ Automated — `pnpm --filter @karasu-tools/core test`

## 手動確認

判定に「読めるか」の目が要る 1 項目。app（https://karasu.kompiro.dev/）で下のモデルを `index.krs` として開き、system ビューを表示する（Group by: none）。

```krs
system Shop {
  client Console [web] {
    description "Back-office console where staff run the catalogue"
  }
  client Storefront [web]
  client ShopCli [cli] {
    description "Command line tool for importing products and prices"
  }
  service WebServer {
    description "Server-side renderer for the console and the storefront pages"
  }
  service Proxy [external]
  service Gateway [external]
  service PartnerWebhookSource [external]
  service MetricsAndTracesVendor [external]
  service Crawler [external]
  service Sandbox [external]
  service Marketplace [external]
  PartnerWebhookSource -> Gateway
  Storefront -> Gateway
}
```

- [ ] `Storefront` から `Gateway` への線が `Console` を横切らず、`Storefront` の下から行間を通って、側面列とグリッドの間を下り、`Gateway` に入る経路として読める
