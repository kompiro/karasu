---
type: product
---

# AT: 同じ行の 2 枚を結ぶエッジは、中央付近の stub の席が埋まっていても直線のまま残らない（#3309）

- **日付**: 2026-10-22
- **関連 Issue**: [#3309](https://github.com/kompiro/karasu/issues/3309)
- **関連 ADR**: [ADR-3026](../adr/3026-same-row-channel-route.md)、[ADR-3133](../adr/3133-side-column-last-resort-corridor.md)、[ADR-2611](../adr/2611-layer-spanning-edge-columns.md)
- **Related TPLs**: [TPL-3026](../test-perspectives/TPL-3026-candidate-chain-covers-every-endpoint-relation.md), [TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md), [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)
- **対象ファイル**: `packages/core/src/renderer/edge-routing-groups.ts`（`routeGroupedEdges` の最後の候補、`trySameRowChannelRoute`、`channelStub` / `StubSeats`）

> 同じ行の 2 枚を結ぶエッジは、行の上か下の行間チャネルを U 字に回る（ADR-3026）。stub の席はカードの中央とその両側 2 レーン分からしか選ばないので、混んだカードではその 5 か所がすべて他の経路の縦線に使われ、経路は clear なのに上下とも拒否されて、間のカードを貫通する直線のまま残った。ほかのどの候補も成立しなかったときに限り、stub の席をカードの幅いっぱいまで探して同じ候補をもう一度試す。

## 受け入れ条件

### AC-1: 中央付近の席が埋まっていても回る

- [x] AT-A: 両端のカードの中央付近の席を、行の上下とも他の経路が使っている組が、より外側の席から出入りして行を回る。stub は自分のカードの上に留まる

  > ✅ Automated — `packages/core/src/renderer/edge-routing-same-row.test.ts` › `same-row route when the seats beside each card's centre are taken (#3309)` › `goes round the card between, on seats further out, instead of staying a chord through it`

### AC-2: すでに回れていた組は変わらない

- [x] AT-B: 中央付近に空いた席がある組は、従来どおり中央に近い順で最初に空いた席を使う

  > ✅ Automated — `packages/core/src/renderer/edge-routing-same-row.test.ts` › `same-row route when the seats beside each card's centre are taken (#3309)` › `keeps the near seats for a pair that has one free, so no route that cleared before moves`

- [x] AT-C: `examples/` の全モデルと既存の routing fence・スナップショットが無変更で通る

  > ✅ Automated — `pnpm --filter @karasu-tools/core test`

## 手動確認

N/A — 自動テストですべて覆っている。
